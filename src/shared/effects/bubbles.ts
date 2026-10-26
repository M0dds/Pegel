import { FX, particle, pct, px, rangeRandom, sec, spread, type EffectPart } from './common';

/**
 * Lagune: air bubbles rising through the water. Bigger bubbles rise faster,
 * small ones wobble quicker; all of them grow a little on the way up (less
 * pressure) and fade out towards the surface. A thin rim lit from above, a
 * bright highlight and a faint second reflection; some bubbles pull two
 * tiny ones behind them. The outer element rises, the inner one wobbles.
 */

const TINT = (alpha: number) =>
  `color-mix(in srgb, oklch(from var(--fx-text) l calc(c + 0.03) h) ${alpha}%, transparent)`;

const CSS = `
${FX} .bb {
  position: absolute; left: var(--x); bottom: -20px; opacity: 0;
  animation: pegel-fx-bubble var(--dur) linear var(--delay) infinite;
  will-change: transform, opacity;
}
${FX} .bb i {
  display: block; width: var(--s); height: var(--s); border-radius: 50%;
  border: 1px solid ${TINT(28)}; border-top-color: ${TINT(70)};
  background:
    radial-gradient(circle at 32% 28%, ${TINT(85)} 0 10%, transparent 24%),
    radial-gradient(circle at 70% 76%, ${TINT(30)} 0 6%, transparent 16%),
    radial-gradient(circle, ${TINT(4)} 45%, ${TINT(18)} 100%);
  animation: pegel-fx-wobble var(--sway) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-fx-bubble {
  0% { transform: translate3d(0, 0, 0) scale(0.8); opacity: 0; }
  5% { opacity: var(--alpha); }
  45% { opacity: var(--alpha); }
  100% { transform: translate3d(var(--drift), calc(-100vh - 40px), 0) scale(1.15); opacity: 0; }
}
@keyframes pegel-fx-wobble {
  from { transform: translateX(calc(var(--amp) * -1)) scale(1.06, 0.92); }
  to { transform: translateX(var(--amp)) scale(0.92, 1.06); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .bb { display: none; }
}
`;

export interface Bubble {
  x: number; // %
  size: number; // px
  dur: number; // s for the way up
  delay: number; // s
  sway: number; // s for one wobble
  amp: number; // px
  drift: number; // px
  alpha: number;
  /** Tiny bubble trailing behind a bigger one. */
  follower: boolean;
}

/** Main bubbles; every fourth one pulls two tiny followers on nearly the same path. */
export function bubbleConfigs(count: number, seed = 17): Bubble[] {
  const between = rangeRandom(seed);
  const bubbles: Bubble[] = [];
  for (let i = 0; i < count; i++) {
    const size = between(3, 14);
    // Big bubbles rise faster and wobble slower.
    const dur = 21 - size * 0.8 + between(-1.5, 1.5);
    const bubble: Bubble = {
      x: spread(i, count, between(0, 1)),
      size,
      dur,
      delay: -between(0, dur),
      sway: 0.7 + size * 0.12 + between(0, 0.4),
      amp: 2 + size * 0.5 + between(0, 3),
      drift: between(-40, 40),
      alpha: between(0.45, 0.8),
      follower: false,
    };
    bubbles.push(bubble);
    if (i % 4 === 1) {
      for (const lag of [0.5, 1.05]) {
        bubbles.push({
          ...bubble,
          x: bubble.x + between(-0.4, 0.4),
          size: between(2, 3.5),
          // A little later on the same cycle (wrapped, so it never waits at the start).
          delay: bubble.delay + lag > 0 ? bubble.delay + lag - dur : bubble.delay + lag,
          sway: between(0.6, 0.9),
          amp: between(2, 4),
          alpha: bubble.alpha * 0.8,
          follower: true,
        });
      }
    }
  }
  return bubbles;
}

export const BUBBLES: EffectPart = {
  count: { ui: 7, yt: 14 },
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
