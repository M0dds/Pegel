import { randomBytes } from 'node:crypto';
import { adHoldUsers, AD_WAIT_MS, ClockSync, expectedPositionMs } from '@shared/party-sync';
import type { PartyControl, PartyReport, PartyTarget, PartyView } from '@shared/social';
import {
  cleanName,
  isUserId,
  isVideoId,
  TICKET_TTL_MS,
  ticketPayload,
  toMemberStatus,
  toPartyOptions,
  toPartyPlayback,
  type ActivityAction,
  type ControlAction,
  type Member,
  type MemberStatus,
  type PartyOptions,
  type PartyPlayback,
  type PartyServerMessage,
  type SuggestedTrack,
  type Suggestion,
  type Ticket,
  type UserId,
} from '@shared/social-protocol';
import type { PlayerCommand } from '@shared/types';
import { SocialSocket } from './connection';
import type { Identity } from './identity';

/** Clock pings right after joining (quick first estimate), then this often. */
const PING_BURST = 8;
const PING_BURST_GAP_MS = 100;
const PING_INTERVAL_MS = 5000;
/** Host: state heartbeat while playing, and the hold check. */
const HOST_TICK_MS = 500;
const HEARTBEAT_MS = 1000;
/** Host position this far off the last sent extrapolation is sent at once (seek). */
const JUMP_MS = 250;
/** A guest's target is resent when the clock estimate moved this much. */
const CLOCK_RESEND_MS = 5;
/** "Lea hat übersprungen" stays this long in the party pill. */
const ACTIVITY_MS = 4000;

function activityText(name: string, action: ActivityAction, title?: string): string {
  switch (action) {
    case 'takeover':
      return title ? `${name} legt jetzt auf: ${title}` : `${name} legt jetzt auf`;
    case 'skip':
      return `${name} hat übersprungen`;
    case 'pause':
      return `${name} hat pausiert`;
    case 'play':
      return `${name} spielt weiter`;
    case 'seek':
      return `${name} hat gespult`;
  }
}

export interface PartyHooks {
  onChange(): void;
  /** What the YT view should do (null: party over). */
  setYt(control: PartyControl | null): void;
  command(command: PlayerCommand): void;
  /** Host: plays an accepted suggestion. */
  playTrack(videoId: string, playlistId?: string): void;
  notice(text: string, kind: 'info' | 'error'): void;
  /** Someone new joined while we are in the party (not the members found on joining). */
  onMemberJoined(name: string): void;
  audioOffsetMs(): number;
  nameOf(userId: UserId): string | null;
}

const FINAL_TEXT: Record<string, string> = {
  ended: 'Die Party ist schon vorbei.',
  kicked: 'Du wurdest aus der Party entfernt.',
  'not-invited': 'Die Einladung ist abgelaufen.',
  full: 'Die Party ist voll.',
  'old-client': 'Für Partys bitte Pegel aktualisieren.',
  'bad-sig': 'Anmeldung bei der Party fehlgeschlagen.',
};

/**
 * One listening party, as host or guest. The host's YT view reports its
 * playback; this sends it to the party. A guest receives the host's state,
 * converts it to local time and hands it to its YT view, which follows it.
 */
export class PartyService {
  private socket: SocialSocket<PartyServerMessage> | null = null;
  private identity: Identity | null = null;
  private partyId: string | null = null;
  private connection: 'connecting' | 'online' | 'reconnecting' = 'connecting';
  private readonly clock = new ClockSync();
  private hostId: UserId | null = null;
  private members = new Map<UserId, Member>();
  private playback: PartyPlayback | null = null;
  private options: PartyOptions = { open: true, allowSuggestions: true, everyoneControls: true };
  private suggestions: Suggestion[] = [];
  private activity: string | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  private lastSentOffset: number | null = null;
  private report: PartyReport | null = null;
  private seq = 0;
  private lastSent: { state: PartyPlayback; localAt: number } | null = null;
  /** Ad hold (host): time waited during the current track, and the running hold. */
  private hold = { videoId: '', waitedMs: 0, since: null as number | null, pausedByUs: false };

  constructor(
    private readonly url: string,
    private readonly hooks: PartyHooks,
  ) {}

  get active(): boolean {
    return this.socket !== null;
  }

  get id(): string | null {
    return this.partyId;
  }

  get isHost(): boolean {
    return !!this.identity && this.hostId === this.identity.id;
  }

