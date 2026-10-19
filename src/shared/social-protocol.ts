/**
 * Wire protocol between Pegel and the friends/party server (`server/`).
 * Shared by both sides so they cannot drift apart. Every message is JSON
 * with a `t` (type) field. Times are server milliseconds unless noted.
 *
 * Nothing in here carries audio: a party only syncs which track plays, the
 * position and play/pause. Everyone plays through their own YT account.
 */

/** Bumped on incompatible changes; older clients get `old-client`. */
export const PROTOCOL_VERSION = 1;

export const PARTY_MAX_MEMBERS = 20;
export const NAME_MAX = 24;
/** Friend codes are valid this long and only once. */
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;
/** "X redeemed your code" waits this long for an offline code creator. */
export const PENDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Invites (and the tickets in them) expire after this. */
export const TICKET_TTL_MS = 10 * 60 * 1000;
/** A member who lost the connection stays in the party this long. */
export const RECONNECT_GRACE_MS = 60 * 1000;
export const MAX_SUGGESTIONS_PER_MEMBER = 5;
export const MAX_SUGGESTIONS = 50;
export const MAX_FRIENDS = 200;
/** A guest counts as "synchron" up to this drift (UI dot, member updates). */
export const IN_SYNC_SUMMARY_MS = 80;
/** Keep-alive text frame; the server answers `pong` without waking up. */
export const KEEPALIVE_PING = 'ping';
export const KEEPALIVE_PONG = 'pong';

/** Public Ed25519 key, raw 32 bytes as base64url (43 characters). */
export type UserId = string;

export const USER_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PARTY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,100}$/;
const SIG_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** What a friend is listening to (only while playing, only if shared). */
export interface NowPlaying {
  title: string;
  artist: string;
  videoId?: string;
}

export interface PartyPresence {
  partyId: string;
  /** Friends may join without an invite. */
  open: boolean;
}

/** Permission to join one party, signed by its (current or former) host. */
export interface Ticket {
  partyId: string;
  guest: UserId;
  /** Expiry, server time. */
  exp: number;
  /** Host's signature over `ticketPayload(...)`. */
  sig: string;
  /** Who signed it. */
  host: UserId;
}

export function ticketPayload(partyId: string, guest: UserId, exp: number): string {
  return `pegel-ticket:${partyId}:${guest}:${exp}`;
}

/** What the client signs to log in; `target` is `hub` or the party id. */
export function authPayload(target: string, nonce: string): string {
  return `pegel-auth:${target}:${nonce}`;
}

export interface PartyOptions {
  open: boolean;
  allowSuggestions: boolean;
}

/** The host's playback, as every guest should hear it. */
export interface PartyPlayback {
  /** Increases with every state the host sends; older ones are dropped. */
  seq: number;
  videoId: string;
  playlistId?: string;
  playing: boolean;
  /** Audible host position at `at` (output latency already taken out). */
  positionMs: number;
  /** Server time of that measurement. */
  at: number;
  title: string;
  artist: string;
  /** Why the party stands still although the host did not pause. */
  hold?: { kind: 'ads'; users: UserId[]; until: number } | { kind: 'host-ad' };
}

/** What a guest reports about itself. */
export interface MemberStatus {
  videoId: string | null;
  /** Own position minus the party's, null while not comparable (loading, ad). */
  driftMs: number | null;
  ad: boolean;
  buffering: boolean;
  /** YT's playability status if the party's track does not play here. */
  unplayable?: string;
  /** Paused on purpose (only for this guest, the party goes on). */
  localPause: boolean;
}

export interface Member {
  userId: UserId;
  name: string;
  conn: 'ok' | 'reconnecting';
  joinedAt: number;
  status: MemberStatus | null;
}

export interface SuggestedTrack {
  videoId: string;
  title: string;
  artist: string;
}

export interface Suggestion extends SuggestedTrack {
  id: string;
  from: UserId;
  fromName: string;
}

export type ErrorCode =
  | 'bad-message'
  | 'bad-sig'
  | 'old-client'
  | 'full'
  | 'not-invited'
  | 'ended'
  | 'kicked'
  | 'rate-limit'
  | 'invalid-code'
  | 'own-code'
  | 'not-friends'
  | 'offline';

