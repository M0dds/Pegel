import {
  authPayload,
  IN_SYNC_SUMMARY_MS,
  MAX_SUGGESTIONS,
  MAX_SUGGESTIONS_PER_MEMBER,
  PARTY_MAX_MEMBERS,
  PARTY_MIN_PROTOCOL,
  PROTOCOL_VERSION,
  MAX_QUEUE,
  MAX_QUEUE_PER_MEMBER,
  RECONNECT_GRACE_MS,
  parsePartyClientMessage,
  ticketPayload,
  type ErrorCode,
  type Member,
  type MemberStatus,
  type PartyClientMessage,
  type PartyEndReason,
  type PartyOptions,
  type PartyPlayback,
  type PartyServerMessage,
  type QueueItem,
  type SuggestedTrack,
  type Suggestion,
  type UserId,
} from '../../src/shared/social-protocol';
import { base64url, CLOSE_FINAL, RateLimit, type Conn, type CoreDeps } from './common';

/** Kept on the socket (survives hibernation, not stored anywhere else). */
export interface PartyAttachment {
  userId: UserId;
  name: string;
  joinedAt: number;
  host: boolean;
}

interface ConnState {
  nonce: string;
  userId?: UserId;
  limit: RateLimit;
  queue: Promise<void>;
}

interface MemberRecord {
  userId: UserId;
  name: string;
  joinedAt: number;
  conn: Conn | null;
  status: MemberStatus | null;
  /** Set while the connection is lost: removed at this time. */
  graceUntil: number | null;
  /** Last status summary that was broadcast. */
  summary: string;
}

const MESSAGES_PER_SECOND = 30;

/**
 * One listening party. The host sends its playback; the core passes it on to
 * every guest, answers clock pings and keeps the member list. Everything is
 * in memory and gone when the party ends.
 */
export class PartyCore {
  private conns = new Map<Conn, ConnState>();
  private members = new Map<UserId, MemberRecord>();
  private hostId: UserId | null = null;
  /** Everyone who was host: their tickets stay valid after a handover. */
  private issuers = new Set<UserId>();
  private kicked = new Set<UserId>();
  private playback: PartyPlayback | null = null;
  private playbackFrom: UserId | null = null;
  private options: PartyOptions = { open: true, allowSuggestions: true, everyoneControls: true };
  private suggestions: Suggestion[] = [];
  private queue: QueueItem[] = [];
  private ended: PartyEndReason | null = null;

  constructor(
    private readonly partyId: string,
    private readonly deps: CoreDeps,
    /** Called when a socket's attachment must change (login, host change). */
    private readonly persist: (conn: Conn, attachment: PartyAttachment) => void = () => {},
  ) {}

  open(conn: Conn): void {
    const nonce = base64url(this.deps.randomBytes(18));
    this.conns.set(conn, this.newState(nonce));
    this.send(conn, { t: 'challenge', nonce, serverTime: this.deps.now(), v: PROTOCOL_VERSION });
  }

  /** After hibernation: rebuild members from the socket attachments. */
  restore(conn: Conn, att: PartyAttachment): void {
    const state = this.newState('');
    state.userId = att.userId;
    this.conns.set(conn, state);
    this.members.set(att.userId, {
      userId: att.userId,
      name: att.name,
      joinedAt: att.joinedAt,
      conn,
      status: null,
      graceUntil: null,
      summary: '',
    });
    if (att.host) {
      this.hostId = att.userId;
      this.issuers.add(att.userId);
    }
  }

  /** After all restores: everyone sends what the server forgot (the host its state). */
  resyncAll(): void {
    this.broadcast({ t: 'resync' });
  }

  message(conn: Conn, raw: unknown): Promise<void> {
    const state = this.conns.get(conn);
    if (!state) return Promise.resolve();
    state.queue = state.queue.then(() => this.handle(conn, state, raw)).catch(() => {});
    return state.queue;
  }

  /** Socket closed without "leave": the member may come back within the grace time. */
  close(conn: Conn): void {
    const state = this.conns.get(conn);
    this.conns.delete(conn);
    if (!state?.userId) return;
    const member = this.members.get(state.userId);
    if (!member || member.conn !== conn) return;
    member.conn = null;
    member.graceUntil = this.deps.now() + RECONNECT_GRACE_MS;
    this.broadcast({ t: 'member', member: this.view(member) });
  }

