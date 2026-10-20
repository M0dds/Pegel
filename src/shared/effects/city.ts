import { FX, particle, pct, px, rangeRandom, sec, type EffectPart } from './common';

/**
 * Neon: a cyberpunk city behind the content. A skyline with lit windows
 * (a few flicker) and neon edges on the horizon, a magenta glow behind it, a
 * perspective grid running towards the viewer below, thin rain and faint
 * scanlines. Cyan is the accent, magenta is the accent turned on the colour wheel.
 */

const CYAN = 'var(--fx-accent)';
const MAGENTA = 'oklch(from var(--fx-accent) calc(l - 0.12) calc(c + 0.06) calc(h + 135))';
const AMBER = 'oklch(from var(--fx-accent) calc(l - 0.05) c calc(h - 120))';
/** Skyline box: the SVG fills it exactly, so the flickering windows (HTML) line up. */
const VIEW_W = 1600;
const VIEW_H = 260;
const HORIZON = 70; // % from the top

const CSS = `
${FX} .ny-glow {
  position: absolute; left: 0; right: 0; top: ${HORIZON - 34}%; height: 34%;
  background:
    radial-gradient(60% 100% at 50% 100%, color-mix(in srgb, ${MAGENTA} 34%, transparent), transparent 70%),
    radial-gradient(30% 70% at 22% 100%, color-mix(in srgb, ${CYAN} 16%, transparent), transparent 70%);
  animation: pegel-fx-neon-pulse 7s ease-in-out infinite alternate;
}
@keyframes pegel-fx-neon-pulse {
  from { opacity: 0.7; }
  to { opacity: 1; }
}
${FX} .ny-city {
  position: absolute; left: 0; width: 100%; aspect-ratio: ${VIEW_W} / ${VIEW_H};
  bottom: ${100 - HORIZON}%; opacity: 0.85;
}
${FX} .ny-city svg { position: absolute; inset: 0; width: 100%; height: 100%; }
${FX} .ny-far { fill: oklch(from var(--fx-bg) calc(l + 0.07) calc(c + 0.02) h); }
${FX} .ny-near { fill: oklch(from var(--fx-bg) calc(l + 0.025) c h); }
${FX} .ny-edge { stroke-width: 2; fill: none; opacity: 0.8; }
${FX} .ny-c { fill: ${CYAN}; stroke: ${CYAN}; }
${FX} .ny-m { fill: ${MAGENTA}; stroke: ${MAGENTA}; }
${FX} .ny-a { fill: ${AMBER}; stroke: ${AMBER}; }
${FX} .ny-win { opacity: 0.4; }
${FX} .ny-flick {
  position: absolute; left: var(--x); top: var(--y); width: var(--w); height: var(--h);
  background: var(--c); box-shadow: 0 0 6px var(--c);
  animation: pegel-fx-flicker-win var(--dur) steps(1, end) var(--delay) infinite;
}
@keyframes pegel-fx-flicker-win {
  0%, 100% { opacity: 0.85; }
  37% { opacity: 0.15; }
  40% { opacity: 0.85; }
  42% { opacity: 0.2; }
  45% { opacity: 0.85; }
  70% { opacity: 0; }
  88% { opacity: 0.85; }
}
${FX} .ny-horizon {
  position: absolute; left: 0; right: 0; top: ${HORIZON}%; height: 1px;
  background: linear-gradient(90deg, transparent, ${MAGENTA} 20%, ${CYAN} 50%, ${MAGENTA} 80%, transparent);
  box-shadow: 0 0 12px 1px color-mix(in srgb, ${MAGENTA} 60%, transparent);
  opacity: 0.8;
}
${FX} .ny-floor {
  position: absolute; left: 0; right: 0; top: ${HORIZON}%; bottom: 0; overflow: hidden;
  perspective: 260px; perspective-origin: 50% 0;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 45%);
  mask-image: linear-gradient(to bottom, transparent, #000 45%);
}
${FX} .ny-plane {
  position: absolute; left: -100%; width: 300%; top: 0; height: 400%;
  transform-origin: 50% 0;
  background:
    repeating-linear-gradient(90deg, color-mix(in srgb, ${CYAN} 32%, transparent) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, color-mix(in srgb, ${MAGENTA} 40%, transparent) 0 1px, transparent 1px 64px);
  animation: pegel-fx-grid 2.6s linear infinite;
  will-change: transform;
}
@keyframes pegel-fx-grid {
  from { transform: rotateX(76deg) translateY(-64px); }
  to { transform: rotateX(76deg) translateY(0); }
}
${FX} .ny-rain {
  position: absolute; top: 0; left: var(--x); width: 1px; height: var(--len);
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, ${CYAN} 50%, transparent));
  opacity: var(--alpha);
  animation: pegel-fx-rain var(--dur) linear var(--delay) infinite;
  will-change: transform;
}
@keyframes pegel-fx-rain {
  from { transform: translate3d(0, -20vh, 0) rotate(8deg); }
  to { transform: translate3d(-14vh, 110vh, 0) rotate(8deg); }
}
${FX} .ny-scan {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(0deg, #0000 0 2px, #00000038 2px 3px);
}
${FX} .ny-sweep {
  position: absolute; left: 0; right: 0; top: 0; height: 18vh;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, ${CYAN} 5%, transparent), transparent);
  animation: pegel-fx-sweep 11s linear infinite;
  will-change: transform;
}
@keyframes pegel-fx-sweep {
  from { transform: translate3d(0, -20vh, 0); }
  to { transform: translate3d(0, 105vh, 0); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ny-glow, ${FX} .ny-plane, ${FX} .ny-flick { animation: none; }
  ${FX} .ny-plane { transform: rotateX(76deg); }
  ${FX} .ny-rain, ${FX} .ny-sweep { display: none; }
}
`;

