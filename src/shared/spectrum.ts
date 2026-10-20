/**
 * Frequency bars, shared by the visualizer behind YT's player bar and the one
 * in the mini player (which gets its levels from the YT view via IPC).
 */

const MIN_HZ = 40;
const MAX_HZ = 16000;
/** How fast the peak caps sink back, in bar heights per second. */
const CAP_FALL_PER_S = 0.35;
/** How fast the bars themselves sink, in bar heights per second. */
const BAR_FALL_PER_S = 2.5;
/** dB window of the analyser at full volume (Web Audio defaults). */
const MIN_DB = -100;
const MAX_DB = -30;
/** Most bars the YT view sends to the mini player. */
export const MAX_FEED_BARS = 96;

/** Log-spaced frequency band edges for `count` bars, as FFT bin indices. */
export function bandBins(count: number, binCount: number, sampleRate: number): number[] {
  const binHz = sampleRate / 2 / binCount;
  return Array.from({ length: count + 1 }, (_, i) => {
    const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / count);
    return Math.min(binCount - 1, Math.max(0, Math.round(hz / binHz)));
  });
}

/** Number of bars of `barWidth` + `gap` that fit into `width` (at least 8). */
export function barCount(width: number, barWidth: number, gap: number): number {
  return Math.max(8, Math.floor((width + gap) / (barWidth + gap)));
}

/**
 * Reads the analyser into `count` bar targets (0…1). YT's volume is applied
 * before the analyser; its dB window is shifted by the same amount so the
 * bars look the same at 10 % and at 100 %.
 */
export class BandReader {
  private data: Uint8Array<ArrayBuffer> | null = null;

  read(analyser: AnalyserNode, count: number, volume: number): number[] {
    if (!this.data || this.data.length !== analyser.frequencyBinCount) {
      this.data = new Uint8Array(analyser.frequencyBinCount);
    }
    const shift = 20 * Math.log10(Math.max(0.02, volume));
    if (Math.abs(analyser.maxDecibels - (MAX_DB + shift)) > 0.5) {
      analyser.minDecibels = MIN_DB + shift;
      analyser.maxDecibels = MAX_DB + shift;
    }
    analyser.getByteFrequencyData(this.data);
    const edges = bandBins(count, analyser.frequencyBinCount, analyser.context.sampleRate);
    const targets = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const last = Math.max(edges[i]!, edges[i + 1]! - 1);
      for (let b = edges[i]!; b <= last; b++) peak = Math.max(peak, this.data[b]!);
      targets[i] = Math.pow(peak / 255, 1.6);
    }
    return targets;
  }
}

/** Bar levels with falling bars and slowly sinking peak caps. */
export class BarMeter {
  levels: number[] = [];
  caps: number[] = [];

  /** `targets` null: nothing plays, the bars sink instead of freezing. */
  update(targets: readonly number[] | null, count: number, dt: number): void {
    if (this.levels.length !== count) {
      this.levels = new Array<number>(count).fill(0);
      this.caps = new Array<number>(count).fill(0);
    }
    for (let i = 0; i < count; i++) {
      const target = targets?.[i] ?? 0;
      this.levels[i] = Math.max(target, this.levels[i]! - dt * BAR_FALL_PER_S);
      this.caps[i] = Math.max(this.levels[i]!, this.caps[i]! - dt * CAP_FALL_PER_S);
    }
  }

  /** Everything has sunk to the floor. */
  isIdle(): boolean {
    return this.caps.every((c) => c <= 0.001);
  }

  reset(): void {
    this.levels = [];
    this.caps = [];
  }
}

export interface BarStyle {
  barWidth: number;
  gap: number;
  /** Share of the height the tallest bar may use (room for the cap). */
  usable: number;
  /** Bar colour as #rrggbb; bars, fades and caps get their own alpha. */
  color: string;
}

/** Draws the meter centred into a canvas of `width` × `height` CSS pixels. */
export function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  meter: BarMeter,
  style: BarStyle,
): void {
  const { barWidth, gap, color } = style;
  const count = meter.levels.length;
  ctx.clearRect(0, 0, width, height);
  const total = count * (barWidth + gap) - gap;
  const x0 = (width - total) / 2;
  const usable = height * style.usable;
  const fill = ctx.createLinearGradient(0, height - usable, 0, height);
  fill.addColorStop(0, `${color}44`);
  fill.addColorStop(1, `${color}12`);
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (barWidth + gap);
    const h = meter.levels[i]! * usable;
    ctx.fillStyle = fill;
    ctx.fillRect(x, height - h, barWidth, h);
    // A cap at the floor would draw a dashed line while nothing plays.
    if (meter.caps[i]! <= 0.001) continue;
    ctx.fillStyle = `${color}88`;
    ctx.fillRect(x, height - meter.caps[i]! * usable - 3, barWidth, 2);
  }
}

/** Sizes a canvas backing store to its CSS size; false while it has no size. */
export function fitCanvas(canvas: HTMLCanvasElement, dpr: number): boolean {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return false;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  return true;
}
