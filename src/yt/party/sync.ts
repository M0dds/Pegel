import { correctionFor, expectedPositionMs, SEEK_THRESHOLD_MS, SeekLead } from '@shared/party-sync';
import type { PartyControl, PartyReport, PartyTarget } from '@shared/social';
import type { SuggestedTrack } from '@shared/social-protocol';
import {
  isAdShowing,
  media,
  navigateToTrack,
  playerApi,
  readTrackInfo,
  trackUrl,
} from '../player/bridge';

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

  constructor(
    private readonly latencyMs: () => number,
    private readonly onReport: (report: PartyReport) => void,
  ) {
    const soon = () => setTimeout(() => this.tick(), 30);
    for (const type of ['play', 'playing', 'seeked', 'loadedmetadata', 'ended']) {
      document.addEventListener(type, (e) => this.isOwnMedia(e) && soon(), true);
    }
    document.addEventListener('pause', (e) => this.isOwnMedia(e) && this.onPause(), true);
    document.addEventListener('play', (e) => this.isOwnMedia(e) && this.onPlay(), true);
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
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
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
    if (!target || Date.now() < this.ownActionUntil || this.loading || isAdShowing()) return false;
    if (el.ended || el.currentTime < 0.5) return false;
    return readTrackInfo()?.videoId === target.videoId;
  }

  /** Guest pauses on purpose: only for this guest, the party goes on. */
  private onPause(): void {
    const el = media();
    if (el && this.guestTarget()?.playing && this.isUserAction(el)) {
      this.localPause = true;
      this.setRate(1);
    }
    setTimeout(() => this.tick(), 30);
  }

  /** Playing again after a local pause: back to the party's position. */
  private onPlay(): void {
    if (this.localPause && Date.now() >= this.ownActionUntil) this.localPause = false;
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
    const el = media();
    const now = Date.now();
    const ad = isAdShowing();
    const info = ad ? null : readTrackInfo();
    const latency = this.latencyMs() + control.audioOffsetMs;
    const positionMs = el ? Math.max(0, el.currentTime * 1000 - latency) : 0;

    if (control.role === 'guest')
      this.guestTick(control.target, el, now, ad, info, positionMs, latency);

    if (!ad && info && el) {
      this.lastVideoId = info.videoId;
      this.lastPositionMs = el.currentTime * 1000;
      this.lastDurationMs = Number.isFinite(el.duration) ? el.duration * 1000 : 0;
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
        } else {
          // The guest picked a track: it becomes a suggestion, the party continues.
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
    if (key === this.lastKey && !due && !jumped && !this.picked) return;
    this.lastKey = key;
    this.lastReport = now;

    const metadata = navigator.mediaSession.metadata;
    const playlistId = playerApi<string>('getPlaylistId');
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
    if (control.role === 'host' && !ad) {
      this.lastHostReport = { positionMs, atMs: now, playing: report.playing };
    }
    this.onReport(report);
  }
}
