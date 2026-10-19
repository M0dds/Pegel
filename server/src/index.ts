/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { isPartyId, KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/social-protocol';
import { defaultDeps, type Conn } from './common';
import { HubCore, type CodeRecord, type HubAttachment, type HubStore } from './hub-core';
import { PartyCore, type PartyAttachment } from './party-core';

/**
 * Pegel friends & party relay. Two Durable Object classes, both created in
 * the EU jurisdiction:
 *   /hub          → the one Hub (presence, friend codes, invites)
 *   /party/<id>   → one Party per listening party
 * Both use WebSocket hibernation; the cores keep their state in memory only.
 */

interface Env {
  HUB: DurableObjectNamespace<Hub>;
  PARTY: DurableObjectNamespace<Party>;
  /** "eu" in production; local workerd has no jurisdictions (`npm run dev` passes "none"). */
  JURISDICTION: string;
}

function inJurisdiction<T extends Rpc.DurableObjectBranded | undefined>(
  ns: DurableObjectNamespace<T>,
  env: Env,
): DurableObjectNamespace<T> {
  return env.JURISDICTION === 'none'
    ? ns
    : ns.jurisdiction(env.JURISDICTION as DurableObjectJurisdiction);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      // Only the error, never message contents.
      console.error('relay error', error instanceof Error ? error.message : String(error));
      return new Response('Internal error', { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response('Pegel social relay\n', { headers: { 'content-type': 'text/plain' } });
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket expected', { status: 426 });
  }
  if (url.pathname === '/hub') {
    const ns = inJurisdiction(env.HUB, env);
    return ns.get(ns.idFromName('main')).fetch(request);
  }
  const match = /^\/party\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (match && isPartyId(match[1])) {
    const ns = inJurisdiction(env.PARTY, env);
    return ns.get(ns.idFromName(match[1])).fetch(request);
  }
  return new Response('Not found', { status: 404 });
}

/** Wraps a hibernatable WebSocket for the cores; one wrapper per socket. */
function connFor(ws: WebSocket, cache: WeakMap<WebSocket, Conn>): Conn {
  let conn = cache.get(ws);
  if (!conn) {
    conn = {
      send: (text) => ws.send(text),
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          // already closed
        }
      },
    };
    cache.set(ws, conn);
  }
  return conn;
}

function upgrade(ctx: DurableObjectState): { client: WebSocket; server: WebSocket } {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  ctx.acceptWebSocket(server);
  return { client, server };
}

/** Friend codes and undelivered notices in the Hub's SQLite storage. */
class SqlHubStore implements HubStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS codes (
      code TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pending (
      to_user TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
  }

  purge(now: number): void {
    this.sql.exec('DELETE FROM codes WHERE expires_at <= ?', now);
    this.sql.exec('DELETE FROM pending WHERE expires_at <= ?', now);
  }

  putCode(rec: CodeRecord): void {
    this.sql.exec('DELETE FROM codes WHERE user_id = ?', rec.userId);
    this.sql.exec(
      'INSERT OR REPLACE INTO codes (code, user_id, name, expires_at) VALUES (?, ?, ?, ?)',
      rec.code,
      rec.userId,
      rec.name,
      rec.expiresAt,
    );
  }

  getCode(code: string, now: number): CodeRecord | null {
    const row = this.sql
      .exec<{ code: string; user_id: string; name: string; expires_at: number }>(
        'SELECT code, user_id, name, expires_at FROM codes WHERE code = ? AND expires_at > ?',
        code,
        now,
      )
      .toArray()[0];
    return row
      ? { code: row.code, userId: row.user_id, name: row.name, expiresAt: row.expires_at }
      : null;
  }

  deleteCode(code: string): void {
    this.sql.exec('DELETE FROM codes WHERE code = ?', code);
  }

  addPending(to: string, notice: { userId: string; name: string }, expiresAt: number): void {
    this.sql.exec(
      'INSERT INTO pending (to_user, user_id, name, expires_at) VALUES (?, ?, ?, ?)',
      to,
      notice.userId,
      notice.name,
      expiresAt,
    );
  }

  takePending(to: string, now: number): { userId: string; name: string }[] {
    const rows = this.sql
      .exec<{ user_id: string; name: string }>(
        'SELECT user_id, name FROM pending WHERE to_user = ? AND expires_at > ?',
        to,
        now,
      )
      .toArray();
    this.sql.exec('DELETE FROM pending WHERE to_user = ?', to);
    return rows.map((r) => ({ userId: r.user_id, name: r.name }));
  }
}

