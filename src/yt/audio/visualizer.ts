import {
  BandReader,
  barCount,
  BarMeter,
  drawBars,
  fitCanvas,
  MAX_FEED_BARS,
} from '@shared/spectrum';
import { SELECTORS } from '../selectors';

export { bandBins } from '@shared/spectrum';

const BAR_WIDTH = 14;
const BAR_GAP = 3;
/** 30 fps is plenty for a background effect. */
const FRAME_MS = 1000 / 30;

function playingMedia(): HTMLMediaElement | null {
  const media = document.querySelector<HTMLMediaElement>(SELECTORS.mediaElement);
  return media && !media.paused ? media : null;
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
  private readonly meter = new BarMeter();
  private readonly reader = new BandReader();

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
      this.meter.reset();
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
    const dpr = window.devicePixelRatio || 1;
    if (!fitCanvas(canvas, dpr)) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const count = barCount(width, BAR_WIDTH, BAR_GAP);
    const media = playingMedia();
    this.meter.update(media ? this.reader.read(analyser, count, media.volume) : null, count, dt);

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBars(ctx, width, height, this.meter, {
      barWidth: BAR_WIDTH,
      gap: BAR_GAP,
      usable: 0.92,
      color: this.color,
    });

    // Everything has sunk and nothing plays: stop drawing until the next 'play'.
    if (!media && this.meter.isIdle()) this.stop(false);
  }
}

/**
 * Bar levels for the mini player, sent to the main process while it asks for
 * them. Runs on a timer, not on animation frames: the main window (and with
 * it this page) is usually hidden while the mini player is open.
 */
export class SpectrumFeed {
  private timer: ReturnType<typeof setInterval> | null = null;
  private count = 0;
  private readonly reader = new BandReader();
  /** One empty frame is sent after playback stops, then nothing until it resumes. */
  private sentSilence = false;

  constructor(
    private readonly getAnalyser: () => AnalyserNode | null,
    private readonly send: (levels: number[]) => void,
  ) {}

  /** `bars` 0 stops the feed. */
  setBars(bars: number): void {
    this.count = Math.max(0, Math.min(MAX_FEED_BARS, Math.round(bars)));
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sentSilence = false;
    if (this.count) this.timer = setInterval(() => this.tick(), FRAME_MS);
  }

  private tick(): void {
    const analyser = this.getAnalyser();
    const media = playingMedia();
    if (!analyser || !media) {
      if (!this.sentSilence) this.send([]);
      this.sentSilence = true;
      return;
    }
    this.sentSilence = false;
    // Bytes keep the IPC messages small.
    this.send(this.reader.read(analyser, this.count, media.volume).map((v) => Math.round(v * 255)));
  }
}