// ---------- Messages ----------

/** Login, both for the hub and a party. */
export type AuthMessage = {
  t: 'auth';
  v: number;
  userId: UserId;
  name: string;
  sig: string;
  /** Party only: guests show a ticket (not needed to come back after a dropout). */
  ticket?: Ticket;
  /** Party only: the first connection creates the party and becomes host. */
  create?: PartyOptions;
};

export type HubClientMessage =
  | AuthMessage
  | { t: 'hello'; friends: UserId[]; share: { nowPlaying: boolean } }
  | { t: 'presence'; nowPlaying: NowPlaying | null; party: PartyPresence | null }
  | { t: 'code.create' }
  | { t: 'code.redeem'; code: string }
  | { t: 'invite'; to: UserId; ticket: Ticket; reply?: boolean }
  | { t: 'invite.decline'; to: UserId; partyId: string }
  | { t: 'join.request'; to: UserId; partyId: string };

export type HubServerMessage =
  | { t: 'challenge'; nonce: string; serverTime: number; v: number }
  | { t: 'ready'; serverTime: number }
  | { t: 'error'; code: ErrorCode; op?: string }
  /** Hub woke up without memory (hibernation): send hello and presence again. */
  | { t: 'resync' }
  | {
      t: 'presence';
      userId: UserId;
      name: string;
      online: boolean;
      nowPlaying: NowPlaying | null;
      party: PartyPresence | null;
    }
  | { t: 'code'; code: string; expiresAt: number }
  | { t: 'friend.added'; userId: UserId; name: string }
  | {
      t: 'invite';
      inviteId: string;
      from: UserId;
      name: string;
      ticket: Ticket;
      nowPlaying: NowPlaying | null;
      /** Answer to our own join request: join right away. */
      reply?: boolean;
    }
  | { t: 'invite.declined'; from: UserId; name: string }
  | { t: 'join.request'; from: UserId; name: string; partyId: string };

export type PartyClientMessage =
  | AuthMessage
  | { t: 'ping'; c0: number }
  | { t: 'state'; state: PartyPlayback }
  | { t: 'status'; status: MemberStatus }
  | { t: 'suggest'; track: SuggestedTrack }
  | { t: 'suggest.answer'; id: string; accept: boolean }
  | { t: 'kick'; userId: UserId }
  | { t: 'transfer'; userId: UserId }
  | { t: 'options'; options: PartyOptions }
  | { t: 'end' }
  | { t: 'leave' };

export type PartyEndReason = 'host-ended' | 'empty' | 'host-lost';

export type PartyServerMessage =
  | { t: 'challenge'; nonce: string; serverTime: number; v: number }
  | { t: 'error'; code: ErrorCode; op?: string }
  | { t: 'resync' }
  | { t: 'pong'; c0: number; s: number }
  | {
      t: 'welcome';
      you: UserId;
      hostId: UserId;
      members: Member[];
      state: PartyPlayback | null;
      options: PartyOptions;
      suggestions: Suggestion[];
      serverTime: number;
    }
  | { t: 'state'; state: PartyPlayback }
  | { t: 'member'; member: Member }
  | { t: 'member.left'; userId: UserId; reason: 'left' | 'kicked' | 'timeout' }
  | { t: 'suggestions'; suggestions: Suggestion[] }
  | { t: 'host'; hostId: UserId }
  | { t: 'options'; options: PartyOptions }
  | { t: 'ended'; reason: PartyEndReason };

// ---------- Validation (the server trusts nothing, the client checks too) ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const matches = (v: unknown, pattern: RegExp): v is string =>
  typeof v === 'string' && pattern.test(v);

export const isUserId = (v: unknown): v is UserId => matches(v, USER_ID_PATTERN);
export const isPartyId = (v: unknown): v is string => matches(v, PARTY_ID_PATTERN);
export const isVideoId = (v: unknown): v is string => matches(v, VIDEO_ID_PATTERN);