export interface Building {
  x: number; // viewBox units
  w: number;
  h: number;
  far: boolean;
  /** Neon edge on the roof: colour class or none. */
  edge: 'ny-c' | 'ny-m' | null;
  antenna: number; // height, 0 for none
}

/** Two rows of buildings across the whole width: tall, faint ones behind, lower dark ones in front. */
export function skyline(count: number, seed = 31): Building[] {
  const between = rangeRandom(seed);
  const buildings: Building[] = [];
  for (const far of [true, false]) {
    const n = far ? Math.ceil(count * 0.45) : count - Math.ceil(count * 0.45);
    let x = -between(0, 40);
    const step = VIEW_W / n;
    for (let i = 0; i < n || x < VIEW_W; i++) {
      const w = step * between(0.7, 1.25);
      const h = far ? between(110, 245) : between(45, 160);
      const pick = between(0, 1);
      buildings.push({
        x,
        w,
        h,
        far,
        edge: pick < 0.22 ? 'ny-c' : pick < 0.38 ? 'ny-m' : null,
        antenna: between(0, 1) < 0.25 ? between(12, 34) : 0,
      });
      x += w + between(-6, 10);
    }
  }
  return buildings;
}

const WINDOW_COLORS = ['ny-c', 'ny-m', 'ny-a'] as const;

export const CITY: EffectPart = {
  count: { ui: 24, yt: 34 },
  css: CSS,
  build(doc, layer, count) {
    const between = rangeRandom(37);
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = (name: string, attrs: Record<string, string | number>) => {
      const el = doc.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };
    const glow = doc.createElement('div');
    glow.className = 'ny-glow';
    const city = doc.createElement('div');
    city.className = 'ny-city';
    const svg = svgEl('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, preserveAspectRatio: 'none' });
    const flickers: HTMLElement[] = [];
    for (const b of skyline(count)) {
      const top = VIEW_H - b.h;
      svg.append(
        svgEl('rect', {
          class: b.far ? 'ny-far' : 'ny-near',
          x: b.x,
          y: top,
          width: b.w,
          height: b.h,
        }),
      );
      if (b.antenna) {
        const ax = b.x + b.w * 0.5;
        svg.append(
          svgEl('rect', {
            class: b.far ? 'ny-far' : 'ny-near',
            x: ax - 1.5,
            y: top - b.antenna,
            width: 3,
            height: b.antenna,
          }),
        );
        svg.append(svgEl('circle', { class: 'ny-m', cx: ax, cy: top - b.antenna, r: 2.2 }));
      }
      if (b.edge) {
        svg.append(
          svgEl('path', { class: `ny-edge ${b.edge}`, d: `M${b.x + 1} ${top + 1}h${b.w - 2}` }),
        );
      }
      // Windows: a sparse grid, more lit in the back (distance hides the dark ones).
      const cols = Math.max(1, Math.floor((b.w - 8) / 9));
      const rows = Math.floor((b.h - 12) / 12);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (between(0, 1) > (b.far ? 0.12 : 0.07)) continue;
          const color = WINDOW_COLORS[Math.floor(between(0, 1) * 3)]!;
          const wx = b.x + 5 + c * 9;
          const wy = top + 8 + r * 12;
          if (!b.far && flickers.length < 7 && between(0, 1) < 0.18) {
            flickers.push(
              particle(
                doc,
                'ny-flick',
                {
                  '--x': pct((wx / VIEW_W) * 100),
                  '--y': pct((wy / VIEW_H) * 100),
                  '--w': pct((4 / VIEW_W) * 100),
                  '--h': pct((5 / VIEW_H) * 100),
                  '--c': `var(--ny-${color.slice(3)})`,
                  '--dur': sec(between(4, 11)),
                  '--delay': sec(-between(0, 11)),
                },
                false,
              ),
            );
            continue;
          }
          svg.append(
            svgEl('rect', { class: `ny-win ${color}`, x: wx, y: wy, width: 4, height: 5 }),
          );
        }
      }
    }
    city.style.setProperty('--ny-c', CYAN);
    city.style.setProperty('--ny-m', MAGENTA);
    city.style.setProperty('--ny-a', AMBER);
    city.append(svg, ...flickers);
    const horizon = doc.createElement('div');
    horizon.className = 'ny-horizon';
    const floor = doc.createElement('div');
    floor.className = 'ny-floor';
    const plane = doc.createElement('div');
    plane.className = 'ny-plane';
    floor.append(plane);
    layer.append(glow, city, horizon, floor);
    for (let i = 0; i < Math.round(count * 0.9); i++) {
      const dur = between(0.9, 1.6);
      layer.append(
        particle(
          doc,
          'ny-rain',
          {
            '--x': pct(between(0, 115)),
            '--len': px(between(40, 90)),
            '--alpha': between(0.15, 0.35).toFixed(2),
            '--dur': sec(dur),
            '--delay': sec(-between(0, dur)),
          },
          false,
        ),
      );
    }
    const scan = doc.createElement('div');
    scan.className = 'ny-scan';
    const sweep = doc.createElement('div');
    sweep.className = 'ny-sweep';
    layer.append(scan, sweep);
  },
};