  /** New party with this Pegel as host. */
  startHost(identity: Identity, name: () => string, options: PartyOptions): void {
    const partyId = randomBytes(16).toString('base64url');
    this.connect(identity, name, partyId, () => ({ create: options }));
    // Known before the server confirms, so invites can go out right away.
    this.hostId = identity.id;
    this.options = options;
  }

  /** Join with a ticket from an invite (or an answer to a join request). */
  join(identity: Identity, name: () => string, ticket: Ticket): void {
    this.connect(identity, name, ticket.partyId, () => ({ ticket }));
  }

  leave(): void {
    if (!this.socket) return;
    this.socket.send({ t: 'leave' });
    this.cleanup();
  }

  end(): void {
    if (!this.socket || !this.isHost) return;
    this.socket.send({ t: 'end' });
    this.cleanup();
  }

  /** Guest with "Alle dürfen steuern" may take over by playing own music. */
  get canTakeOver(): boolean {
    return !!this.socket && !this.isHost && this.options.everyoneControls;
  }

  claimHost(): void {
    if (this.canTakeOver) this.socket?.send({ t: 'host.claim' });
  }

  kick(userId: UserId): void {
    if (this.isHost) this.socket?.send({ t: 'kick', userId });
  }

  transfer(userId: UserId): void {
    if (this.isHost) this.socket?.send({ t: 'transfer', userId });
  }

  setOptions(options: PartyOptions): void {
    this.options = options;
    if (this.isHost) this.socket?.send({ t: 'options', options });
    this.hooks.onChange();
  }

  /** Accepted suggestions play right away on the host. */
  answerSuggestion(id: string, accept: boolean): void {
    if (!this.isHost) return;
    const suggestion = this.suggestions.find((s) => s.id === id);
    this.socket?.send({ t: 'suggest.answer', id, accept });
    if (accept && suggestion) this.hooks.playTrack(suggestion.videoId);
  }

  /** A guest without shared control picked a track: it is suggested to the host. */
  private suggest(track: SuggestedTrack): void {
    if (!this.socket || !isVideoId(track.videoId)) return;
    const label = track.title ? `„${track.title}“` : 'Der Titel';
    if (this.options.allowSuggestions) {
      this.socket.send({ t: 'suggest', track });
      this.hooks.notice(`${label} als Vorschlag gesendet.`, 'info');
    } else {
      this.hooks.notice('In dieser Party steuert nur der Host die Musik.', 'info');
    }
  }

  /**
   * Pegel's own controls (mini player, tray, panel) during a party. Returns
   * true if the party took the command; otherwise YT gets it as usual.
   */
  routeCommand(command: PlayerCommand): boolean {
    if (!this.socket) return false;
    if (this.isHost || !this.options.everyoneControls) return false;
    switch (command.type) {
      case 'playPause':
        this.sendControl(this.playback?.playing ? 'pause' : 'play');
        return true;
      case 'play':
      case 'pause':
        this.sendControl(command.type);
        return true;
      case 'next':
        this.sendControl('skip');
        return true;
      case 'seek':
        this.sendControl('seek', Math.max(0, command.sec * 1000));
        return true;
      case 'previous':
        this.hooks.notice('Zurück gibt es in der Party nicht.', 'info');
        return true;
      default:
        return false;
    }
  }

  private sendControl(action: ControlAction, positionMs?: number): void {
    this.socket?.send(
      positionMs === undefined ? { t: 'control', action } : { t: 'control', action, positionMs },
    );
  }

  /** Ticket for a friend, signed by this host; valid for 10 minutes. */
  makeTicket(guest: UserId): Ticket | null {
    if (!this.identity || !this.partyId || !this.isHost) return null;
    const exp = Math.round(this.clock.toServer(Date.now()) + TICKET_TTL_MS);
    return {
      partyId: this.partyId,
      guest,
      exp,
      host: this.identity.id,
      sig: this.identity.sign(ticketPayload(this.partyId, guest, exp)),
    };
  }

  /** Control for the YT view (also resent after every YT page load). */
  control(): PartyControl | null {
    if (!this.socket) return null;
    const audioOffsetMs = this.hooks.audioOffsetMs();
    if (this.isHost) return { role: 'host', audioOffsetMs };
    return {
      role: 'guest',
      audioOffsetMs,
      target: this.target(),
      canControl: this.options.everyoneControls,
    };
  }

  /** The audio offset setting changed. */
  refreshControl(): void {
    if (this.socket) this.hooks.setYt(this.control());
  }

