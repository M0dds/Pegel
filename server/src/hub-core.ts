import { makeFriendCode, normalizeFriendCode } from '../../src/shared/party-sync';
import {
  authPayload,
  CODE_TTL_MS,
  PENDING_TTL_MS,
  HUB_MIN_PROTOCOL,
  PROTOCOL_VERSION,
  parseHubClientMessage,
  type HubClientMessage,
  type HubServerMessage,
  type NowPlaying,
  type PartyPresence,
  type UserId,
} from '../../src/shared/social-protocol';
import { base64url, CLOSE_FINAL, CLOSE_RETRY, RateLimit, type Conn, type CoreDeps } from './common';

/**
 * Persistent part of the hub: only friend codes (≤ 24 h) and undelivered
 * "your code was redeemed" notices (≤ 30 days). Presence lives in memory.
 */
export interface HubStore {
  /** Replaces any earlier code of the same user. */
  putCode(rec: CodeRecord): void;
  getCode(code: string, now: number): CodeRecord | null;
  deleteCode(code: string): void;
  addPending(to: UserId, notice: { userId: UserId; name: string }, expiresAt: number): void;
  takePending(to: UserId, now: number): { userId: UserId; name: string }[];
}

export interface CodeRecord {
  code: string;
  userId: UserId;
  name: string;
  expiresAt: number;
}

export class MemoryHubStore implements HubStore {
  codes = new Map<string, CodeRecord>();
  pending = new Map<UserId, { userId: UserId; name: string; expiresAt: number }[]>();

  putCode(rec: CodeRecord): void {
    for (const [code, other] of this.codes)
      if (other.userId === rec.userId) this.codes.delete(code);
    this.codes.set(rec.code, rec);
  }
  getCode(code: string, now: number): CodeRecord | null {
    const rec = this.codes.get(code);
    return rec && rec.expiresAt > now ? rec : null;
  }
  deleteCode(code: string): void {
    this.codes.delete(code);
  }
  addPending(to: UserId, notice: { userId: UserId; name: string }, expiresAt: number): void {
    const list = this.pending.get(to) ?? [];
    list.push({ ...notice, expiresAt });
    this.pending.set(to, list);
  }
  takePending(to: UserId, now: number): { userId: UserId; name: string }[] {
    const list = this.pending.get(to) ?? [];
    this.pending.delete(to);
    return list.filter((n) => n.expiresAt > now).map(({ userId, name }) => ({ userId, name }));
  }
}

interface ConnState {
  nonce: string;
  userId?: UserId;
  limit: RateLimit;
  /** Serialises async handling (signature checks) per connection. */
  queue: Promise<void>;
}

/** One online user (normally one connection; briefly two while reconnecting). */
interface UserRecord {
  name: string;
  conns: Set<Conn>;
  friends: Set<UserId>;
  shareNowPlaying: boolean;
  nowPlaying: NowPlaying | null;
  party: PartyPresence | null;
  codeTimes: number[];
  redeemTimes: number[];
}

/**
 * What survives hibernation on the socket itself (no storage): who it is and
 * whom it lists as friends, shortened to 66-bit prefixes so the list fits the
 * 2 KB attachment. Without it a message that wakes the hub would be checked
 * against an empty friend list.
 */
export interface HubAttachment {
  userId: UserId;
  name: string;
  friends: string[];
  share: boolean;
}

const FRIEND_PREFIX = 11;
const ATTACHMENT_FRIENDS = 150;

const CODE_CREATE_LIMIT = 10; // per hour
const REDEEM_LIMIT = 10; // per 10 minutes
const MESSAGES_PER_SECOND = 20;

/**
 * Presence, friend codes and invites. Presence only flows between mutual
 * friends: Y sees X only if each has the other in the list it sent with
 * `hello`. Friend lists exist only in memory, while connected.
 */
export class HubCore {
  private conns = new Map<Conn, ConnState>();
  private users = new Map<UserId, UserRecord>();

  constructor(
    private readonly store: HubStore,
    private readonly deps: CoreDeps,
  ) {}

  open(conn: Conn): void {
    const nonce = base64url(this.deps.randomBytes(18));
    this.conns.set(conn, this.newState(nonce));
    this.send(conn, { t: 'challenge', nonce, serverTime: this.deps.now(), v: PROTOCOL_VERSION });
  }

  /**
   * After hibernation the socket survives but memory is gone: the user is
   * known again from the socket attachment and asked for hello and presence.
   */
  restore(conn: Conn, att: HubAttachment): void {
    const state = this.newState('');
    state.userId = att.userId;
    this.conns.set(conn, state);
    this.attachUser(conn, att.userId, att.name);
    const user = this.users.get(att.userId)!;
    user.friends = new Set(att.friends);
    user.shareNowPlaying = att.share;
    this.send(conn, { t: 'resync' });
  }

