import { FX, rangeRandom, type EffectPart } from './common';
import { fallingShapes } from './petals';

/**
 * Wald: three rows of fir trees along the bottom behind the content, lighter
 * with distance, with slowly drifting mist between the rows and a faint glow
 * of light in the sky. In front, a few leaves fall (see LEAVES) and the
 * fireflies wander.
 */

const VIEW_W = 1600;
const VIEW_H = 440;

const CSS = `
${FX} .fo-sky {
  position: absolute; inset: 0;
  background: radial-gradient(70% 55% at 78% 0%, color-mix(in srgb, var(--fx-text) 7%, transparent), transparent 70%);
}
${FX} .fo-row {
  position: absolute; left: 0; bottom: 0; width: 100%; aspect-ratio: ${VIEW_W} / ${VIEW_H};
}
${FX} .fo-row svg { display: block; width: 100%; height: 100%; }
${FX} .fo-far { fill: oklch(from var(--fx-bg) calc(l + 0.1) calc(c + 0.02) h); opacity: 0.75; }
${FX} .fo-mid { fill: oklch(from var(--fx-bg) calc(l + 0.06) calc(c + 0.015) h); }
${FX} .fo-near { fill: oklch(from var(--fx-bg) calc(l + 0.02) c h); }
${FX} .fo-mist {
  position: absolute; left: -30%; width: 160%; bottom: var(--b); height: var(--h);
  background: radial-gradient(closest-side, color-mix(in srgb, var(--fx-text) var(--a), transparent), transparent);
  animation: pegel-fx-mist var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform;
}
@keyframes pegel-fx-mist {
  from { transform: translate3d(-7%, 0, 0); }
  to { transform: translate3d(7%, 0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .fo-mist { animation: none; }
}
`;

/** A fir tree: three tiers and a short trunk, standing on `base`. */
export function firPath(x: number, base: number, h: number, w: number): string {
  const top = base - h;
  const f = (n: number) => n.toFixed(1);
  const tiers: [number, number, number][] = [
    // [y of the tier's tips, half width at the tips, half width where the next tier starts]
    [0.32, 0.24, 0.1],
    [0.6, 0.38, 0.18],
    [0.88, 0.5, 0.06],
  ];
  let right = '';
  for (const [y, tip, inner] of tiers) {
    right += `L${f(x + tip * w)} ${f(top + y * h)}L${f(x + inner * w)} ${f(top + y * h - h * 0.02)}`;
  }
  let left = '';
  for (const [y, tip, inner] of [...tiers].reverse()) {
    left += `L${f(x - inner * w)} ${f(top + y * h - h * 0.02)}L${f(x - tip * w)} ${f(top + y * h)}`;
  }
  const trunk = `M${f(x - w * 0.05)} ${f(top + 0.86 * h)}h${f(w * 0.1)}V${base}h${f(-w * 0.1)}Z`;
  return `M${f(x)} ${f(top)}${right}${left}Z${trunk}`;
}

interface Row {
  cls: string;
  /** Trees per 1000 viewBox units, height range, ground height. */
  density: number;
  h: [number, number];
  ground: number;
}

const ROWS: readonly Row[] = [
  { cls: 'fo-far', density: 24, h: [150, 250], ground: 70 },
  { cls: 'fo-mid', density: 14, h: [180, 300], ground: 36 },
  { cls: 'fo-near', density: 8, h: [230, 400], ground: 10 },
];

/** Mist bands: bottom (%), height (%), alpha (%), cycle (s). Between far/mid and mid/near. */
const MIST: readonly [number, number, number, number][] = [
  [14, 26, 10, 48],
  [4, 18, 8, 37],
];

export const FOREST: EffectPart = {
  count: { ui: 1, yt: 1 },
  css: CSS,
  build(doc, layer) {
    const between = rangeRandom(41);
    const ns = 'http://www.w3.org/2000/svg';
    const sky = doc.createElement('div');
    sky.className = 'fo-sky';
    layer.append(sky);
    ROWS.forEach((row, i) => {
      const box = doc.createElement('div');
      box.className = 'fo-row';
      const svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      const base = VIEW_H - row.ground;
      let d = `M0 ${base}H${VIEW_W}V${VIEW_H}H0Z`;
      const n = Math.round((VIEW_W / 1000) * row.density);
      for (let t = 0; t < n; t++) {
        const x = ((t + between(0.1, 0.9)) / n) * VIEW_W;
        const h = between(...row.h);
        d += firPath(x, base + between(0, 6), h, h * between(0.42, 0.55));
      }
      const path = doc.createElementNS(ns, 'path');
      path.setAttribute('class', row.cls);
      path.setAttribute('d', d);
      svg.append(path);
      box.append(svg);
      layer.append(box);
      const mist = MIST[i];
      if (mist) {
        const [b, h, a, dur] = mist;
        const el = doc.createElement('div');
        el.className = 'fo-mist';
        el.style.setProperty('--b', `${b}%`);
        el.style.setProperty('--h', `${h}%`);
        el.style.setProperty('--a', `${a}%`);
        el.style.setProperty('--dur', `${dur}s`);
        el.style.setProperty('--delay', `${-between(0, dur).toFixed(1)}s`);
        layer.append(el);
      }
    });
  },
};

const LEAF_PATH = 'M3 21C3 10 10 3 21 3c0 11-7 18-18 18z';

/** A few leaves drifting down: two greens from the text token and one blossom in the accent. */
export const LEAVES = fallingShapes({
  path: LEAF_PATH,
  colors: [
    'oklch(from var(--fx-text) calc(l - 0.36) calc(c + 0.09) h)',
    'oklch(from var(--fx-text) calc(l - 0.3) calc(c + 0.1) calc(h - 55))',
    'oklch(from var(--fx-text) calc(l - 0.42) calc(c + 0.07) h)',
    'var(--fx-accent)',
  ],
  count: { ui: 4, yt: 7 },
  seed: 19,
  sizes: [8, 13],
});