  /** Earliest time `tick` has something to do (for the Durable Object alarm). */
  nextDeadline(): number | null {
    let next: number | null = null;
    for (const m of this.members.values()) {
      if (m.graceUntil !== null && (next === null || m.graceUntil < next)) next = m.graceUntil;
    }
    return next;
  }

  /** Removes members whose grace time is over; hands the host on if needed. */
  tick(now = this.deps.now()): void {
    for (const m of [...this.members.values()]) {
      if (m.graceUntil !== null && m.graceUntil <= now) this.remove(m.userId, 'timeout');
    }
  }

  get isEnded(): boolean {
    return this.ended !== null;
  }

  get memberCount(): number {
    return this.members.size;
  }

  get currentHost(): UserId | null {
    return this.hostId;
  }

  private newState(nonce: string): ConnState {
    return {
      nonce,
      limit: new RateLimit(MESSAGES_PER_SECOND, this.deps.now),
      queue: Promise.resolve(),
    };
  }

  private async handle(conn: Conn, state: ConnState, raw: unknown): Promise<void> {
    if (!state.limit.take()) return; // flood: drop silently
    const msg = parsePartyClientMessage(raw);
    if (!msg) return this.send(conn, { t: 'error', code: 'bad-message' });
    if (!state.userId) {
      if (msg.t !== 'auth') return this.send(conn, { t: 'error', code: 'bad-message', op: msg.t });
      return this.auth(conn, state, msg);
    }
    if (msg.t === 'auth') return;
    this.handleMember(conn, state.userId, msg);
  }

  private fail(conn: Conn, code: ErrorCode): void {
    this.send(conn, { t: 'error', code });
    conn.close(CLOSE_FINAL, code);
    this.conns.delete(conn);
  }

  private async auth(
    conn: Conn,
    state: ConnState,
    msg: Extract<PartyClientMessage, { t: 'auth' }>,
  ): Promise<void> {
    const now = this.deps.now();
    if (msg.v < PARTY_MIN_PROTOCOL) return this.fail(conn, 'old-client');
    const signed = await this.deps.verify(
      msg.userId,
      authPayload(this.partyId, state.nonce),
      msg.sig,
    );
    if (!signed) return this.fail(conn, 'bad-sig');
    if (!this.conns.has(conn)) return;
    if (this.ended) return this.fail(conn, 'ended');
    if (this.kicked.has(msg.userId)) return this.fail(conn, 'kicked');

    const existing = this.members.get(msg.userId);
    if (!existing) {
      const creating = msg.create && this.hostId === null && this.members.size === 0;
      if (!creating) {
        // A party without host is one the server forgot (or never had).
        if (this.hostId === null && this.members.size === 0) return this.fail(conn, 'ended');
        const t = msg.ticket;
        const valid =
          !!t &&
          t.partyId === this.partyId &&
          t.guest === msg.userId &&
          t.exp > now &&
          this.issuers.has(t.host) &&
          (await this.deps.verify(t.host, ticketPayload(t.partyId, t.guest, t.exp), t.sig));
        if (!valid) return this.fail(conn, 'not-invited');
        if (!this.conns.has(conn)) return;
        if (this.members.size >= PARTY_MAX_MEMBERS) return this.fail(conn, 'full');
      } else {
        this.hostId = msg.userId;
        this.issuers.add(msg.userId);
        this.options = msg.create!;
      }
    }

    state.userId = msg.userId;
    state.nonce = '';
    let member = this.members.get(msg.userId);
    if (member) {
      // Back after a dropout (or a second socket): the newest connection wins.
      const old = member.conn;
      member.conn = conn;
      member.graceUntil = null;
      member.name = msg.name;
      if (old && old !== conn) {
        this.conns.delete(old);
        old.close(CLOSE_FINAL, 'replaced');
      }
    } else {
      member = {
        userId: msg.userId,
        name: msg.name,
        joinedAt: now,
        conn,
        status: null,
        graceUntil: null,
        summary: '',
      };
      this.members.set(msg.userId, member);
    }
    // A party whose host timed out while nobody was connected gets one again.
    if (this.hostId === null) this.setHost(msg.userId);
    this.persistMember(member);

    this.send(conn, {
      t: 'welcome',
      you: msg.userId,
      hostId: this.hostId!,
      members: [...this.members.values()].map((m) => this.view(m)),
      state: this.playback,
      options: this.options,
      suggestions: this.suggestions,
      queue: this.queue,
      serverTime: this.deps.now(),
    });
    this.broadcast({ t: 'member', member: this.view(member) }, conn);
  }

