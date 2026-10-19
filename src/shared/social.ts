import { isVideoId } from './social-protocol';
import type {
  ControlAction,
  MemberStatus,
  NowPlaying,
  PartyOptions,
  SuggestedTrack,
  Suggestion,
  UserId,
} from './social-protocol';

/**
 * Everything the Pegel UI shows about friends and the party. Built by the
 * main process (the only source of truth) and sent as a whole on changes.
 */
export interface SocialState {
  /** "Freunde" is set up and switched on. */
  enabled: boolean;
  connection: 'off' | 'connecting' | 'online' | 'offline';
  me: { id: UserId; name: string } | null;
  /** Own friend code while one is valid. */
  code: { code: string; expiresAt: number } | null;
  friends: FriendView[];
  invites: InviteView[];
  party: PartyView | null;
  /** Short German message for the panel (e.g. "Code ungültig"), cleared after a while. */
  notice: { text: string; kind: 'info' | 'error' } | null;
}

export interface FriendView {
  id: UserId;
  name: string;
  online: boolean;
  nowPlaying: NowPlaying | null;
  /** In a party, and whether it is open for friends. */
  party: { partyId: string; open: boolean } | null;
}

export interface InviteView {
  inviteId: string;
  from: UserId;
  name: string;
  nowPlaying: NowPlaying | null;
  expiresAt: number;
}

export interface PartyMemberView {
  userId: UserId;
  name: string;
  isHost: boolean;
  isMe: boolean;
  conn: 'ok' | 'reconnecting';
  status: MemberStatus | null;
}

export interface PartyView {
  partyId: string;
  role: 'host' | 'guest';
  connection: 'connecting' | 'online' | 'reconnecting';
  hostId: UserId | null;
  members: PartyMemberView[];
  track: { title: string; artist: string; videoId: string } | null;
  playing: boolean;
  options: PartyOptions;
  suggestions: Suggestion[];
  /** The party waits: for guests' ads (with end time) or the host's ad. */
  hold: { kind: 'ads'; names: string[]; until: number } | { kind: 'host-ad' } | null;
  /** This guest's own situation. */
  local: { localPause: boolean; unplayable: boolean };
  /** Shared queue, played before the host's playlist continues (M11). */
  queue: QueueItemView[];
  /** May I pause, skip and seek for everybody? (host always; guests with "Alle dürfen steuern") */
  canControl: boolean;
  /** Last action of someone else, shown for a moment ("Lea hat übersprungen"). */
  activity: string | null;
}

export interface QueueItemView {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  byName: string;
  /** Added by me, or I am the host: may remove it. */
  canRemove: boolean;
}

/** Sent by the YT view: precise playback facts for the party. */
export interface PartyReport {
  videoId: string | null;
  /** Audible position (output latency and audio offset already taken out). */
  positionMs: number;
  /** Local time (`Date.now()`) of that measurement. */
  atMs: number;
  playing: boolean;
  buffering: boolean;
  ad: boolean;
  /** YT's playabilityStatus.status if not OK. */
  unplayable?: string;
  /** Guest: own position minus the party's (null while not comparable). */
  driftMs: number | null;
  localPause: boolean;
  title: string;
  artist: string;
  playlistId?: string;
  /** Guest picked another track itself; the YT view already went back. */
  picked?: SuggestedTrack;
  /** Guest used YT's own buttons (pause, play, seek, next) while allowed to control. */
  request?: { action: ControlAction; positionMs?: number };
}

/** What the "+" next to tracks in YT does during a party. */
export type PlusMode = 'queue' | 'suggest' | null;

/** What the YT view has to do for the party (main → YT view). */
export type PartyControl =
  | {
      role: 'host';
      audioOffsetMs: number;
      plus: PlusMode;
      /** First track of the party queue: played when the current one ends. */
      next: { videoId: string } | null;
    }
  | {
      role: 'guest';
      audioOffsetMs: number;
      plus: PlusMode;
      target: PartyTarget | null;
      /** YT's own buttons become party commands. */
      canControl: boolean;
    };

export interface PartyTarget {
  videoId: string;
  playlistId?: string;
  playing: boolean;
  /** Audible party position at `atMs` (local `Date.now()` clock). */
  positionMs: number;
  atMs: number;
}

export const EMPTY_SOCIAL_STATE: SocialState = {
  enabled: false,
  connection: 'off',
  me: null,
  code: null,
  friends: [],
  invites: [],
  party: null,
  notice: null,
};

/** Validates a report from the YT view (main process side). */
export function toPartyReport(value: unknown): PartyReport | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const bool = (x: unknown): x is boolean => typeof x === 'boolean';
  const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
  if (v['videoId'] !== null && !isVideoId(v['videoId'])) return null;
  if (!num(v['positionMs']) || !num(v['atMs'])) return null;
  if (!bool(v['playing']) || !bool(v['buffering']) || !bool(v['ad']) || !bool(v['localPause'])) {
    return null;
  }
  if (v['driftMs'] !== null && !num(v['driftMs'])) return null;
  if (!str(v['title'], 300) || !str(v['artist'], 300)) return null;
  const report: PartyReport = {
    videoId: v['videoId'] as string | null,
    positionMs: Math.max(0, v['positionMs']),
    atMs: v['atMs'],
    playing: v['playing'],
    buffering: v['buffering'],
    ad: v['ad'],
    driftMs: v['driftMs'] as number | null,
    localPause: v['localPause'],
    title: v['title'],
    artist: v['artist'],
  };
  if (str(v['unplayable'], 40) && v['unplayable']) report.unplayable = v['unplayable'];
  if (str(v['playlistId'], 100) && /^[A-Za-z0-9_-]{2,100}$/.test(v['playlistId'])) {
    report.playlistId = v['playlistId'];
  }
  const request = v['request'];
  if (typeof request === 'object' && request !== null) {
    const r = request as Record<string, unknown>;
    const action = r['action'];
    if (action === 'play' || action === 'pause' || action === 'skip') report.request = { action };
    else if (action === 'seek' && num(r['positionMs']) && r['positionMs'] >= 0) {
      report.request = { action, positionMs: r['positionMs'] };
    }
  }
  const picked = v['picked'];
  if (typeof picked === 'object' && picked !== null) {
    const p = picked as Record<string, unknown>;
    if (isVideoId(p['videoId']) && str(p['title'], 300) && str(p['artist'], 300)) {
      report.picked = { videoId: p['videoId'], title: p['title'], artist: p['artist'] };
    }
  }
  return report;
}
