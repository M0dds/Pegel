import { FX, particle, pct, px, rangeRandom, sec, spread, type EffectPart } from './common';

/**
 * Wald: fireflies wandering through the lower part of the window, glowing up
 * and fading out again with long dark pauses. The glow is the text token with
 * more chroma: a pale forest green.
 */

const GLOW = 'oklch(from var(--fx-text) l calc(c + 0.09) h)';

const CSS = `
${FX} .ff {
  position: absolute; left: var(--x); top: var(--y);
  animation: pegel-fx-wander var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform;
}
${FX} .ff i {
  display: block; width: var(--s); height: var(--s); border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, ${GLOW} 0 22%, color-mix(in srgb, ${GLOW} 30%, transparent) 45%, transparent 70%);
  animation: pegel-fx-glow var(--blink) ease-in-out var(--delay2) infinite;
  will-change: opacity;
}
@keyframes pegel-fx-wander {
  0% { transform: translate3d(0, 0, 0); }
  33% { transform: translate3d(var(--dx1), var(--dy1), 0); }
  66% { transform: translate3d(var(--dx2), var(--dy2), 0); }
  100% { transform: translate3d(var(--dx3), var(--dy3), 0); }
}
@keyframes pegel-fx-glow {
  0%, 100% { opacity: 0; }
  18%, 38% { opacity: var(--alpha); }
  58% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ff { display: none; }
}
`;

export interface Firefly {
  x: number; // %
  y: number; // %
  size: number; // px (with halo)
  path: [number, number, number, number, number, number]; // px waypoints
  dur: number; // s for the wander
  delay: number; // s
  blink: number; // s for one glow cycle
  blinkDelay: number; // s
  alpha: number;
}

export function fireflyConfigs(count: number, seed = 29): Firefly[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(14, 24);
    const blink = between(4, 7.5);
    return {
      x: spread(i, count, between(0, 1)),
      y: between(32, 92),
      size: between(7, 11),
      path: [
        between(-60, 60),
        between(-40, 30),
        between(-90, 90),
        between(-70, 40),
        between(-60, 60),
        between(-30, 30),
      ],
      dur,
      delay: -between(0, dur),
      blink,
      blinkDelay: -between(0, blink),
      alpha: between(0.55, 0.9),
    };
  });
}

export const FIREFLIES: EffectPart = {
  count: { ui: 6, yt: 12 },
  css: CSS,
  build(doc, root, count) {
    for (const f of fireflyConfigs(count)) {
      const [dx1, dy1, dx2, dy2, dx3, dy3] = f.path;
      root.append(
        particle(doc, 'ff', {
          '--x': pct(f.x),
          '--y': pct(f.y),
          '--s': px(f.size),
          '--dx1': px(dx1),
          '--dy1': px(dy1),
          '--dx2': px(dx2),
          '--dy2': px(dy2),
          '--dx3': px(dx3),
          '--dy3': px(dy3),
          '--dur': sec(f.dur),
          '--delay': sec(f.delay),
          '--blink': sec(f.blink),
          '--delay2': sec(f.blinkDelay),
          '--alpha': f.alpha.toFixed(2),
        }),
      );
    }
  },
};
