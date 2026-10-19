import { FX, particle, pct, px, rangeRandom, sec, spread, type ThemeEffect } from './common';

/**
 * Lagune: small air bubbles rising through the water. Thin rings with a
 * highlight; the outer element rises, the inner one wobbles.
 */

const TINT = (alpha: number) => `color-mix(in srgb, var(--fx-text) ${alpha}%, transparent)`;

const CSS = `
${FX} .bb {
  position: absolute; left: var(--x); bottom: -20px; opacity: 0;
  animation: pegel-fx-bubble var(--dur) linear var(--delay) infinite;
  will-change: transform, opacity;
}
${FX} .bb i {
  display: block; width: var(--s); height: var(--s); border-radius: 50%;
  border: 1px solid ${TINT(50)};
  background:
    radial-gradient(circle at 32% 30%, ${TINT(75)} 0 12%, transparent 28%),
    radial-gradient(circle, transparent 55%, ${TINT(14)} 100%);
  animation: pegel-fx-wobble var(--sway) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-fx-bubble {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  6% { opacity: var(--alpha); }
  85% { opacity: var(--alpha); }
  100% { transform: translate3d(var(--drift), calc(-100vh - 40px), 0); opacity: 0; }
}
@keyframes pegel-fx-wobble {
  from { transform: translateX(calc(var(--amp) * -1)) scale(1, 0.92); }
  to { transform: translateX(var(--amp)) scale(0.92, 1); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .bb { display: none; }
}
`;

export interface Bubble {
  x: number; // %
  size: number; // px
  dur: number; // s
  delay: number; // s
  sway: number; // s
  amp: number; // px
  drift: number; // px
  alpha: number;
}

export function bubbleConfigs(count: number, seed = 17): Bubble[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(13, 21);
    return {
      x: spread(i, count, between(0, 1)),
      size: between(4, 11),
      dur,
      delay: -between(0, dur),
      sway: between(1.6, 3),
      amp: between(4, 12),
      drift: between(-40, 40),
      alpha: between(0.45, 0.8),
    };
  });
}

export const BUBBLES: ThemeEffect = {
  label: 'Aufsteigende Luftblasen',
  layer: 'front',
  count: { ui: 6, yt: 12 },
  css: CSS,
  build(doc, root, count) {
    for (const b of bubbleConfigs(count)) {
      root.append(
        particle(doc, 'bb', {
          '--x': pct(b.x),
          '--s': px(b.size),
          '--dur': sec(b.dur),
          '--delay': sec(b.delay),
          '--sway': sec(b.sway),
          '--amp': px(b.amp),
          '--drift': px(b.drift),
          '--alpha': b.alpha.toFixed(2),
        }),
      );
    }
  },
};
