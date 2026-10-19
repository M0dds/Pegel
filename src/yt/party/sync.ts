import { correctionFor, expectedPositionMs, SEEK_THRESHOLD_MS, SeekLead } from '@shared/party-sync';
import type { PartyControl, PartyReport, PartyTarget } from '@shared/social';
import type { ControlAction, SuggestedTrack } from '@shared/social-protocol';
import {
  isAdShowing,
  media,
  navigateToEndpoint,
  navigateToTrack,
  playerApi,
  readPlayerTime,
  readResumeEndpoint,
  readTrackInfo,
  runCommand,
  trackUrl,
  type WatchEndpoint,
} from '../player/bridge';
import { SELECTORS } from '../selectors';

/** How often the guest compares its position with the party's. */
const TICK_MS = 250;
/** Reports to the main process at least this often while something plays. */
const REPORT_MS = 1000;
/** In-page navigation that does not arrive in time falls back to loading the URL. */
const LOAD_TIMEOUT_MS = 6000;
/** At the end of a track YT may play its own next one; wait this long for the host's. */
const AWAIT_NEXT_MS = 4000;
/** Play/pause/seek events this soon after our own action are not the user's. */
const OWN_ACTION_MS = 600;
/** Navigation fires pause/play events for a while. */
const LOAD_QUIET_MS = 3000;
/** "Track ended" if the last position was this close to the end. */
const NEAR_END_MS = 2500;
/** A paused guest is corrected only beyond this (a jump while paused is audible later). */
const PAUSED_TOLERANCE_MS = 250;
/** The drift after a jump is measured this long after it (for the learned lead). */
const SEEK_SETTLE_MS = 700;
/** How long a missing player response counts as "YT is switching tracks". */
const INFO_GAP_MS = 3000;
/** A host position this far off the extrapolation counts as a jump and is reported at once. */
const HOST_JUMP_MS = 250;
/** Host: the next queued track is loaded this close to the end of the current one. */
const ADVANCE_BEFORE_END_MS = 300;
/** Guest with control: after asking the host, do not fight the own player for this long. */
const REQUEST_GRACE_MS = 1500;
/** A click on YT's "next" button counts as "skip" for this long. */
const SKIP_INTENT_MS = 3000;
/**
 * Another track only counts as the guest's own pick if the guest clicked in
 * YT this shortly before. Without a click YT switched by itself (e.g. its own
 * queue after a load) and Pegel simply goes back to the party's track.
 */
const PICK_CLICK_MS = 4000;
/** Checks driven by media `timeupdate` events run at most this often. */
const MEDIA_TICK_MS = 200;

/**
 * Listening party in the YT view, right at the media element.
 *
 * Host: measures the audible position precisely and reports changes (and a
 * heartbeat) so the main process can pass them on.
 * Guest: follows the party target. Small drift is closed via the playback
 * rate (pitch preserved), large drift by a jump that lands where the party
 * will be. Ads, blocked tracks and the guest's own actions are reported.
 */
export class PartyEngine {
  private control: PartyControl | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport = 0;
  private lastKey = '';
  private lastHostReport: { positionMs: number; atMs: number; playing: boolean } | null = null;
  private ownActionUntil = 0;
  private localPause = false;
  private loading: { videoId: string; since: number; fallback: boolean } | null = null;
  private awaitingNext: number | null = null;
  private lastVideoId: string | null = null;
  private lastPositionMs = 0;
  private lastDurationMs = 0;
  private readonly seekLead = new SeekLead();
  private seekAt: number | null = null;
  private driftMs: number | null = null;
  private unplayable: string | undefined;
  private picked: SuggestedTrack | undefined;
  private infoMissingSince: number | null = null;
  /** Guest: a pause/play/seek/skip to send to the host (once). */
  private request: { action: ControlAction; positionMs?: number } | undefined;
  private requestUntil = 0;
  private skipIntentUntil = 0;
  private lastUserClick = 0;
  /** Host: playing from the party queue; where the own playlist resumes afterwards. */
  private queueMode = false;
  private resumeAt: WatchEndpoint | null = null;
  /** Host: the track we already moved on from (no double advance). */
  private advancedFrom: string | null = null;
  private unloading = false;
  private lastTickAt = 0;