const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export class Hub extends DurableObject<Env> {
  private readonly core: HubCore;
  private readonly store: SqlHubStore;
  private readonly conns = new WeakMap<WebSocket, Conn>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlHubStore(ctx.storage.sql);
    this.core = new HubCore(this.store, defaultDeps);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
    // Woken from hibernation: sockets are still there, memory is not.
    for (const ws of ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as HubAttachment | null;
      if (att?.userId && att.name && Array.isArray(att.friends)) {
        this.core.restore(connFor(ws, this.conns), att);
      } else ws.close(4000, 'restart');
    }
  }

  override async fetch(): Promise<Response> {
    const { client, server } = upgrade(this.ctx);
    this.core.open(connFor(server, this.conns));
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + PURGE_INTERVAL_MS);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.core.message(connFor(ws, this.conns), message, (att) => ws.serializeAttachment(att));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.core.close(connFor(ws, this.conns));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.core.close(connFor(ws, this.conns));
  }

  /** Hourly clean-up of expired codes and notices. */
  override async alarm(): Promise<void> {
    this.store.purge(Date.now());
    await this.ctx.storage.setAlarm(Date.now() + PURGE_INTERVAL_MS);
  }
}

export class Party extends DurableObject<Env> {
  private core: PartyCore | null = null;
  private readonly conns = new WeakMap<WebSocket, Conn>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_PING, KEEPALIVE_PONG));
  }

  /** The party id is only known from the request URL; after hibernation from the tag. */
  private ensureCore(partyId: string): PartyCore {
    if (this.core) return this.core;
    const core = new PartyCore(partyId, defaultDeps, (conn, att) => {
      for (const ws of this.ctx.getWebSockets()) {
        if (this.conns.get(ws) === conn) ws.serializeAttachment(att);
      }
    });
    this.core = core;
    const sockets = this.ctx.getWebSockets();
    let restored = 0;
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as PartyAttachment | null;
      if (att?.userId) {
        core.restore(connFor(ws, this.conns), att);
        restored++;
      }
    }
    if (restored) core.resyncAll();
    return core;
  }

  /** After hibernation the core is rebuilt from the first socket's tag. */
  private coreFromSockets(): PartyCore | null {
    if (this.core) return this.core;
    const tag = this.ctx.getWebSockets().flatMap((ws) => this.ctx.getTags(ws))[0];
    return tag ? this.ensureCore(tag) : null;
  }

  override async fetch(request: Request): Promise<Response> {
    const partyId = new URL(request.url).pathname.split('/').pop() ?? '';
    const core = this.ensureCore(partyId);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [partyId]);
    core.open(connFor(server, this.conns));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const core = this.coreFromSockets();
    if (!core) return;
    await core.message(connFor(ws, this.conns), message);
    await this.scheduleAlarm(core);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const core = this.coreFromSockets();
    if (!core) return;
    core.close(connFor(ws, this.conns));
    await this.scheduleAlarm(core);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  override async alarm(): Promise<void> {
    const core = this.coreFromSockets();
    if (!core) return;
    core.tick();
    await this.scheduleAlarm(core);
  }

  private async scheduleAlarm(core: PartyCore): Promise<void> {
    const next = core.nextDeadline();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}
