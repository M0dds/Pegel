import { FX, particle, pct, px, rangeRandom, sec, spread, type EffectPart } from './common';

/**
 * Bernstein: warm dust motes floating like in late sunlight. Each mote
 * drifts slowly along its own path and fades in and out twice per cycle.
 */

const CSS = `
${FX} .mt {
  position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s);
  border-radius: 50%; opacity: 0;
  background: radial-gradient(circle, var(--fx-accent) 0, color-mix(in srgb, var(--fx-accent) 40%, transparent) 40%, transparent 70%);
  animation: pegel-fx-drift var(--dur) ease-in-out var(--delay) infinite;
  will-change: transform, opacity;
}
@keyframes pegel-fx-drift {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  25% { opacity: var(--alpha); }
  50% { transform: translate3d(var(--dx1), var(--dy1), 0); opacity: calc(var(--alpha) * 0.4); }
  75% { opacity: var(--alpha); }
  100% { transform: translate3d(var(--dx2), var(--dy2), 0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .mt { display: none; }
}
`;

export interface Mote {
  x: number; // %
  y: number; // %
  size: number; // px
  dx1: number; // px, waypoints of the drift
  dy1: number;
  dx2: number;
  dy2: number;
  dur: number; // s
  delay: number; // s
  alpha: number;
}

export function moteConfigs(count: number, seed = 13): Mote[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(16, 28);
    return {
      x: spread(i, count, between(0, 1)),
      y: between(8, 92),
      size: between(4, 9),
      dx1: between(-50, 50),
      dy1: between(-45, 15),
      dx2: between(-70, 70),
      dy2: between(-80, 10),
      dur,
      delay: -between(0, dur),
      alpha: between(0.35, 0.65),
    };
  });
}

export const MOTES: EffectPart = {
  count: { ui: 10, yt: 18 },
  css: CSS,
  build(doc, root, count) {
    for (const m of moteConfigs(count)) {
      root.append(
        particle(
          doc,
          'mt',
          {
            '--x': pct(m.x),
            '--y': pct(m.y),
            '--s': px(m.size),
            '--dx1': px(m.dx1),
            '--dy1': px(m.dy1),
            '--dx2': px(m.dx2),
            '--dy2': px(m.dy2),
            '--dur': sec(m.dur),
            '--delay': sec(m.delay),
            '--alpha': m.alpha.toFixed(2),
          },
          false,
        ),
      );
    }
  },
};