  constructor(
    private readonly latencyMs: () => number,
    private readonly onReport: (report: PartyReport) => void,
  ) {
    const soon = () => setTimeout(() => this.tick(), 30);
    for (const type of ['play', 'playing', 'seeked', 'loadedmetadata']) {
      document.addEventListener(type, (e) => this.isOwnMedia(e) && soon(), true);
    }
    // Media events keep coming when Chromium throttles the timers of a hidden page
    // (down to once a minute after a while in the background). The end of a track
    // must not be missed then, so these run the check directly.
    document.addEventListener('timeupdate', () => this.tickFromMedia(), true);
    document.addEventListener('ended', () => this.tickFromMedia(true), true);
    document.addEventListener('pause', (e) => this.isOwnMedia(e) && this.onPause(), true);
    document.addEventListener('play', (e) => this.isOwnMedia(e) && this.onPlay(), true);
    document.addEventListener('seeking', (e) => this.isOwnMedia(e) && this.onSeeking(), true);
    window.addEventListener('pagehide', () => (this.unloading = true));
    window.addEventListener('beforeunload', () => (this.unloading = true));
    // YT's own "next" button: with control a skip for everybody, not a picked track.
    document.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        this.lastUserClick = Date.now();
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest(SELECTORS.nextButton))
          this.skipIntentUntil = Date.now() + SKIP_INTENT_MS;
      },
      true,
    );
  }

  /** Host: skip (anyone's "Weiter"): next queued track, back to the playlist, or YT's next. */
  skip(): void {
    const control = this.control;
    if (control?.role !== 'host') return;
    const current = readTrackInfo()?.videoId ?? null;
    if (control.next) this.playQueued(control.next.videoId, current);
    else if (this.queueMode && this.resumeAt) this.resumePlaylist(current);
    else runCommand({ type: 'next' });
  }

  private playQueued(videoId: string, from: string | null): void {
    // Remember where the own playlist would have continued, once per queue run.
    if (!this.queueMode) {
      this.resumeAt = readResumeEndpoint();
      this.queueMode = true;
    }
    this.advancedFrom = from;
    if (!navigateToTrack(videoId)) location.assign(trackUrl(videoId));
  }

  private resumePlaylist(from: string | null): void {
    const endpoint = this.resumeAt;
    this.queueMode = false;
    this.resumeAt = null;
    this.advancedFrom = from;
    if (endpoint) navigateToEndpoint(endpoint);
  }

  /**
   * Host: shortly before a track ends, the party queue comes first. If YT
   * already moved on by itself (timer late), the queued track still wins.
   */
  /** From media events: at most every 200 ms, always for `ended`. */
  private tickFromMedia(force = false): void {
    if (!this.control) return;
    const now = Date.now();
    if (!force && now - this.lastTickAt < MEDIA_TICK_MS) return;
    this.tick();
  }

  /** Position and length of the current track; YT's player first, the media element as fallback. */
  private trackTime(
    el: HTMLMediaElement | null,
  ): { currentMs: number; durationMs: number; playing: boolean } | null {
    const fromPlayer = readPlayerTime();
    if (fromPlayer) return fromPlayer;
    if (!el || !Number.isFinite(el.duration)) return null;
    return {
      currentMs: el.currentTime * 1000,
      durationMs: el.duration * 1000,
      playing: !el.paused,
    };
  }

  private hostTick(
    control: Extract<PartyControl, { role: 'host' }>,
    el: HTMLMediaElement | null,
  ): void {
    if (isAdShowing()) return;
    const info = readTrackInfo();
    const time = this.trackTime(el);
    if (!info || !time) return;
    const remaining = time.durationMs - time.currentMs;
    const nearEnd = time.playing && remaining <= ADVANCE_BEFORE_END_MS;
    const movedOnAlone =
      this.lastVideoId !== null &&
      info.videoId !== this.lastVideoId &&
      this.lastVideoId !== this.advancedFrom &&
      this.lastDurationMs > 0 &&
      this.lastPositionMs >= this.lastDurationMs - NEAR_END_MS;
    if (control.next && info.videoId === control.next.videoId) return;
    if (nearEnd && this.advancedFrom !== info.videoId) {
      if (control.next) this.playQueued(control.next.videoId, info.videoId);
      else if (this.queueMode && this.resumeAt) this.resumePlaylist(info.videoId);
    } else if (movedOnAlone && control.next) {
      this.playQueued(control.next.videoId, this.lastVideoId);
    } else if (movedOnAlone && this.queueMode && this.resumeAt) {
      this.resumePlaylist(this.lastVideoId);
    }
  }

  private canControl(): boolean {
    return this.control?.role === 'guest' && this.control.canControl;
  }

  /** Guest with control: ask the host, and let the own player be for a moment. */
  private ask(action: ControlAction, positionMs?: number): void {
    this.request = positionMs === undefined ? { action } : { action, positionMs };
    this.requestUntil = Date.now() + REQUEST_GRACE_MS;
    setTimeout(() => this.tick(), 0);
  }

  /** Guest scrubbed YT's progress bar. */
  private onSeeking(): void {
    const el = media();
    if (!el || !this.canControl() || !this.isUserAction(el)) return;
    const latency = this.latencyMs() + (this.control?.audioOffsetMs ?? 0);
    this.ask('seek', Math.max(0, el.currentTime * 1000 - latency));
  }

  setControl(control: PartyControl | null): void {
    const wasGuest = this.control?.role === 'guest';
    this.control = control;
    if (!control) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.reset();
      return;
    }
    if (control.role === 'host' && wasGuest) this.reset();
    // Skipped when media events just ran the check (no double work).
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (Date.now() - this.lastTickAt >= TICK_MS - 50) this.tick();
      }, TICK_MS);
    }
    this.tick();
  }

  /** "Weiterhören" after a local pause: the next tick jumps to the party's position. */
  resume(): void {
    if (!this.localPause) return;
    this.localPause = false;
    this.tick();
  }

  private reset(): void {
    this.setRate(1);
    this.localPause = false;
    this.request = undefined;
    this.requestUntil = 0;
    this.queueMode = false;
    this.resumeAt = null;
    this.advancedFrom = null;
    this.loading = null;
    this.awaitingNext = null;
    this.driftMs = null;
    this.seekAt = null;
    this.lastKey = '';
    this.lastHostReport = null;
  }

  private isOwnMedia(event: Event): boolean {
    return event.target instanceof HTMLMediaElement && event.target === media();
  }

  private act(fn: () => void, quietMs = OWN_ACTION_MS): void {
    this.ownActionUntil = Math.max(this.ownActionUntil, Date.now() + quietMs);
    fn();
  }

  private isUserAction(el: HTMLMediaElement): boolean {
    const target = this.guestTarget();
    // Reloading or leaving the page pauses the media too; that is nobody's choice.
    if (this.unloading) return false;
    if (!target || Date.now() < this.ownActionUntil || this.loading || isAdShowing()) return false;
    if (el.ended || el.currentTime < 0.5) return false;
    return readTrackInfo()?.videoId === target.videoId;
  }

  /**
   * Guest pauses on purpose: with control it pauses the party, otherwise only
   * this guest (the party goes on).
   */
  private onPause(): void {
    const el = media();
    if (el && this.guestTarget()?.playing && this.isUserAction(el)) {
      if (this.canControl()) this.ask('pause');
      else {
        this.localPause = true;
        this.setRate(1);
      }
    }
    setTimeout(() => this.tick(), 30);
  }

  /** Playing again: back after a local pause, or (with control) play for everybody. */
  private onPlay(): void {
    if (this.localPause && Date.now() >= this.ownActionUntil) this.localPause = false;
    const el = media();
    const target = this.guestTarget();
    if (el && target && !target.playing && this.canControl() && this.isUserAction(el)) {
      this.ask('play');
    }
  }

  private guestTarget(): PartyTarget | null {
    return this.control?.role === 'guest' ? this.control.target : null;
  }

  private setRate(rate: number): void {
    const el = media();
    if (!el || Math.abs(el.playbackRate - rate) < 0.0005) return;
    el.preservesPitch = true;
    el.playbackRate = rate;
  }

  private tick(): void {
    const control = this.control;
    if (!control) return;
    this.lastTickAt = Date.now();
    const el = media();
    const now = Date.now();
    const ad = isAdShowing();
    const info = ad ? null : readTrackInfo();
    const latency = this.latencyMs() + control.audioOffsetMs;
    const positionMs = el ? Math.max(0, el.currentTime * 1000 - latency) : 0;

    if (control.role === 'guest') {
      this.guestTick(control.target, el, now, ad, info, positionMs, latency);
    } else {
      this.hostTick(control, el);
    }

    if (!ad && info) {
      const time = this.trackTime(el);
      if (time) {
        this.lastVideoId = info.videoId;
        this.lastPositionMs = time.currentMs;
        this.lastDurationMs = time.durationMs;
      }
    }
    this.report(control, el, now, ad, info, positionMs);
  }

  private guestTick(
    target: PartyTarget | null,
    el: HTMLMediaElement | null,
    now: number,
    ad: boolean,
    info: { videoId: string; status: string } | null,
    positionMs: number,
    latency: number,
  ): void {
    this.driftMs = null;
    if (!target || !el || ad) {
      this.setRate(1);
      return;
    }

    // While YT switches tracks its player briefly has no response: wait instead of
    // reloading the party's track, so a track the guest picked is recognised.
    if (!info && this.lastVideoId !== null) {
      this.infoMissingSince ??= now;
      if (now - this.infoMissingSince < INFO_GAP_MS) return;
    }
    if (info) this.infoMissingSince = null;

    if (info?.videoId !== target.videoId) {
      this.setRate(1);
      this.unplayable = undefined;
      const loading = this.loading;
      if (loading?.videoId === target.videoId) {
        if (now - loading.since < LOAD_TIMEOUT_MS) return;
        if (!loading.fallback) {
          // YT did not take the in-page navigation: load the page instead.
          loading.fallback = true;
          loading.since = now;
          location.assign(trackUrl(target.videoId, target.playlistId));
        }
        return;
      }
      // Something else plays that Pegel did not ask for.
      if (info && this.lastVideoId === target.videoId) {
        const ended =
          this.lastDurationMs > 0 && this.lastPositionMs >= this.lastDurationMs - NEAR_END_MS;
        if (ended) {
          // YT's own autoplay at the end: hold until the host's next track arrives.
          if (this.awaitingNext === null) {
            this.awaitingNext = now;
            this.act(() => el.pause());
          }
          if (now - this.awaitingNext < AWAIT_NEXT_MS) return;
        } else if (now < this.skipIntentUntil && this.canControl()) {
          // YT's "next" button: skip for everybody.
          this.skipIntentUntil = 0;
          this.ask('skip');
        } else if (now - this.lastUserClick < PICK_CLICK_MS) {
          // The guest picked a track: it goes to the queue (or is suggested), the party continues.
          const metadata = navigator.mediaSession.metadata;
          this.picked = {
            videoId: info.videoId,
            title: metadata?.title ?? '',
            artist: metadata?.artist ?? '',
          };
        }
      }
      this.awaitingNext = null;
      this.load(target, now);
      return;
    }

    this.loading = null;
    this.awaitingNext = null;
    if (info.status !== 'OK') {
      // Region, age limit, …: this guest sits this track out.
      this.unplayable = info.status;
      return;
    }
    this.unplayable = undefined;
    if (this.localPause) {
      this.setRate(1);
      return;
    }
    // Asked the host to pause/play/seek: its answer arrives as the next target.
    if (now < this.requestUntil) {
      this.setRate(1);
      return;
    }

    const expected = expectedPositionMs(target, now);
    if (!target.playing) {
      this.setRate(1);
      if (!el.paused) this.act(() => el.pause());
      this.driftMs = positionMs - expected;
      if (Math.abs(this.driftMs) > PAUSED_TOLERANCE_MS) {
        this.act(() => (el.currentTime = (expected + latency) / 1000));
      }
      return;
    }
    // The party is past the end of this track (host gone, next one not here yet): let it end.
    if (Number.isFinite(el.duration) && expected >= el.duration * 1000 - NEAR_END_MS) {
      this.setRate(1);
      return;
    }
    if (el.paused && !el.ended && Math.abs(positionMs - expected) < SEEK_THRESHOLD_MS) {
      // Already where the party paused: just play, the tempo closes the small gap.
      this.act(() => void el.play().catch(() => {}));
      return;
    }
    if (el.paused || el.ended) {
      // Start right where the party will be once the media actually plays.
      this.act(() => {
        el.currentTime = (expected + this.seekLead.ms + latency) / 1000;
        void el.play().catch(() => {});
      });
      this.seekAt = now;
      return;
    }
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || el.seeking) return;

    const drift = positionMs - expected;
    this.driftMs = drift;
    if (this.seekAt !== null && now - this.seekAt >= SEEK_SETTLE_MS) {
      this.seekLead.learn(drift);
      this.seekAt = null;
    }
    const correction = correctionFor(drift);
    if (correction.kind === 'seek') {
      this.setRate(1);
      this.act(() => (el.currentTime = (expected + this.seekLead.ms + latency) / 1000));
      this.seekAt = now;
    } else if (correction.kind === 'rate') {
      this.setRate(correction.rate);
    } else {
      this.setRate(1);
    }
  }

  private load(target: PartyTarget, now: number): void {
    this.loading = { videoId: target.videoId, since: now, fallback: false };
    this.ownActionUntil = now + LOAD_QUIET_MS;
    this.localPause = false;
    if (!navigateToTrack(target.videoId, target.playlistId)) {
      this.loading.fallback = true;
      location.assign(trackUrl(target.videoId, target.playlistId));
    }
  }

  private report(
    control: PartyControl,
    el: HTMLMediaElement | null,
    now: number,
    ad: boolean,
    info: { videoId: string; status: string } | null,
    positionMs: number,
  ): void {
    const playing = !!el && !el.paused && !el.ended;
    const buffering = !!el && playing && el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
    const videoId = ad ? this.lastVideoId : (info?.videoId ?? null);
    const unplayable =
      control.role === 'host'
        ? info && info.status !== 'OK'
          ? info.status
          : undefined
        : this.unplayable;

    let jumped = false;
    if (control.role === 'host' && this.lastHostReport && !ad) {
      const predicted = expectedPositionMs(this.lastHostReport, now);
      jumped = Math.abs(positionMs - predicted) > HOST_JUMP_MS;
    }
    const sync =
      this.driftMs === null
        ? 'n'
        : Math.abs(this.driftMs) < 80
          ? 'y'
          : this.driftMs > 0
            ? '+'
            : '-';
    const key = [videoId, playing, ad, buffering, unplayable, this.localPause, sync].join('|');
    const due = playing && now - this.lastReport >= REPORT_MS;
    if (key === this.lastKey && !due && !jumped && !this.picked && !this.request) return;
    this.lastKey = key;
    this.lastReport = now;

    const metadata = navigator.mediaSession.metadata;
    // Queued tracks play on their own: right after loading one, YT may still name the
    // previous playlist, and guests loading the track with it would land in that list.
    const playlistId =
      control.role === 'host' && this.queueMode ? undefined : playerApi<string>('getPlaylistId');
    const report: PartyReport = {
      videoId,
      positionMs,
      atMs: now,
      playing: playing && !ad,
      buffering,
      ad,
      driftMs: this.driftMs,
      localPause: this.localPause,
      title: metadata?.title ?? '',
      artist: metadata?.artist ?? '',
    };
    if (unplayable) report.unplayable = unplayable;
    if (playlistId) report.playlistId = playlistId;
    if (this.picked) report.picked = this.picked;
    this.picked = undefined;
    if (this.request) report.request = this.request;
    this.request = undefined;
    if (control.role === 'host' && !ad) {
      this.lastHostReport = { positionMs, atMs: now, playing: report.playing };
    }
    this.onReport(report);
  }
}
