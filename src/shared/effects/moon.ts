import { FX, type EffectPart, type EffectTarget } from './common';

/**
 * Mitternacht: a moon crossing the sky behind the content on a flat arc,
 * slowly, one pass at a time, softly as if through a thin layer of cloud. Every pass shows the next phase, in the real
 * order (new → waxing → full → waning). Pass and phase come from the clock,
 * so the Pegel UI and the YT view show the same moon at the same spot.
 */

/** Seconds for one pass across the window. */
export const MOON_PASS_S = 240;
export const MOON_PHASES = 8;

/** Which pass we are in (its phase) and how far along it, for a point in time. */
export function moonState(nowMs: number, passS = MOON_PASS_S): { phase: number; progress: number } {
  const passes = nowMs / 1000 / passS;
  const pass = Math.floor(passes);
  return { phase: ((pass % MOON_PHASES) + MOON_PHASES) % MOON_PHASES, progress: passes - pass };
}

/**
 * SVG path of the lit part of a moon with radius `r` around (0, 0), for phase
 * `index` of `MOON_PHASES` (0 new, 2 first quarter, 4 full, 6 last quarter).
 * As seen from the northern hemisphere: waxing lights the right side.
 */
export function moonPath(index: number, r = 1): string {
  const phase = (((index % MOON_PHASES) + MOON_PHASES) % MOON_PHASES) / MOON_PHASES;
  if (phase === 0) return '';
  if (phase === 0.5) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  const angle = phase * 2 * Math.PI;
  const waxing = phase < 0.5;
  const cos = Math.cos(angle);
  // Terminator: half an ellipse from the bottom back to the top.
  const rx = Math.abs(cos * r);
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (cos > 0 ? 0 : 1) : cos < 0 ? 0 : 1;
  const f = (n: number) => Number(n.toFixed(4));
  return `M0 ${-r}A${r} ${r} 0 0 ${limbSweep} 0 ${r}A${f(rx)} ${r} 0 0 ${termSweep} 0 ${-r}Z`;
}

/** Share of the disc that is lit (0…1), for the glow. */
export function moonLit(index: number): number {
  return (1 - Math.cos((index / MOON_PHASES) * 2 * Math.PI)) / 2;
}

const MOON_COLOR = 'color-mix(in oklch, var(--fx-text) 88%, var(--fx-accent))';
const CLOUD_COLOR =
  'color-mix(in srgb, color-mix(in oklch, var(--fx-bg) 70%, var(--fx-text)) 45%, transparent)';
const DARK_COLOR = 'color-mix(in oklch, var(--fx-bg) 93%, var(--fx-text))';

const CSS = `
${FX} .mo-x {
  position: absolute; left: 0; top: 0;
  animation: pegel-fx-moon-x var(--pass) linear var(--delay) infinite;
  will-change: transform;
}
${FX} .mo-y {
  animation: pegel-fx-moon-y var(--pass) linear var(--delay) infinite;
  will-change: transform;
}
${FX} .mo {
  position: relative; width: var(--size); height: var(--size);
  animation: pegel-fx-moon-tilt var(--pass) linear var(--delay) infinite;
}
/* Halo: wide and soft, as if the light scatters in a thin layer of cloud. */
${FX} .mo::before {
  content: ''; position: absolute; inset: -170%; border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, ${MOON_COLOR} 20%, transparent), transparent);
  opacity: calc(0.2 + var(--lit) * 0.5);
}
/* The disc itself: dimmed and out of focus, behind the haze. */
${FX} .mo svg {
  position: relative; display: block; width: 100%; height: 100%; overflow: visible;
  opacity: 0.58; filter: blur(1.3px);
}
/* Thin cloud veils drifting over the moon. */
${FX} .mo-cloud {
  position: absolute; left: -130%; top: -20%; width: 360%; height: 140%;
  background:
    radial-gradient(28% 22% at 38% 46%, ${CLOUD_COLOR}, transparent),
    radial-gradient(24% 16% at 62% 64%, ${CLOUD_COLOR}, transparent),
    radial-gradient(30% 18% at 52% 30%, ${CLOUD_COLOR}, transparent);
  animation: pegel-fx-cloud 70s ease-in-out infinite alternate;
  will-change: transform;
}
@keyframes pegel-fx-cloud {
  from { transform: translate3d(-14%, 0, 0); }
  to { transform: translate3d(14%, 0, 0); }
}
${FX} .mo .dark { fill: ${DARK_COLOR}; }
${FX} .mo .rim { fill: none; stroke: color-mix(in srgb, ${MOON_COLOR} 12%, transparent); stroke-width: 0.02; }
${FX} .mo .lit { fill: url(#pegel-moon-shade); }
${FX} .mo .mare { fill: url(#pegel-moon-mare); }
${FX} .mo .s-light { stop-color: ${MOON_COLOR}; }
${FX} .mo .s-limb { stop-color: color-mix(in oklch, ${MOON_COLOR} 86%, var(--fx-bg)); }
${FX} .mo .s-sea { stop-color: color-mix(in oklch, ${MOON_COLOR} 62%, var(--fx-bg)); stop-opacity: 0.5; }
${FX} .mo .s-sea + .s-sea { stop-opacity: 0; }
/* x linear, y a sine arc (ease-out up, ease-in down): a flat bow across the sky. */
@keyframes pegel-fx-moon-x {
  from { transform: translateX(-12vw); }
  to { transform: translateX(104vw); }
}
@keyframes pegel-fx-moon-y {
  0% { transform: translateY(66vh); animation-timing-function: cubic-bezier(0.61, 1, 0.88, 1); }
  50% { transform: translateY(9vh); animation-timing-function: cubic-bezier(0.12, 0, 0.39, 0); }
  100% { transform: translateY(66vh); }
}
@keyframes pegel-fx-moon-tilt {
  from { transform: rotate(-24deg); }
  to { transform: rotate(24deg); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .mo-x { animation: none; transform: translateX(72vw); }
  ${FX} .mo-y { animation: none; transform: translateY(12vh); }
  ${FX} .mo, ${FX} .mo-cloud { animation: none; }
}
`;

