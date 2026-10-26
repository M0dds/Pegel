import { FX, pct, rangeRandom, sec, type EffectPart } from './common';

/**
 * Bernstein: late sunlight falling in from the upper left behind the content.
 * A warm glow in the corner and a few soft light shafts that slowly breathe
 * and sway; the dust motes (front) drift through them.
 */

const CSS = `
${FX} .ry-sun {
  position: absolute; inset: 0;
  background:
    radial-gradient(55% 45% at 0% 0%, color-mix(in srgb, var(--fx-accent) 16%, transparent), transparent 70%),
    radial-gradient(90% 70% at 100% 100%, color-mix(in srgb, var(--fx-accent) 5%, transparent), transparent 70%);
}
${FX} .ry {
  position: absolute; top: -30%; left: var(--x); width: var(--w); height: 170%;
  transform-origin: 50% 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--fx-accent) var(--a), transparent) 50%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, #000 15%, transparent 80%);
  mask-image: linear-gradient(to bottom, #000 15%, transparent 80%);
  animation: pegel-fx-ray var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform, opacity;
}
@keyframes pegel-fx-ray {
  from { transform: rotate(calc(var(--r) - 2.5deg)); opacity: 0.45; }
  to { transform: rotate(calc(var(--r) + 2.5deg)); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ry { animation: none; transform: rotate(var(--r)); opacity: 0.8; }
}
`;

export interface Ray {
  x: number; // % of the width, where the shaft starts above the window
  w: number; // vw
  angle: number; // deg
  alpha: number; // % of the accent
  dur: number; // s
  delay: number; // s
}

export function rayConfigs(count: number, seed = 43): Ray[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(12, 22);
    return {
      x: -6 + i * (46 / count) + between(0, 8),
      w: between(7, 18),
      angle: between(-38, -28),
      alpha: between(7, 13),
      dur,
      delay: -between(0, dur),
    };
  });
}

export const RAYS: EffectPart = {
  count: { small: 4, large: 5 },
  css: CSS,
  build(doc, layer, count) {
    const sun = doc.createElement('div');
    sun.className = 'ry-sun';
    layer.append(sun);
    for (const r of rayConfigs(count)) {
      const el = doc.createElement('span');
      el.className = 'ry';
      el.style.setProperty('--x', pct(r.x));
      el.style.setProperty('--w', `${r.w.toFixed(1)}vw`);
      el.style.setProperty('--r', `${r.angle.toFixed(1)}deg`);
      el.style.setProperty('--a', `${r.alpha.toFixed(1)}%`);
      el.style.setProperty('--dur', sec(r.dur));
      el.style.setProperty('--delay', sec(r.delay));
      layer.append(el);
    }
  },
};
