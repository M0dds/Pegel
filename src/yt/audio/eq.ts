import { bandFilterType, effectivePreamp, levellingBoostDb } from '@shared/eq';
import { EQ_FREQUENCIES, EQ_Q } from '@shared/presets';
import type { EqSettings } from '@shared/types';
import { SELECTORS } from '../selectors';

/** Time constant for gain changes; avoids clicks when switching presets or on/off. */
const RAMP_SEC = 0.03;

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * 10-band equalizer and volume levelling on YT Music's media element:
 * media → level → preamp → lowshelf 31 Hz → peaking 62…8k → highshelf 16 kHz
 * → limiter → output.
 * The chain is never rewired; "off" ramps all gains to 0 dB and makes the
 * limiter transparent.
 */
export class EqEngine {
  private ctx: AudioContext | null = null;
  private level: GainNode | null = null;
  private preamp: GainNode | null = null;
  /** Catches the peaks of raised quiet tracks; transparent while nothing is raised. */
  private limiter: DynamicsCompressorNode | null = null;
  /** Content loudness of the current track (YT player response). */
  private loudnessDb: number | undefined;
  private filters: BiquadFilterNode[] = [];
  /** createMediaElementSource may only be called once per element. */
  private readonly connected = new WeakSet<HTMLMediaElement>();
  private settings: EqSettings | null = null;

  /** Watches the page for media elements, including ones YT swaps in later. */
  start(): void {
    const onMedia = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) this.attach(event.target);
    };
    // Media events don't bubble, but capturing listeners on document see them.
    document.addEventListener('loadstart', onMedia, true);
    document.addEventListener('play', onMedia, true);
    document.addEventListener('playing', () => this.ensureRunning(), true);

    const scan = () =>
      document.querySelectorAll<HTMLMediaElement>(SELECTORS.mediaElement).forEach((el) => {
        this.attach(el);
      });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
    else scan();
  }

  /** New track: its loudness (undefined if YT gives none, then nothing is raised). */
  setLoudness(loudnessDb: number | undefined): void {
    this.loudnessDb = loudnessDb;
    if (this.settings) this.apply(this.settings);
    console.info(
      `[pegel-eq] track loudness ${loudnessDb ?? '–'} dB, raised by ${this.levelBoostDb()} dB`,
    );
  }

  /** dB the current track is raised by (0 with levelling off). */
  levelBoostDb(): number {
    return this.settings?.levelling ? levellingBoostDb(this.loudnessDb) : 0;
  }

  apply(settings: EqSettings): void {
    this.settings = settings;
    if (!this.ctx || !this.preamp || !this.level || !this.limiter) return;
    const now = this.ctx.currentTime;
    const boost = this.levelBoostDb();
    this.level.gain.setTargetAtTime(dbToGain(boost), now, RAMP_SEC);
    // A ratio of 1 means no compression at all.
    this.limiter.threshold.setTargetAtTime(boost > 0 ? -1 : 0, now, RAMP_SEC);
    this.limiter.ratio.setTargetAtTime(boost > 0 ? 20 : 1, now, RAMP_SEC);
    const on = settings.enabled;
    this.preamp.gain.setTargetAtTime(dbToGain(on ? effectivePreamp(settings) : 0), now, RAMP_SEC);
    this.filters.forEach((filter, i) => {
      filter.gain.setTargetAtTime(on ? (settings.gains[i] ?? 0) : 0, now, RAMP_SEC);
    });
  }

  private attach(el: HTMLMediaElement): void {
    if (this.connected.has(el)) return;
    const ctx = this.ensureGraph();
    try {
      ctx.createMediaElementSource(el).connect(this.level!);
      this.connected.add(el);
      el.addEventListener('play', () => this.ensureRunning());
      console.info('[pegel-eq] attached to media element');
    } catch (error) {
      // Throws if the element was connected before (e.g. after a reload of this script).
      console.warn('[pegel-eq] could not attach', error);
    }
  }

  private ensureGraph(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const level = ctx.createGain();
    const preamp = ctx.createGain();
    level.connect(preamp);
    const limiter = ctx.createDynamicsCompressor();
    limiter.knee.value = 0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.threshold.value = 0;
    limiter.ratio.value = 1;
    const filters = EQ_FREQUENCIES.map((frequency, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = bandFilterType(i);
      filter.frequency.value = frequency;
      filter.Q.value = EQ_Q;
      filter.gain.value = 0;
      return filter;
    });
    let node: AudioNode = preamp;
    for (const filter of filters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(limiter);
    limiter.connect(ctx.destination);

    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && this.isAnyMediaPlaying()) {
        console.warn(`[pegel-eq] AudioContext ${ctx.state} while media plays, resuming`);
        void ctx.resume();
      }
    });

    this.ctx = ctx;
    this.level = level;
    this.preamp = preamp;
    this.limiter = limiter;
    this.filters = filters;
    if (this.settings) this.apply(this.settings);
    return ctx;
  }

  /** Autoplay policy: the context may start suspended and must be woken on play. */
  private ensureRunning(): void {
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().catch((error: unknown) => {
        console.warn('[pegel-eq] resume failed – audio would be silent', error);
      });
    }
  }

  private analyser: AnalyserNode | null = null;

  /**
   * Taps the end of the chain (after the EQ) without changing the output;
   * used by the visualizer and the diagnostics. Null until media is attached.
   */
  getAnalyser(): AnalyserNode | null {
    if (!this.ctx || !this.filters.length) return null;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096; // fine resolution in the bass
      this.analyser.smoothingTimeConstant = 0.78;
      this.filters.at(-1)!.connect(this.analyser);
    }
    return this.analyser;
  }

  /**
   * Development aid: context state, applied gains and the output level in
   * dBFS.
   */
  diagnostics(): {
    state: string;
    loudnessDb: number | undefined;
    levelDbBoost: number;
    limiterReductionDb: number;
    preampDb: number;
    gainsDb: number[];
    levelDb: number;
  } | null {
    const analyser = this.getAnalyser();
    if (!this.ctx || !this.preamp || !analyser) return null;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
    const round = (v: number) => Math.round(v * 10) / 10;
    return {
      state: this.ctx.state,
      loudnessDb: this.loudnessDb,
      levelDbBoost: this.levelBoostDb(),
      limiterReductionDb: round(this.limiter?.reduction ?? 0),
      preampDb: round(20 * Math.log10(this.preamp.gain.value)),
      gainsDb: this.filters.map((f) => round(f.gain.value)),
      levelDb: round(20 * Math.log10(rms || 1e-9)),
    };
  }

  private isAnyMediaPlaying(): boolean {
    return Array.from(document.querySelectorAll<HTMLMediaElement>(SELECTORS.mediaElement)).some(
      (el) => !el.paused,
    );
  }
}
