import {
  authPayload,
  KEEPALIVE_PING,
  PROTOCOL_VERSION,
  parseServerFrame,
  type ErrorCode,
} from '@shared/social-protocol';
import type { Identity } from './identity';

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 15_000;
const KEEPALIVE_MS = 25_000;
/** Close codes from the server ≥ this mean "do not try again" (see server/src/common.ts). */
const CLOSE_FINAL = 4100;
/** Errors after which reconnecting makes no sense. */
const FINAL_ERRORS: ReadonlySet<string> = new Set<ErrorCode>([
  'bad-sig',
  'old-client',
  'ended',
  'kicked',
  'not-invited',
  'full',
]);

export type SocketState = 'connecting' | 'online' | 'offline';

export interface SocketOptions<In extends { t: string }> {
  url: string;
  /** `hub` or the party id; part of what is signed. */
  target: string;
  identity: Identity;
  name: () => string;
  /** Extra fields of the auth message (ticket, create). */
  authExtra?: () => Record<string, unknown>;
  onMessage(msg: In): void;
  onState(state: SocketState): void;
  /** The server refused us for good (or closed with a final code). */
  onFinal(reason: string): void;
}

/**
 * One WebSocket to the relay with login (signed challenge), keep-alive and
 * reconnecting with backoff. Online once the server answered the login
 * (`ready` from the hub, `welcome` from a party).
 */
export class SocialSocket<In extends { t: string }> {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private keepAlive: NodeJS.Timeout | null = null;
  private state: SocketState = 'offline';
  /** Last frame from the server; a silent connection is dropped and rebuilt. */
  private lastSeen = 0;

  constructor(private readonly opts: SocketOptions<In>) {}

  get online(): boolean {
    return this.state === 'online';
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearKeepAlive();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, 'bye');
    this.setState('offline');
  }

  /** Sends a protocol message; dropped while not connected. */
  send(msg: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.state !== 'online') return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Reconnect right away (e.g. after the system woke up). */
  reconnectNow(): void {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    if (!this.ws) this.connect();
  }

  private setState(state: SocketState): void {
    if (state === this.state) return;
    this.state = state;
    this.opts.onState(state);
  }

  private connect(): void {
    this.setState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    let finalReason: string | null = null;

    ws.addEventListener('message', (event) => {
      if (this.ws !== ws || typeof event.data !== 'string') return;
      this.lastSeen = Date.now();
      if (event.data === 'pong') return;
      const msg = parseServerFrame<In & { t: string }>(event.data);
      if (!msg) return;
      if (msg.t === 'challenge') {
        const nonce = (msg as unknown as { nonce?: unknown }).nonce;
        if (typeof nonce !== 'string') return;
        ws.send(
          JSON.stringify({
            t: 'auth',
            v: PROTOCOL_VERSION,
            userId: this.opts.identity.id,
            name: this.opts.name(),
            sig: this.opts.identity.sign(authPayload(this.opts.target, nonce)),
            ...this.opts.authExtra?.(),
          }),
        );
        return;
      }
      if (msg.t === 'ready' || msg.t === 'welcome') {
        this.attempt = 0;
        this.setState('online');
        this.startKeepAlive(ws);
      }
      if (msg.t === 'error') {
        const code = (msg as unknown as { code?: unknown }).code;
        if (typeof code === 'string' && FINAL_ERRORS.has(code)) finalReason = code;
      }
      this.opts.onMessage(msg);
    });

    ws.addEventListener('close', (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearKeepAlive();
      if (this.stopped) return;
      const reason = finalReason ?? (event.code >= CLOSE_FINAL ? event.reason || 'closed' : null);
      if (reason) {
        this.stopped = true;
        this.setState('offline');
        this.opts.onFinal(reason);
        return;
      }
      this.scheduleRetry();
    });

    // 'error' is always followed by 'close'; nothing to do here.
    ws.addEventListener('error', () => {});
  }

  private scheduleRetry(): void {
    this.setState(this.attempt === 0 ? 'connecting' : 'offline');
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  private startKeepAlive(ws: WebSocket): void {
    this.clearKeepAlive();
    this.lastSeen = Date.now();
    this.keepAlive = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Nothing heard for two rounds (sleep, network change): start over.
      if (Date.now() - this.lastSeen > KEEPALIVE_MS * 2 + 5000) {
        // A dead link may take long to report its close, so do not wait for it.
        this.ws = null;
        this.clearKeepAlive();
        ws.close(4000, 'silent');
        this.scheduleRetry();
        return;
      }
      ws.send(KEEPALIVE_PING);
    }, KEEPALIVE_MS);
  }

  private clearKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }
}
