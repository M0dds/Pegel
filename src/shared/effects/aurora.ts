import { FX, particle, pct, px, rangeRandom, sec, type EffectPart } from './common';

/**
 * Nordlicht: aurora curtains high up behind the content, over a dark sky
 * with fine stars; the lower half of the window stays dark. Like the real
 * thing: bands that run diagonally across the sky and fold into swirls, fine
 * vertical rays inside, a bright sharp lower edge that fades out upwards,
 * green with violet to reddish tips, slowly undulating and shimmering.
 *
 * Drawn on a canvas at a third of the window size and scaled up (the
 * softness is wanted), about 20 frames per second, only while the page is
 * visible; with reduced motion one still frame.
 */

const SCALE = 3; // canvas pixel = 3 CSS pixels
const FRAME_MS = 1000 / 20;

const CSS = `
${FX} .ar {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0.38; filter: blur(2px);
  /* High in the sky: fades out towards the middle of the window. */
  -webkit-mask-image: linear-gradient(to bottom, #000 40%, transparent 62%);
  mask-image: linear-gradient(to bottom, #000 40%, transparent 62%);
}
${FX} .ar-star {
  position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s);
  border-radius: 50%; background: var(--fx-text); opacity: var(--lo);
  animation: pegel-fx-ar-twinkle var(--dur) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-fx-ar-twinkle {
  to { opacity: var(--hi); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ar-star { animation: none; }
}
`;

/** One curtain: where its lower edge runs and how it moves (all relative to the canvas). */
export interface Curtain {
  /** Lower edge at the left and right end (0 top … 1 bottom): diagonal across the sky. */
  y0: number;
  y1: number;
  /** Large slow folds and a smaller swirl on top: amplitude (of the height), waves across, speed (rad/s). */
  fold: [number, number, number];
  swirl: [number, number, number];
  /** Height of the rays (of the canvas height). */
  height: number;
  /** Overall strength 0…1. */
  strength: number;
  phase: number;
}

export const CURTAINS: readonly Curtain[] = [
  // Main band: from lower left rising to the upper right, with a fold in the middle.
  {
    y0: 0.42,
    y1: 0.2,
    fold: [0.07, 1.3, 0.035],
    swirl: [0.03, 3.4, 0.07],
    height: 0.3,
    strength: 1,
    phase: 0,
  },
  // A fainter, higher band behind it.
  {
    y0: 0.28,
    y1: 0.13,
    fold: [0.05, 1.8, 0.03],
    swirl: [0.02, 4.1, 0.06],
    height: 0.24,
    strength: 0.45,
    phase: 2.1,
  },
];

/** Lower edge of a curtain at `u` (0…1 across the width) and time `t` (s), 0 top … 1 bottom. */
export function curtainEdge(c: Curtain, u: number, t: number): number {
  const base = c.y0 + (c.y1 - c.y0) * u;
  const fold = c.fold[0] * Math.sin(u * c.fold[1] * 2 * Math.PI + t * c.fold[2] + c.phase);
  const swirl =
    c.swirl[0] * Math.sin(u * c.swirl[1] * 2 * Math.PI - t * c.swirl[2] + c.phase * 1.7);
  return base + fold + swirl;
}

/**
 * Brightness of the column at canvas pixel `x` (0…1): fine rays that shimmer
 * sideways, under a slow envelope so parts of a curtain glow and others fade.
 */
export function rayLevel(c: Curtain, x: number, u: number, t: number): number {
  const rays =
    0.6 +
    0.22 * Math.sin(x * 0.31 + t * 0.28 + c.phase) +
    0.12 * Math.sin(x * 0.77 - t * 0.5) +
    0.06 * Math.sin(x * 1.9 + t * 0.2 + c.phase * 3);
  // Patches along the curtain: some parts glow, others nearly vanish.
  const wave = Math.sin(u * 2 * Math.PI * 0.9 + t * 0.06 + c.phase * 2);
  const wave2 = Math.sin(u * 2 * Math.PI * 2.3 - t * 0.04 + c.phase);
  const envelope = Math.max(0, 0.5 + 0.5 * wave) ** 1.4 * (0.65 + 0.35 * wave2);
  return Math.max(0, Math.min(1, rays * envelope)) * c.strength;
}