  onYtReport(report: PartyReport): void {
    if (!this.socket) return;
    this.report = report;
    if (this.isHost) {
      this.hostUpdate(false);
      return;
    }
    const status: MemberStatus = {
      videoId: report.videoId,
      driftMs: report.driftMs,
      ad: report.ad,
      buffering: report.buffering,
      localPause: report.localPause,
      ...(report.unplayable && { unplayable: report.unplayable }),
    };
    this.socket.send({ t: 'status', status });
    const me = this.identity && this.members.get(this.identity.id);
    if (me) me.status = status;
    if (report.picked) this.suggest(report.picked);
    const request = report.request;
    if (request && this.options.everyoneControls) {
      // Own music started: take over as host, the others follow what plays here.
      if (request.action === 'takeover') this.socket.send({ t: 'host.claim' });
      else this.sendControl(request.action, request.positionMs);
    }
    this.hooks.onChange();
  }

  view(): PartyView | null {
    if (!this.socket || !this.partyId || !this.identity) return null;
    const me = this.identity.id;
    const members = [...this.members.values()]
      .sort(
        (a, b) =>
          Number(b.userId === this.hostId) - Number(a.userId === this.hostId) ||
          a.joinedAt - b.joinedAt,
      )
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        isHost: m.userId === this.hostId,
        isMe: m.userId === me,
        conn: m.conn,
        status: m.status,
      }));
    const pb = this.playback;
    const hold = pb?.hold;
    const myStatus = this.members.get(me)?.status;
    return {
      partyId: this.partyId,
      role: this.isHost ? 'host' : 'guest',
      connection: this.connection,
      hostId: this.hostId,
      members,
      track: pb ? { title: pb.title, artist: pb.artist, videoId: pb.videoId } : null,
      playing: !!pb?.playing,
      options: this.options,
      suggestions: this.suggestions,
      hold: !hold
        ? null
        : hold.kind === 'host-ad'
          ? { kind: 'host-ad' }
          : {
              kind: 'ads',
              names: hold.users.map((u) => this.members.get(u)?.name ?? '?'),
              until: this.clock.toLocal(hold.until),
            },
      local: {
        localPause: !this.isHost && !!myStatus?.localPause,
        unplayable: !this.isHost && !!myStatus?.unplayable,
      },
      canControl: this.isHost || this.options.everyoneControls,
      activity: this.activity,
    };
  }

  private connect(
    identity: Identity,
    name: () => string,
    partyId: string,
    authExtra: () => Record<string, unknown>,
  ): void {
    this.cleanup(false);
    this.identity = identity;
    this.partyId = partyId;
    this.connection = 'connecting';
    let first = authExtra;
    this.socket = new SocialSocket<PartyServerMessage>({
      url: `${this.url}/party/${partyId}`,
      target: partyId,
      identity,
      name,
      // Coming back after a dropout needs neither ticket nor create.
      authExtra: () => {
        const extra = first();
        first = () => ({});
        return extra;
      },
      onMessage: (msg) => this.handle(msg),
      onState: (state) => {
        if (state === 'online') this.connection = 'online';
        else if (this.connection === 'online') this.connection = 'reconnecting';
        if (state !== 'online') this.stopPings();
        this.hooks.onChange();
      },
      onFinal: (reason) => {
        this.hooks.notice(
          FINAL_TEXT[reason] ?? 'Die Verbindung zur Party wurde getrennt.',
          'error',
        );
        this.cleanup();
      },
    });
    this.socket.start();
    this.hooks.onChange();
  }

  private cleanup(notify = true): void {
    const had = this.socket !== null;
    this.socket?.stop();
    this.socket = null;
    this.stopPings();
    if (this.hostTimer) clearInterval(this.hostTimer);
    this.hostTimer = null;
    this.partyId = null;
    this.hostId = null;
    this.members.clear();
    this.playback = null;
    this.suggestions = [];
    this.activity = null;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    this.report = null;
    this.lastSent = null;
    this.lastSentOffset = null;
    this.clock.reset();
    this.hold = { videoId: '', waitedMs: 0, since: null, pausedByUs: false };
    if (had && notify) {
      this.hooks.setYt(null);
      this.hooks.onChange();
    }
  }

  private handle(msg: PartyServerMessage): void {
    switch (msg.t) {
      case 'welcome': {
        this.hostId = isUserId(msg.hostId) ? msg.hostId : null;
        this.members.clear();
        for (const m of Array.isArray(msg.members) ? msg.members : []) this.upsertMember(m);
        this.playback = toPartyPlayback(msg.state);
        this.options = toPartyOptions(msg.options) ?? this.options;
        this.suggestions = Array.isArray(msg.suggestions) ? msg.suggestions : [];
        if (this.playback) this.seq = Math.max(this.seq, this.playback.seq);
        this.startPings();
        this.onRoleMaybeChanged();
        break;
      }
      case 'pong':
        if (typeof msg.c0 === 'number' && typeof msg.s === 'number') {
          this.clock.add({ c0: msg.c0, s: msg.s, c1: Date.now() });
          this.maybeResendTarget();
        }
        return;
      case 'state': {
        const state = toPartyPlayback(msg.state);
        if (!state || this.isHost) return;
        this.playback = state;
        this.seq = Math.max(this.seq, state.seq);
        this.pushTarget();
        break;
      }
      case 'member': {
        const member = this.upsertMember(msg.member);
        if (member?.isNew && member.userId !== this.identity?.id) {
          this.hooks.onMemberJoined(member.name);
        }
        if (this.isHost) this.hostUpdate(false);
        break;
      }
      case 'member.left': {
        const name = this.members.get(msg.userId)?.name;
        this.members.delete(msg.userId);
        if (name && msg.reason !== 'kicked')
          this.hooks.notice(`${name} hat die Party verlassen.`, 'info');
        break;
      }
      case 'suggestions':
        this.suggestions = Array.isArray(msg.suggestions) ? msg.suggestions.slice(0, 50) : [];
        break;
      case 'host':
        if (!isUserId(msg.hostId)) return;
        this.hostId = msg.hostId;
        if (this.isHost) this.hooks.notice('Du bist jetzt Host der Party.', 'info');
        this.onRoleMaybeChanged();
        break;
      case 'options':
        this.options = toPartyOptions(msg.options) ?? this.options;
        // "+" and the guest's own buttons follow the new rules.
        if (!this.isHost) this.pushTarget();
        break;
      case 'control':
        // A guest's pause, play, skip or seek: the host's YT does it, everybody follows.
        if (!this.isHost) return;
        if (msg.action === 'play' || msg.action === 'pause')
          this.hooks.command({ type: msg.action });
        else if (msg.action === 'skip') this.hooks.command({ type: 'next' });
        else if (msg.action === 'seek' && typeof msg.positionMs === 'number') {
          this.hooks.command({ type: 'seek', sec: Math.max(0, msg.positionMs / 1000) });
        }
        return;
      case 'activity': {
        const name = cleanName(msg.name);
        if (!name || msg.userId === this.identity?.id) return;
        const title = typeof msg.title === 'string' ? msg.title.slice(0, 80) : undefined;
        this.activity = activityText(name, msg.action, title);
        if (this.activityTimer) clearTimeout(this.activityTimer);
        this.activityTimer = setTimeout(() => {
          this.activity = null;
          this.hooks.onChange();
        }, ACTIVITY_MS);
        break;
      }
      case 'resync':
        // The server forgot: the host sends options and playback again.
        if (this.isHost) {
          this.socket?.send({ t: 'options', options: this.options });
          this.hostUpdate(true);
        }
        break;
      case 'ended': {
        const host = this.hostId && this.hooks.nameOf(this.hostId);
        const text =
          msg.reason === 'host-ended'
            ? `${host ?? 'Der Host'} hat die Party beendet.`
            : 'Die Party ist vorbei.';
        if (!this.isHost || msg.reason !== 'host-ended') this.hooks.notice(text, 'info');
        this.cleanup();
        return;
      }
      case 'error':
        return;
    }
    this.hooks.onChange();
  }

  /** Adds or updates a member; `isNew` if it was not in the party before. */
  private upsertMember(raw: unknown): { userId: UserId; name: string; isNew: boolean } | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    const name = cleanName(m['name']);
    if (!isUserId(m['userId']) || !name) return null;
    const isNew = !this.members.has(m['userId']);
    this.members.set(m['userId'], {
      userId: m['userId'],
      name,
      conn: m['conn'] === 'reconnecting' ? 'reconnecting' : 'ok',
      joinedAt: typeof m['joinedAt'] === 'number' ? m['joinedAt'] : 0,
      status: toMemberStatus(m['status']),
    });
    return { userId: m['userId'], name, isNew };
  }

  /** Host or guest: the YT view gets its role, the host starts its tick. */
  private onRoleMaybeChanged(): void {
    if (this.isHost) {
      if (!this.hostTimer) this.hostTimer = setInterval(() => this.hostUpdate(false), HOST_TICK_MS);
      this.hooks.setYt(this.control());
      this.hostUpdate(true);
    } else {
      if (this.hostTimer) clearInterval(this.hostTimer);
      this.hostTimer = null;
      this.pushTarget();
    }
  }

  private target(): PartyTarget | null {
    const pb = this.playback;
    if (!pb) return null;
    const target: PartyTarget = {
      videoId: pb.videoId,
      playing: pb.playing,
      positionMs: pb.positionMs,
      atMs: this.clock.toLocal(pb.at),
    };
    if (pb.playlistId) target.playlistId = pb.playlistId;
    return target;
  }

  private pushTarget(): void {
    if (!this.socket || this.isHost) return;
    this.lastSentOffset = this.clock.toServer(0);
    this.hooks.setYt(this.control());
  }

  private maybeResendTarget(): void {
    if (this.isHost || !this.playback) return;
    const offset = this.clock.toServer(0);
    if (this.lastSentOffset === null || Math.abs(offset - this.lastSentOffset) >= CLOCK_RESEND_MS) {
      this.pushTarget();
    }
  }

  private startPings(): void {
    this.stopPings();
    let burst = 0;
    const ping = () => this.socket?.send({ t: 'ping', c0: Date.now() });
    const burstTimer = setInterval(() => {
      ping();
      if (++burst >= PING_BURST) {
        clearInterval(burstTimer);
        this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
      }
    }, PING_BURST_GAP_MS);
    this.pingTimer = burstTimer;
  }

  private stopPings(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /**
   * Host: decides what the party should hear and sends it when it changed
   * (or as heartbeat). Holds the party for guests' ads, at most 30 s per track.
   */
  private hostUpdate(force: boolean): void {
    if (!this.socket || !this.isHost || !this.identity) return;
    const r = this.report;
    if (!r?.videoId || !isVideoId(r.videoId)) return;
    const now = Date.now();

    if (r.videoId !== this.hold.videoId) {
      this.hold = { videoId: r.videoId, waitedMs: 0, since: null, pausedByUs: false };
    }
    const me = this.identity.id;
    const adUsers = [...this.members.values()]
      .filter((m) => m.userId !== me && m.conn === 'ok' && m.status?.ad)
      .map((m) => m.userId);
    const waited = this.hold.waitedMs + (this.hold.since === null ? 0 : now - this.hold.since);
    const waitFor = r.ad ? [] : adHoldUsers(adUsers, waited);

    if (waitFor.length && this.hold.since === null) {
      this.hold.since = now;
      if (r.playing) {
        this.hold.pausedByUs = true;
        this.hooks.command({ type: 'pause' });
      }
    } else if (this.hold.since !== null) {
      // Pressing play during the hold (after our pause landed) means "go on without them".
      const hostPlayed = r.playing && now - this.hold.since > 1500;
      if (!waitFor.length || hostPlayed) {
        this.hold.waitedMs = hostPlayed ? AD_WAIT_MS : waited;
        this.hold.since = null;
        if (this.hold.pausedByUs && !r.playing) this.hooks.command({ type: 'play' });
        this.hold.pausedByUs = false;
      }
    }

    const holding = this.hold.since !== null;
    const extrapolated = expectedPositionMs(r, now);
    const state: PartyPlayback = {
      seq: this.seq + 1,
      videoId: r.videoId,
      playing: r.playing && !r.ad && !holding,
      positionMs: Math.max(0, Math.round(extrapolated)),
      at: Math.round(this.clock.toServer(now)),
      title: r.title.slice(0, 300),
      artist: r.artist.slice(0, 300),
    };
    if (r.playlistId) state.playlistId = r.playlistId;
    if (r.ad) state.hold = { kind: 'host-ad' };
    else if (holding) {
      state.hold = {
        kind: 'ads',
        users: waitFor,
        until: Math.round(this.clock.toServer(now + Math.max(0, AD_WAIT_MS - waited))),
      };
    }

    const last = this.lastSent;
    let changed = force || !last;
    if (last) {
      const prev = last.state;
      const predicted = expectedPositionMs(
        { positionMs: prev.positionMs, atMs: last.localAt, playing: prev.playing },
        now,
      );
      changed ||=
        prev.videoId !== state.videoId ||
        prev.playing !== state.playing ||
        JSON.stringify(prev.hold ?? null) !== JSON.stringify(state.hold ?? null) ||
        Math.abs(predicted - state.positionMs) > JUMP_MS ||
        (state.playing && now - last.localAt >= HEARTBEAT_MS);
    }
    if (!changed) return;
    if (!this.socket.send({ t: 'state', state })) return;
    this.seq = state.seq;
    this.playback = state;
    this.lastSent = { state, localAt: now };
    this.hooks.onChange();
  }
}