  private handleMember(conn: Conn, userId: UserId, msg: PartyClientMessage): void {
    const member = this.members.get(userId);
    if (!member || member.conn !== conn) return;
    const isHost = userId === this.hostId;
    switch (msg.t) {
      case 'ping':
        this.send(conn, { t: 'pong', c0: msg.c0, s: this.deps.now() });
        break;
      case 'state': {
        if (!isHost) return;
        const prev = this.playback;
        // A new host starts its own sequence.
        if (prev && this.playbackFrom === userId && msg.state.seq <= prev.seq) return;
        this.playback = msg.state;
        this.playbackFrom = userId;
        this.broadcast({ t: 'state', state: msg.state }, conn);
        break;
      }
      case 'status': {
        member.status = msg.status;
        const summary = statusSummary(msg.status);
        if (summary === member.summary) return;
        member.summary = summary;
        this.broadcast({ t: 'member', member: this.view(member) });
        break;
      }
      case 'suggest': {
        if (isHost || !this.options.allowSuggestions) return;
        const own = this.suggestions.filter((s) => s.from === userId);
        if (
          own.length >= MAX_SUGGESTIONS_PER_MEMBER ||
          this.suggestions.length >= MAX_SUGGESTIONS
        ) {
          return this.send(conn, { t: 'error', code: 'rate-limit', op: 'suggest' });
        }
        if (own.some((s) => s.videoId === msg.track.videoId)) return;
        this.suggestions.push({
          id: base64url(this.deps.randomBytes(9)),
          from: userId,
          fromName: member.name,
          ...msg.track,
        });
        this.broadcast({ t: 'suggestions', suggestions: this.suggestions });
        break;
      }
      case 'suggest.answer': {
        if (!isHost) return;
        const suggestion = this.suggestions.find((s) => s.id === msg.id);
        if (!suggestion) return;
        this.suggestions = this.suggestions.filter((s) => s.id !== msg.id);
        this.broadcast({ t: 'suggestions', suggestions: this.suggestions });
        // Accepted suggestions join the queue in the name of who suggested them.
        if (msg.accept) this.enqueue(suggestion.from, suggestion.fromName, suggestion);
        break;
      }
      case 'queue.add': {
        if (!isHost && !this.options.everyoneControls) return;
        const own = this.queue.filter((q) => q.by === userId).length;
        if (own >= MAX_QUEUE_PER_MEMBER || this.queue.length >= MAX_QUEUE) {
          return this.send(conn, { t: 'error', code: 'rate-limit', op: 'queue.add' });
        }
        if (this.enqueue(userId, member.name, msg.track)) {
          this.activity(userId, member.name, 'add', msg.track.title);
        }
        break;
      }
      case 'queue.remove': {
        const item = this.queue.find((q) => q.id === msg.id);
        if (!item || (!isHost && item.by !== userId)) return;
        this.queue = this.queue.filter((q) => q.id !== msg.id);
        this.broadcast({ t: 'queue', queue: this.queue });
        break;
      }
      case 'queue.move': {
        if (!isHost) return;
        const from = this.queue.findIndex((q) => q.id === msg.id);
        if (from < 0) return;
        const [item] = this.queue.splice(from, 1);
        this.queue.splice(Math.min(msg.index, this.queue.length), 0, item!);
        this.broadcast({ t: 'queue', queue: this.queue });
        break;
      }
      case 'queue.played': {
        // The host started the first queued track: it leaves the queue.
        if (!isHost) return;
        const before = this.queue.length;
        this.queue = this.queue.filter((q) => q.id !== msg.id);
        if (this.queue.length !== before) this.broadcast({ t: 'queue', queue: this.queue });
        break;
      }
      case 'control': {
        if (isHost || !this.options.everyoneControls || !this.hostId) return;
        const host = this.members.get(this.hostId);
        if (!host?.conn) return;
        this.send(host.conn, {
          t: 'control',
          action: msg.action,
          from: userId,
          ...(msg.positionMs !== undefined && { positionMs: msg.positionMs }),
        });
        this.activity(userId, member.name, msg.action, this.playback?.title);
        break;
      }
      case 'kick': {
        if (!isHost || msg.userId === userId) return;
        const target = this.members.get(msg.userId);
        if (!target) return;
        this.kicked.add(msg.userId);
        if (target.conn) {
          this.send(target.conn, { t: 'error', code: 'kicked' });
          this.conns.delete(target.conn);
          target.conn.close(CLOSE_FINAL, 'kicked');
        }
        this.remove(msg.userId, 'kicked');
        break;
      }
      case 'transfer': {
        if (!isHost || msg.userId === userId) return;
        const target = this.members.get(msg.userId);
        if (!target?.conn) return;
        this.setHost(msg.userId);
        this.persistMember(member);
        this.persistMember(target);
        break;
      }
      case 'options':
        if (!isHost) return;
        this.options = msg.options;
        if (!msg.options.allowSuggestions && this.suggestions.length) {
          this.suggestions = [];
          this.broadcast({ t: 'suggestions', suggestions: [] });
        }
        this.broadcast({ t: 'options', options: msg.options });
        break;
      case 'end':
        if (!isHost) return;
        this.end('host-ended');
        break;
      case 'leave':
        this.conns.delete(conn);
        this.remove(userId, 'left');
        conn.close(1000, 'left');
        break;
    }
  }

