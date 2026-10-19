import { bandFilterType, effectivePreamp } from '@shared/eq';
import { EQ_FREQUENCIES, EQ_Q } from '@shared/presets';
import type { EqSettings } from '@shared/types';
import { SELECTORS } from '../selectors';

/** Time constant for gain changes; avoids clicks when switching presets or on/off. */
const RAMP_SEC = 0.03;

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * 10-band equalizer on YT Music's media element:
 * media → preamp → lowshelf 31 Hz → peaking 62…8k → highshelf 16 kHz → output.
 * The chain is never rewired; "off" ramps all gains to 0 dB.
 */
export class EqEngine {
  private ctx: AudioContext | null = null;
  private preamp: GainNode | null = null;
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

  apply(settings: EqSettings): void {
    this.settings = settings;
    if (!this.ctx || !this.preamp) return;
    const now = this.ctx.currentTime;
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
      ctx.createMediaElementSource(el).connect(this.preamp!);
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
    const preamp = ctx.createGain();
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
    node.connect(ctx.destination);

    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && this.isAnyMediaPlaying()) {
        console.warn(`[pegel-eq] AudioContext ${ctx.state} while media plays, resuming`);
        void ctx.resume();
      }
    });

    this.ctx = ctx;
    this.preamp = preamp;
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
   * Development aid: context state, applied gains and the output level in
   * dBFS (taps the end of the chain without changing the output).
   */
  diagnostics(): {
    state: string;
    preampDb: number;
    gainsDb: number[];
    levelDb: number;
  } | null {
    if (!this.ctx || !this.preamp) return null;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.filters.at(-1)!.connect(this.analyser);
    }
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
    const round = (v: number) => Math.round(v * 10) / 10;
    return {
      state: this.ctx.state,
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