/** Trims and limits a display name; null if nothing usable is left. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // No control characters, collapsed whitespace.
  const name = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name ? [...name].slice(0, NAME_MAX).join('') : null;
}

function nowPlaying(v: unknown): NowPlaying | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isStr(v['title'], 300) || !isStr(v['artist'], 300)) return undefined;
  const result: NowPlaying = { title: v['title'], artist: v['artist'] };
  if (v['videoId'] !== undefined) {
    if (!isVideoId(v['videoId'])) return undefined;
    result.videoId = v['videoId'];
  }
  return result;
}

function partyPresence(v: unknown): PartyPresence | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isPartyId(v['partyId']) || !isBool(v['open'])) return undefined;
  return { partyId: v['partyId'], open: v['open'] };
}

export function toTicket(v: unknown): Ticket | null {
  if (!isObj(v)) return null;
  const { partyId, guest, exp, sig, host } = v;
  if (!isPartyId(partyId) || !isUserId(guest) || !isNum(exp) || !matches(sig, SIG_PATTERN)) {
    return null;
  }
  if (!isUserId(host)) return null;
  return { partyId, guest, exp, sig, host };
}

function options(v: unknown): PartyOptions | null {
  if (!isObj(v) || !isBool(v['open']) || !isBool(v['allowSuggestions'])) return null;
  return { open: v['open'], allowSuggestions: v['allowSuggestions'] };
}

function auth(v: Obj): AuthMessage | null {
  const name = cleanName(v['name']);
  if (!isNum(v['v']) || !isUserId(v['userId']) || !name || !matches(v['sig'], SIG_PATTERN)) {
    return null;
  }
  const msg: AuthMessage = { t: 'auth', v: v['v'], userId: v['userId'], name, sig: v['sig'] };
  if (v['ticket'] !== undefined) {
    const ticket = toTicket(v['ticket']);
    if (!ticket) return null;
    msg.ticket = ticket;
  }
  if (v['create'] !== undefined) {
    const create = options(v['create']);
    if (!create) return null;
    msg.create = create;
  }
  return msg;
}

function parseJson(raw: unknown): Obj | null {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isObj(value) && typeof value['t'] === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Parses a frame a client sent to the hub; null if invalid. */
export function parseHubClientMessage(raw: unknown): HubClientMessage | null {
  const v = parseJson(raw);
  if (!v) return null;
  switch (v['t']) {
    case 'auth':
      return auth(v);
    case 'hello': {
      const friends = v['friends'];
      const share = v['share'];
      if (!Array.isArray(friends) || friends.length > MAX_FRIENDS) return null;
      if (!friends.every(isUserId) || !isObj(share) || !isBool(share['nowPlaying'])) return null;
      return {
        t: 'hello',
        friends: [...new Set(friends)],
        share: { nowPlaying: share['nowPlaying'] },
      };
    }
    case 'presence': {
      const np = nowPlaying(v['nowPlaying']);
      const party = partyPresence(v['party']);
      if (np === undefined || party === undefined) return null;
      return { t: 'presence', nowPlaying: np, party };
    }
    case 'code.create':
      return { t: 'code.create' };
    case 'code.redeem':
      return isStr(v['code'], 20) ? { t: 'code.redeem', code: v['code'] } : null;
    case 'invite': {
      const ticket = toTicket(v['ticket']);
      if (!isUserId(v['to']) || !ticket) return null;
      return v['reply'] === true
        ? { t: 'invite', to: v['to'], ticket, reply: true }
        : { t: 'invite', to: v['to'], ticket };
    }
    case 'invite.decline':
    case 'join.request':
      if (!isUserId(v['to']) || !isPartyId(v['partyId'])) return null;
      return { t: v['t'], to: v['to'], partyId: v['partyId'] };
    default:
      return null;
  }
}