  message(conn: Conn, raw: unknown, persist?: (att: HubAttachment) => void): Promise<void> {
    const state = this.conns.get(conn);
    if (!state) return Promise.resolve();
    state.queue = state.queue.then(() => this.handle(conn, state, raw, persist)).catch(() => {});
    return state.queue;
  }

  close(conn: Conn): void {
    const state = this.conns.get(conn);
    this.conns.delete(conn);
    if (!state?.userId) return;
    const user = this.users.get(state.userId);
    if (!user) return;
    user.conns.delete(conn);
    if (user.conns.size > 0) return;
    // Last connection gone: friends see this user offline.
    for (const friend of this.visibleTo(state.userId)) {
      this.sendUser(friend, this.offlinePresence(state.userId, user.name));
    }
    this.users.delete(state.userId);
  }

  /** For tests and diagnostics. */
  get onlineCount(): number {
    return this.users.size;
  }

  private newState(nonce: string): ConnState {
    return {
      nonce,
      limit: new RateLimit(MESSAGES_PER_SECOND, this.deps.now),
      queue: Promise.resolve(),
    };
  }

  private async handle(
    conn: Conn,
    state: ConnState,
    raw: unknown,
    persist?: (att: HubAttachment) => void,
  ): Promise<void> {
    if (!state.limit.take()) {
      this.send(conn, { t: 'error', code: 'rate-limit' });
      conn.close(CLOSE_RETRY, 'rate-limit');
      return;
    }
    const msg = parseHubClientMessage(raw);
    if (!msg) return this.send(conn, { t: 'error', code: 'bad-message' });
    if (!state.userId) {
      if (msg.t !== 'auth') return this.send(conn, { t: 'error', code: 'bad-message', op: msg.t });
      await this.auth(conn, state, msg);
      if (state.userId) persist?.(this.attachment(state.userId));
      return;
    }
    if (msg.t === 'auth') return;
    this.handleAuthed(conn, state.userId, msg);
    if (msg.t === 'hello') persist?.(this.attachment(state.userId));
  }

  private attachment(userId: UserId): HubAttachment {
    const user = this.users.get(userId)!;
    return {
      userId,
      name: user.name,
      friends: [...user.friends].slice(0, ATTACHMENT_FRIENDS).map((f) => f.slice(0, FRIEND_PREFIX)),
      share: user.shareNowPlaying,
    };
  }

  private async auth(
    conn: Conn,
    state: ConnState,
    msg: Extract<HubClientMessage, { t: 'auth' }>,
  ): Promise<void> {
    if (msg.v < HUB_MIN_PROTOCOL) {
      this.send(conn, { t: 'error', code: 'old-client' });
      return conn.close(CLOSE_FINAL, 'old-client');
    }
    if (
      !state.nonce ||
      !(await this.deps.verify(msg.userId, authPayload('hub', state.nonce), msg.sig))
    ) {
      this.send(conn, { t: 'error', code: 'bad-sig' });
      return conn.close(CLOSE_FINAL, 'bad-sig');
    }
    if (!this.conns.has(conn)) return; // closed while verifying
    state.userId = msg.userId;
    state.nonce = '';
    this.attachUser(conn, msg.userId, msg.name);
    this.send(conn, { t: 'ready', serverTime: this.deps.now() });
    for (const notice of this.store.takePending(msg.userId, this.deps.now())) {
      this.send(conn, { t: 'friend.added', ...notice });
    }
  }

