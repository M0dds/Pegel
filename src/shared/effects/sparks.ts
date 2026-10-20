import { FX, particle, pct, px, rangeRandom, sec, spread, type EffectPart } from './common';

/**
 * Glut: small glowing sparks rising from the bottom edge. The outer element
 * rises and fades out, the inner one jitters sideways and flickers.
 */

const CSS = `
${FX} .sk {
  position: absolute; left: var(--x); bottom: -8px; opacity: 0;
  animation: pegel-fx-rise var(--dur) cubic-bezier(0.25, 0.6, 0.55, 1) var(--delay) infinite;
  will-change: transform, opacity;
}
${FX} .sk i {
  display: block; width: var(--s); height: var(--s); border-radius: 50%;
  background: radial-gradient(circle, oklch(from var(--fx-accent) calc(l + 0.18) c h) 0 30%, var(--fx-accent) 55%, transparent 72%);
  box-shadow: 0 0 8px 2px color-mix(in srgb, var(--fx-accent) 45%, transparent);
  animation: pegel-fx-flicker var(--fl) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-fx-rise {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  8% { opacity: var(--alpha); }
  65% { opacity: calc(var(--alpha) * 0.75); }
  100% { transform: translate3d(var(--drift), calc(var(--rise) * -1), 0); opacity: 0; }
}
@keyframes pegel-fx-flicker {
  from { transform: translateX(calc(var(--amp) * -1)) scale(1); opacity: 1; }
  to { transform: translateX(var(--amp)) scale(0.6); opacity: 0.5; }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .sk { display: none; }
}
`;

export interface Spark {
  x: number; // %
  size: number; // px
  rise: number; // vh
  drift: number; // px
  dur: number; // s
  delay: number; // s
  flicker: number; // s
  amp: number; // px
  alpha: number;
}

export function sparkConfigs(count: number, seed = 5): Spark[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(5.5, 10);
    return {
      x: spread(i, count, between(0, 1)),
      size: between(2.6, 4.4),
      rise: between(35, 75),
      drift: between(-50, 70),
      dur,
      delay: -between(0, dur),
      flicker: between(0.5, 1.3),
      amp: between(3, 9),
      alpha: between(0.55, 0.9),
    };
  });
}

export const SPARKS: EffectPart = {
  count: { ui: 8, yt: 16 },
  css: CSS,
  build(doc, root, count) {
    for (const s of sparkConfigs(count)) {
      root.append(
        particle(doc, 'sk', {
          '--x': pct(s.x),
          '--s': px(s.size),
          '--rise': `${s.rise.toFixed(1)}vh`,
          '--drift': px(s.drift),
          '--dur': sec(s.dur),
          '--delay': sec(s.delay),
          '--fl': sec(s.flicker),
          '--amp': px(s.amp),
          '--alpha': s.alpha.toFixed(2),
        }),
      );
    }
  },
};
