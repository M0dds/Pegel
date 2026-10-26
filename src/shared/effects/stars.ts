import { FX, particle, pct, px, rangeRandom, sec, spread, type EffectPart } from './common';

/**
 * Mitternacht: a sky of twinkling stars behind the content, denser towards
 * the top, a few in the gold accent. Some bright ones sparkle with a small
 * cross of light. The whole sky turns very slowly, and shooting stars cross
 * it now and then (each visible for a fraction of its own long cycle).
 */

const CSS = `
${FX} .sky {
  position: absolute; inset: -10%;
  transform-origin: 50% -60%;
  animation: pegel-fx-sky 180s ease-in-out infinite alternate;
  will-change: transform;
}
@keyframes pegel-fx-sky {
  from { transform: rotate(-2.5deg); }
  to { transform: rotate(2.5deg); }
}
${FX} .st {
  position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s);
  border-radius: 50%; background: var(--c); opacity: var(--lo);
  animation: pegel-fx-twinkle var(--dur) ease-in-out var(--delay) infinite alternate;
}
${FX} .st.big { box-shadow: 0 0 6px 1px color-mix(in srgb, var(--c) 55%, transparent); }
${FX} .st.big::before, ${FX} .st.big::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 900%; height: 1px;
  background: linear-gradient(90deg, transparent, var(--c), transparent);
  transform: translate(-50%, -50%);
}
${FX} .st.big::after { transform: translate(-50%, -50%) rotate(90deg); }
@keyframes pegel-fx-twinkle {
  to { opacity: var(--hi); transform: scale(var(--grow)); }
}
${FX} .ss {
  position: absolute; left: var(--x); top: var(--y); width: 150px; height: 1.5px; opacity: 0;
  border-radius: 1px;
  background: linear-gradient(90deg, var(--fx-text), color-mix(in srgb, var(--fx-accent) 50%, transparent) 30%, transparent);
  animation: pegel-fx-shoot var(--dur) ease-in var(--delay) infinite;
}
@keyframes pegel-fx-shoot {
  0%, 92% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-26.6deg) scaleX(0.4); }
  93% { opacity: 0.85; }
  96.5%, 100% { opacity: 0; transform: translate3d(-380px, 190px, 0) rotate(-26.6deg) scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .sky, ${FX} .st { animation: none; }
  ${FX} .ss { display: none; }
}
`;

export interface Star {
  x: number; // %
  y: number; // %
  size: number; // px
  lo: number; // opacity range of the twinkle
  hi: number;
  grow: number; // scale at the brightest point
  dur: number; // s
  delay: number; // s
  gold: boolean;
  /** Bright star with a sparkle cross. */
  big: boolean;
}

export function starConfigs(count: number, seed = 23): Star[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const big = i % 9 === 4;
    const dur = big ? between(2.4, 4.2) : between(1.6, 4.4);
    const lo = between(0.1, 0.28);
    return {
      x: spread(i, count, between(0, 1)),
      // Squared: more stars near the top, the sky thins out downwards.
      y: between(0, 1) ** 2 * 80,
      size: big ? between(2.2, 2.8) : between(1, 2.2),
      lo,
      hi: Math.min(1, lo + between(0.45, 0.75)),
      grow: big ? between(1.3, 1.6) : between(1.2, 1.7),
      dur,
      delay: -between(0, dur * 2),
      gold: i % 6 === 2,
      big,
    };
  });
}

/** Shooting stars: start (%), cycle and offset (s). Different cycles, so they never line up. */
const SHOOTING: readonly [number, number, number, number][] = [
  [74, 8, 23, 4],
  [46, 3, 31, 15],
  [96, 20, 41, 27],
];

export const STARS: EffectPart = {
  count: { ui: 34, yt: 64 },
  css: CSS,
  build(doc, layer, count) {
    const sky = doc.createElement('div');
    sky.className = 'sky';
    for (const s of starConfigs(count)) {
      sky.append(
        particle(
          doc,
          s.big ? 'st big' : 'st',
          {
            '--x': pct(s.x),
            '--y': pct(s.y),
            '--s': px(s.size),
            '--lo': s.lo.toFixed(2),
            '--hi': s.hi.toFixed(2),
            '--grow': s.grow.toFixed(2),
            '--dur': sec(s.dur),
            '--delay': sec(s.delay),
            '--c': s.gold ? 'var(--fx-accent)' : 'var(--fx-text)',
          },
          false,
        ),
      );
    }
    layer.append(sky);
    for (const [x, y, dur, delay] of SHOOTING) {
      layer.append(
        particle(
          doc,
          'ss',
          { '--x': pct(x), '--y': pct(y), '--dur': sec(dur), '--delay': sec(delay) },
          false,
        ),
      );
    }
  },
};
