import { SELECTORS } from '../selectors';

const BAR_WIDTH = 14;
const BAR_GAP = 3;
const MIN_HZ = 40;
const MAX_HZ = 16000;
/** 30 fps is plenty for a background effect. */
const FRAME_MS = 1000 / 30;
/** How fast the peak caps sink back, in bar heights per second. */
const CAP_FALL_PER_S = 0.35;
/** How fast the bars themselves sink, in bar heights per second. */
const BAR_FALL_PER_S = 2.5;
/** dB window of the analyser at full volume (Web Audio defaults). */
const MIN_DB = -100;
const MAX_DB = -30;

/** Log-spaced frequency band edges for `count` bars, as FFT bin indices. */
export function bandBins(count: number, binCount: number, sampleRate: number): number[] {
  const binHz = sampleRate / 2 / binCount;
  return Array.from({ length: count + 1 }, (_, i) => {
    const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / count);
    return Math.min(binCount - 1, Math.max(0, Math.round(hz / binHz)));
  });
}

/**
 * Frequency bars behind the player bar, like Spotifast. The canvas sits
 * inside YT's player bar (position fixed + z-index, so its own stacking
 * context) with z-index -1: above the bar's background, below its controls,
 * and it never catches the mouse.
 */
export class Visualizer {
  private enabled = false;
  private color = '#ffffff';
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private lastFrame = 0;
  private levels: number[] = [];
  private caps: number[] = [];
  private data: Uint8Array<ArrayBuffer> | null = null;

  constructor(private readonly getAnalyser: () => AnalyserNode | null) {
    document.addEventListener('play', () => this.start(), true);
    document.addEventListener('visibilitychange', () => this.start());
  }

  setEnabled(enabled: boolean, color: string): void {
    this.enabled = enabled;
    this.color = color;
    if (enabled) this.start();
    else this.stop(true);
  }

  private start(): void {
    if (!this.enabled || this.frame) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private stop(removeCanvas: boolean): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrame = 0;
    if (removeCanvas) {
      this.canvas?.remove();
      this.canvas = null;
      this.levels = [];
      this.caps = [];
    }
  }

  /** The canvas inside the player bar; re-created if YT replaced the bar. */
  private ensureCanvas(): HTMLCanvasElement | null {
    const bar = document.querySelector<HTMLElement>(SELECTORS.playerBar);
    if (!bar) return null;
    if (this.canvas?.isConnected && this.canvas.parentElement === bar) return this.canvas;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    bar.prepend(canvas);
    this.canvas = canvas;
    return canvas;
  }

  private tick(time: number): void {
    this.frame = 0;
    if (!this.enabled || document.visibilityState !== 'visible') return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
    if (time - this.lastFrame < FRAME_MS) return;
    const dt = this.lastFrame ? Math.min(0.1, (time - this.lastFrame) / 1000) : FRAME_MS / 1000;
    this.lastFrame = time;

    const canvas = this.ensureCanvas();
    const analyser = this.getAnalyser();
    if (!canvas || !analyser) return;
    const media = document.querySelector<HTMLMediaElement>(SELECTORS.mediaElement);
    const playing = !!media && !media.paused;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const count = Math.max(8, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    if (this.levels.length !== count) {
      this.levels = new Array<number>(count).fill(0);
      this.caps = new Array<number>(count).fill(0);
    }
    if (!this.data || this.data.length !== analyser.frequencyBinCount) {
      this.data = new Uint8Array(analyser.frequencyBinCount);
    }
    // YT's volume is applied before the analyser; shift its dB window by the
    // same amount so the bars look the same at 10 % and at 100 %.
    const shift = 20 * Math.log10(Math.max(0.02, media?.volume ?? 1));
    if (Math.abs(analyser.maxDecibels - (MAX_DB + shift)) > 0.5) {
      analyser.minDecibels = MIN_DB + shift;
      analyser.maxDecibels = MAX_DB + shift;
    }
    analyser.getByteFrequencyData(this.data);
    const edges = bandBins(count, analyser.frequencyBinCount, analyser.context.sampleRate);

    for (let i = 0; i < count; i++) {
      let peak = 0;
      const last = Math.max(edges[i]!, edges[i + 1]! - 1);
      for (let b = edges[i]!; b <= last; b++) peak = Math.max(peak, this.data[b]!);
      // Paused: let the bars sink instead of freezing.
      const target = playing ? Math.pow(peak / 255, 1.6) : 0;
      this.levels[i] = Math.max(target, this.levels[i]! - dt * BAR_FALL_PER_S);
      this.caps[i] = Math.max(this.levels[i]!, this.caps[i]! - dt * CAP_FALL_PER_S);
    }

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const total = count * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const x0 = (width - total) / 2;
    const usable = height * 0.92;
    const fill = ctx.createLinearGradient(0, height - usable, 0, height);
    fill.addColorStop(0, `${this.color}44`);
    fill.addColorStop(1, `${this.color}12`);
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (BAR_WIDTH + BAR_GAP);
      const h = this.levels[i]! * usable;
      ctx.fillStyle = fill;
      ctx.fillRect(x, height - h, BAR_WIDTH, h);
      ctx.fillStyle = `${this.color}88`;
      ctx.fillRect(x, height - this.caps[i]! * usable - 3, BAR_WIDTH, 2);
    }

    // Everything has sunk and nothing plays: stop drawing until the next 'play'.
    if (!playing && this.caps.every((c) => c <= 0.001)) this.stop(false);
  }
}