interface AuroraColors {
  green: string;
  faint: string;
  edge: string;
  violet: string;
}

/** A column sprite: sharp bright lower edge, green, fading up into violet/red. */
function raySprite(doc: Document, { green, faint, edge, violet }: AuroraColors): HTMLCanvasElement {
  const sprite = doc.createElement('canvas');
  sprite.width = 1;
  sprite.height = 128;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'transparent');
  g.addColorStop(0.22, violet);
  g.addColorStop(0.5, faint);
  g.addColorStop(0.84, green);
  g.addColorStop(0.95, edge);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 128);
  return sprite;
}

/** Colours from the accent: aurora green, its bright edge, violet and a reddish top. */
function colors(root: Element): AuroraColors | null {
  const probe = root.ownerDocument.createElement('i');
  probe.style.display = 'none';
  root.append(probe);
  const read = (value: string) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const result = {
    green: read('oklch(from var(--fx-accent) calc(l + 0.06) calc(c + 0.06) calc(h - 22) / 0.8)'),
    faint: read('oklch(from var(--fx-accent) calc(l + 0.02) calc(c + 0.04) calc(h - 22) / 0.3)'),
    edge: read('oklch(from var(--fx-accent) calc(l + 0.16) calc(c + 0.02) calc(h - 18))'),
    violet: read('oklch(from var(--fx-accent) calc(l - 0.1) c calc(h + 150) / 0.35)'),
  };
  probe.remove();
  return result.green ? result : null;
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  w: number,
  h: number,
  t: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  for (const c of CURTAINS) {
    const rayH = c.height * h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const level = rayLevel(c, x, u, t);
      if (level < 0.03) continue;
      const bottom = curtainEdge(c, u, t) * h;
      // Taller rays where the curtain is bright.
      const height = rayH * (0.6 + 0.4 * level);
      ctx.globalAlpha = level;
      ctx.drawImage(sprite, x, bottom - height, 2, height);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export const AURORA: EffectPart = {
  /** Stars in the sky. */
  count: { ui: 30, yt: 55 },
  css: CSS,
  build(doc, layer, count) {
    const between = rangeRandom(53);
    for (let i = 0; i < count; i++) {
      const dur = between(2.5, 6);
      const lo = between(0.15, 0.35);
      layer.append(
        particle(
          doc,
          'ar-star',
          {
            '--x': pct(between(0, 100)),
            '--y': pct(between(0, 1) ** 1.6 * 85),
            '--s': px(between(0.8, 1.7)),
            '--lo': lo.toFixed(2),
            '--hi': (lo + between(0.15, 0.4)).toFixed(2),
            '--dur': sec(dur),
            '--delay': sec(-between(0, dur * 2)),
          },
          false,
        ),
      );
    }
    const canvas = doc.createElement('canvas');
    canvas.className = 'ar';
    layer.append(canvas);

    const win = doc.defaultView;
    if (!win) return;
    const still = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let sprite: HTMLCanvasElement | null = null;
    let last = 0;
    let wasConnected = false;
    const start = win.performance.now();

    const frame = (now: number) => {
      if (!canvas.isConnected) {
        // Removed (theme switched or effect off): stop for good.
        if (wasConnected) return;
        win.requestAnimationFrame(frame);
        return;
      }
      wasConnected = true;
      if (now - last >= FRAME_MS) {
        last = now;
        const w = Math.max(1, Math.round(canvas.clientWidth / SCALE));
        const h = Math.max(1, Math.round(canvas.clientHeight / SCALE));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        if (!sprite) {
          const c = colors(layer);
          if (c) sprite = raySprite(doc, c);
        }
        const ctx = canvas.getContext('2d');
        if (ctx && sprite) drawAurora(ctx, sprite, w, h, (now - start) / 1000 + 40);
        if (still && sprite) return;
      }
      // rAF does not run in hidden pages, so a hidden window costs nothing.
      win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  },
};