function playback(v: unknown): PartyPlayback | null {
  if (!isObj(v)) return null;
  const { seq, videoId, playing, positionMs, at, title, artist } = v;
  if (!isNum(seq) || !isVideoId(videoId) || !isBool(playing) || !isNum(positionMs) || !isNum(at)) {
    return null;
  }
  if (!isStr(title, 300) || !isStr(artist, 300)) return null;
  const state: PartyPlayback = {
    seq,
    videoId,
    playing,
    positionMs: Math.max(0, positionMs),
    at,
    title,
    artist,
  };
  if (v['playlistId'] !== undefined) {
    if (!matches(v['playlistId'], PLAYLIST_ID_PATTERN)) return null;
    state.playlistId = v['playlistId'];
  }
  const hold = v['hold'];
  if (hold !== undefined) {
    if (!isObj(hold)) return null;
    if (hold['kind'] === 'host-ad') state.hold = { kind: 'host-ad' };
    else if (hold['kind'] === 'ads') {
      const users = hold['users'];
      if (!Array.isArray(users) || users.length > PARTY_MAX_MEMBERS || !users.every(isUserId)) {
        return null;
      }
      if (!isNum(hold['until'])) return null;
      state.hold = { kind: 'ads', users, until: hold['until'] };
    } else return null;
  }
  return state;
}

function status(v: unknown): MemberStatus | null {
  if (!isObj(v)) return null;
  const { videoId, driftMs, ad, buffering, unplayable, localPause } = v;
  if (videoId !== null && !isVideoId(videoId)) return null;
  if (driftMs !== null && !isNum(driftMs)) return null;
  if (!isBool(ad) || !isBool(buffering) || !isBool(localPause)) return null;
  const result: MemberStatus = {
    videoId,
    driftMs: driftMs === null ? null : Math.round(Math.max(-1e7, Math.min(1e7, driftMs))),
    ad,
    buffering,
    localPause,
  };
  if (unplayable !== undefined) {
    if (!isStr(unplayable, 40)) return null;
    result.unplayable = unplayable;
  }
  return result;
}

function track(v: unknown): SuggestedTrack | null {
  if (!isObj(v) || !isVideoId(v['videoId'])) return null;
  if (!isStr(v['title'], 300) || !isStr(v['artist'], 300)) return null;
  return { videoId: v['videoId'], title: v['title'], artist: v['artist'] };
}

/** Parses a frame a client sent to a party; null if invalid. */
export function parsePartyClientMessage(raw: unknown): PartyClientMessage | null {
  const v = parseJson(raw);
  if (!v) return null;
  switch (v['t']) {
    case 'auth':
      return auth(v);
    case 'ping':
      return isNum(v['c0']) ? { t: 'ping', c0: v['c0'] } : null;
    case 'state': {
      const state = playback(v['state']);
      return state ? { t: 'state', state } : null;
    }
    case 'status': {
      const s = status(v['status']);
      return s ? { t: 'status', status: s } : null;
    }
    case 'suggest': {
      const t = track(v['track']);
      return t ? { t: 'suggest', track: t } : null;
    }
    case 'suggest.answer':
      if (!matches(v['id'], ID_PATTERN) || !isBool(v['accept'])) return null;
      return { t: 'suggest.answer', id: v['id'], accept: v['accept'] };
    case 'kick':
    case 'transfer':
      return isUserId(v['userId']) ? { t: v['t'], userId: v['userId'] } : null;
    case 'options': {
      const o = options(v['options']);
      return o ? { t: 'options', options: o } : null;
    }
    case 'end':
      return { t: 'end' };
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}

/**
 * Client side: the server is ours, but a broken or tampered frame must never
 * crash Pegel. Only the shape and the type tag are checked here; the fields
 * Pegel shows are checked where they are used.
 */
export function parseServerFrame<T extends { t: string }>(raw: unknown): T | null {
  const v = parseJson(raw);
  return v ? (v as unknown as T) : null;
}

export const isPartyPlayback = (v: unknown): v is PartyPlayback => playback(v) !== null;
export const toPartyPlayback = playback;
export const toMemberStatus = status;
export const toNowPlaying = (v: unknown): NowPlaying | null => nowPlaying(v) ?? null;
export const toPartyPresence = (v: unknown): PartyPresence | null => partyPresence(v) ?? null;
export const toPartyOptions = options;
