import { FX, particle, pct, px, rangeRandom, sec, spread, type ThemeEffect } from './common';

/**
 * Mitternacht: a sky of softly twinkling stars behind the content, denser
 * towards the top, a few of them in the gold accent. Now and then a shooting
 * star crosses the upper part (visible for a fraction of its long cycle).
 */

const CSS = `
${FX} .st {
  position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s);
  border-radius: 50%; background: var(--c); opacity: var(--lo);
  animation: pegel-fx-twinkle var(--dur) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-fx-twinkle {
  to { opacity: var(--hi); transform: scale(1.35); }
}
${FX} .ss {
  position: absolute; left: 72%; top: 9%; width: 120px; height: 1px; opacity: 0;
  background: linear-gradient(90deg, var(--fx-text), transparent);
  animation: pegel-fx-shoot 29s ease-in 6s infinite;
}
@keyframes pegel-fx-shoot {
  0%, 94% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-26.6deg); }
  94.6% { opacity: 0.7; }
  97.5%, 100% { opacity: 0; transform: translate3d(-340px, 170px, 0) rotate(-26.6deg); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .st { animation: none; }
  ${FX} .ss { display: none; }
}
`;

export interface Star {
  x: number; // %
  y: number; // %
  size: number; // px
  lo: number; // opacity range of the twinkle
  hi: number;
  dur: number; // s
  delay: number; // s
  gold: boolean;
}

export function starConfigs(count: number, seed = 23): Star[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(2.8, 6.5);
    const lo = between(0.12, 0.3);
    return {
      x: spread(i, count, between(0, 1)),
      // Squared: more stars near the top, the sky thins out downwards.
      y: between(0, 1) ** 2 * 78,
      size: between(1, 2.2),
      lo,
      hi: lo + between(0.3, 0.55),
      dur,
      delay: -between(0, dur * 2),
      gold: i % 6 === 2,
    };
  });
}

export const STARS: ThemeEffect = {
  label: 'Sternenhimmel im Hintergrund',
  layer: 'back',
  count: { ui: 26, yt: 44 },
  css: CSS,
  build(doc, root, count) {
    for (const s of starConfigs(count)) {
      root.append(
        particle(
          doc,
          'st',
          {
            '--x': pct(s.x),
            '--y': pct(s.y),
            '--s': px(s.size),
            '--lo': s.lo.toFixed(2),
            '--hi': s.hi.toFixed(2),
            '--dur': sec(s.dur),
            '--delay': sec(s.delay),
            '--c': s.gold ? 'var(--fx-accent)' : 'var(--fx-text)',
          },
          false,
        ),
      );
    }
    root.append(particle(doc, 'ss', {}, false));
  },
};