  /** Appends a track unless the same one is already waiting; true if added. */
  private enqueue(by: UserId, byName: string, track: SuggestedTrack): boolean {
    if (this.queue.some((q) => q.videoId === track.videoId)) return false;
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push({
      id: base64url(this.deps.randomBytes(9)),
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      by,
      byName,
    });
    this.broadcast({ t: 'queue', queue: this.queue });
    return true;
  }

  private activity(
    userId: UserId,
    name: string,
    action: 'play' | 'pause' | 'skip' | 'seek' | 'add',
    title?: string,
  ): void {
    this.broadcast({ t: 'activity', userId, name, action, ...(title && { title }) });
  }

  private remove(userId: UserId, reason: 'left' | 'kicked' | 'timeout'): void {
    if (!this.members.delete(userId)) return;
    const before = this.suggestions.length;
    this.suggestions = this.suggestions.filter((s) => s.from !== userId);
    this.broadcast({ t: 'member.left', userId, reason });
    if (this.suggestions.length !== before) {
      this.broadcast({ t: 'suggestions', suggestions: this.suggestions });
    }
    if (this.members.size === 0) return this.end('empty');
    if (userId === this.hostId) {
      // Longest connected member takes over; if nobody is connected, the first to return.
      const next = [...this.members.values()]
        .filter((m) => m.conn)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        this.setHost(next.userId);
        this.persistMember(next);
      } else {
        this.hostId = null;
      }
    }
  }

  private setHost(userId: UserId): void {
    this.hostId = userId;
    this.issuers.add(userId);
    this.broadcast({ t: 'host', hostId: userId });
  }

  private end(reason: PartyEndReason): void {
    this.ended = reason;
    this.broadcast({ t: 'ended', reason });
    for (const conn of [...this.conns.keys()]) conn.close(CLOSE_FINAL, 'ended');
    this.conns.clear();
    this.members.clear();
    this.suggestions = [];
    this.queue = [];
    this.playback = null;
    this.hostId = null;
  }

  private persistMember(member: MemberRecord): void {
    if (!member.conn) return;
    this.persist(member.conn, {
      userId: member.userId,
      name: member.name,
      joinedAt: member.joinedAt,
      host: member.userId === this.hostId,
    });
  }

  private view(m: MemberRecord): Member {
    return {
      userId: m.userId,
      name: m.name,
      conn: m.conn ? 'ok' : 'reconnecting',
      joinedAt: m.joinedAt,
      status: m.status,
    };
  }

  private broadcast(msg: PartyServerMessage, except?: Conn): void {
    const text = JSON.stringify(msg);
    for (const [conn, state] of this.conns) {
      if (conn === except || !state.userId) continue;
      try {
        conn.send(text);
      } catch {
        // gone; the close event cleans up
      }
    }
  }

  private send(conn: Conn, msg: PartyServerMessage): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // gone
    }
  }
}

/** What others need to know about a guest; tiny drift changes are not news. */
function statusSummary(s: MemberStatus): string {
  const sync = s.driftMs === null ? 'n' : Math.abs(s.driftMs) <= IN_SYNC_SUMMARY_MS ? 'y' : 'x';
  return [s.videoId, sync, s.ad, s.buffering, s.unplayable ?? '', s.localPause].join('|');
}