  private attachUser(conn: Conn, userId: UserId, name: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.conns.add(conn);
      if (user.name !== name) {
        user.name = name;
        this.broadcastPresence(userId);
      }
      return;
    }
    this.users.set(userId, {
      name,
      conns: new Set([conn]),
      friends: new Set(),
      shareNowPlaying: true,
      nowPlaying: null,
      party: null,
      codeTimes: [],
      redeemTimes: [],
    });
  }

  private handleAuthed(conn: Conn, userId: UserId, msg: HubClientMessage): void {
    const user = this.users.get(userId);
    if (!user) return;
    const now = this.deps.now();
    switch (msg.t) {
      case 'hello': {
        const before = new Set(this.visibleTo(userId));
        user.friends = new Set(msg.friends.filter((f) => f !== userId));
        user.shareNowPlaying = msg.share.nowPlaying;
        const after = new Set(this.visibleTo(userId));
        for (const friend of before) {
          if (after.has(friend)) continue;
          // No longer mutual: both sides see the other as offline.
          this.sendUser(friend, this.offlinePresence(userId, user.name));
          const other = this.users.get(friend);
          if (other) this.send(conn, this.offlinePresence(friend, other.name));
        }
        for (const friend of after) {
          this.sendUser(friend, this.presenceOf(userId));
          this.send(conn, this.presenceOf(friend));
        }
        break;
      }
      case 'presence':
        user.nowPlaying = msg.nowPlaying;
        user.party = msg.party;
        this.broadcastPresence(userId);
        break;
      case 'code.create': {
        user.codeTimes = user.codeTimes.filter((t) => now - t < 60 * 60 * 1000);
        if (user.codeTimes.length >= CODE_CREATE_LIMIT) {
          return this.send(conn, { t: 'error', code: 'rate-limit', op: msg.t });
        }
        user.codeTimes.push(now);
        const code = makeFriendCode(this.deps.randomBytes(8));
        const expiresAt = now + CODE_TTL_MS;
        this.store.putCode({ code, userId, name: user.name, expiresAt });
        this.send(conn, { t: 'code', code, expiresAt });
        break;
      }
      case 'code.redeem': {
        user.redeemTimes = user.redeemTimes.filter((t) => now - t < 10 * 60 * 1000);
        if (user.redeemTimes.length >= REDEEM_LIMIT) {
          return this.send(conn, { t: 'error', code: 'rate-limit', op: msg.t });
        }
        user.redeemTimes.push(now);
        const code = normalizeFriendCode(msg.code);
        const rec = code ? this.store.getCode(code, now) : null;
        if (!rec) return this.send(conn, { t: 'error', code: 'invalid-code', op: msg.t });
        if (rec.userId === userId)
          return this.send(conn, { t: 'error', code: 'own-code', op: msg.t });
        this.store.deleteCode(rec.code);
        const creator = this.users.get(rec.userId);
        this.send(conn, { t: 'friend.added', userId: rec.userId, name: creator?.name ?? rec.name });
        const notice = { userId, name: user.name };
        if (creator) this.sendUser(rec.userId, { t: 'friend.added', ...notice });
        else this.store.addPending(rec.userId, notice, now + PENDING_TTL_MS);
        break;
      }
      case 'invite': {
        // Only the host's own tickets for this very friend.
        if (msg.ticket.host !== userId || msg.ticket.guest !== msg.to) {
          return this.send(conn, { t: 'error', code: 'bad-message', op: msg.t });
        }
        if (!this.canReach(userId, msg.to, conn, msg.t)) return;
        this.sendUser(msg.to, {
          t: 'invite',
          inviteId: base64url(this.deps.randomBytes(9)),
          from: userId,
          name: user.name,
          ticket: msg.ticket,
          nowPlaying: user.shareNowPlaying ? user.nowPlaying : null,
          ...(msg.reply && { reply: true }),
        });
        break;
      }
      case 'invite.decline':
        if (!this.canReach(userId, msg.to, conn, msg.t)) return;
        this.sendUser(msg.to, { t: 'invite.declined', from: userId, name: user.name });
        break;
      case 'join.request':
        if (!this.canReach(userId, msg.to, conn, msg.t)) return;
        this.sendUser(msg.to, {
          t: 'join.request',
          from: userId,
          name: user.name,
          partyId: msg.partyId,
        });
        break;
    }
  }

  private canReach(from: UserId, to: UserId, conn: Conn, op: string): boolean {
    if (!this.users.has(to)) {
      this.send(conn, { t: 'error', code: 'offline', op });
      return false;
    }
    if (!this.mutual(from, to)) {
      this.send(conn, { t: 'error', code: 'not-friends', op });
      return false;
    }
    return true;
  }

  private mutual(a: UserId, b: UserId): boolean {
    const ua = this.users.get(a);
    const ub = this.users.get(b);
    return !!ua && !!ub && lists(ua.friends, b) && lists(ub.friends, a);
  }

  /** Online users that see `userId` (and whom it sees). */
  private visibleTo(userId: UserId): UserId[] {
    if (!this.users.has(userId)) return [];
    return [...this.users.keys()].filter((other) => other !== userId && this.mutual(userId, other));
  }

  private presenceOf(userId: UserId): HubServerMessage {
    const user = this.users.get(userId)!;
    return {
      t: 'presence',
      userId,
      name: user.name,
      online: true,
      nowPlaying: user.shareNowPlaying ? user.nowPlaying : null,
      party: user.party,
    };
  }

  private offlinePresence(userId: UserId, name: string): HubServerMessage {
    return { t: 'presence', userId, name, online: false, nowPlaying: null, party: null };
  }

  private broadcastPresence(userId: UserId): void {
    for (const friend of this.visibleTo(userId)) this.sendUser(friend, this.presenceOf(userId));
  }

  private sendUser(userId: UserId, msg: HubServerMessage): void {
    for (const conn of this.users.get(userId)?.conns ?? []) this.send(conn, msg);
  }

  private send(conn: Conn, msg: HubServerMessage): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // Socket already gone; its close event cleans up.
    }
  }
}

/** Full ids after `hello`, 66-bit prefixes right after waking from hibernation. */
function lists(friends: Set<string>, id: UserId): boolean {
  return friends.has(id) || friends.has(id.slice(0, FRIEND_PREFIX));
}