const SIZE: Record<EffectTarget, number> = { ui: 46, yt: 58 };

/** Soft darker seas, roughly where they are on the real moon: cx, cy, rx, ry, rotation (radius 1). */
const MARIA: readonly [number, number, number, number, number][] = [
  [-0.3, -0.3, 0.34, 0.24, -20],
  [0.08, -0.45, 0.26, 0.18, 10],
  [0.32, -0.08, 0.24, 0.32, 30],
  [-0.15, 0.12, 0.4, 0.26, 15],
  [0.2, 0.45, 0.18, 0.12, -10],
  [-0.5, 0.36, 0.14, 0.2, 0],
];

export const MOON: EffectPart = {
  count: { ui: 1, yt: 1 },
  css: CSS,
  build(doc, layer, _count, target) {
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = (name: string, attrs: Record<string, string>) => {
      const el = doc.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const x = doc.createElement('div');
    x.className = 'mo-x';
    const y = doc.createElement('div');
    y.className = 'mo-y';
    const moon = doc.createElement('div');
    moon.className = 'mo';
    moon.style.setProperty('--size', `${SIZE[target]}px`);
    x.style.setProperty('--pass', `${MOON_PASS_S}s`);

    const svg = svgEl('svg', { viewBox: '-1 -1 2 2' });
    const defs = svgEl('defs', {});
    const shade = svgEl('radialGradient', {
      id: 'pegel-moon-shade',
      cx: '-0.25',
      cy: '-0.25',
      r: '1.35',
    });
    shade.setAttribute('gradientUnits', 'userSpaceOnUse');
    shade.append(
      svgEl('stop', { class: 's-light', offset: '0.35' }),
      svgEl('stop', { class: 's-limb', offset: '1' }),
    );
    const sea = svgEl('radialGradient', { id: 'pegel-moon-mare' });
    sea.append(
      svgEl('stop', { class: 's-sea', offset: '0.2' }),
      svgEl('stop', { class: 's-sea', offset: '1' }),
    );
    const clip = svgEl('clipPath', { id: 'pegel-moon-clip' });
    const clipPath = svgEl('path', {});
    clip.append(clipPath);
    defs.append(shade, sea, clip);
    const lit = svgEl('path', { class: 'lit' });
    const maria = svgEl('g', { 'clip-path': 'url(#pegel-moon-clip)' });
    for (const [cx, cy, rx, ry, rot] of MARIA) {
      maria.append(
        svgEl('ellipse', {
          class: 'mare',
          cx: `${cx}`,
          cy: `${cy}`,
          rx: `${rx}`,
          ry: `${ry}`,
          transform: `rotate(${rot} ${cx} ${cy})`,
        }),
      );
    }
    svg.append(
      defs,
      svgEl('circle', { class: 'dark', r: '1' }),
      lit,
      maria,
      svgEl('circle', { class: 'rim', r: '0.985' }),
    );
    const cloud = doc.createElement('div');
    cloud.className = 'mo-cloud';
    moon.append(svg, cloud);
    y.append(moon);
    x.append(y);
    layer.append(x);

    /** Places the moon on its pass from the clock and draws the pass's phase. */
    const sync = (nowMs: number) => {
      const { phase, progress } = moonState(nowMs);
      const d = moonPath(phase);
      lit.setAttribute('d', d);
      clipPath.setAttribute('d', d);
      moon.style.setProperty('--lit', moonLit(phase).toFixed(2));
      return progress;
    };
    const delay = `${(-sync(Date.now()) * MOON_PASS_S).toFixed(2)}s`;
    x.style.setProperty('--delay', delay);
    // A new pass starts: next phase. Half a second of slack, the event fires right at the edge.
    x.addEventListener('animationiteration', () => sync(Date.now() + 500));
  },
};
