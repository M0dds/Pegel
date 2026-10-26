import { FX, rangeRandom, type EffectPart } from './common';
import { fallingShapes } from './petals';

/**
 * Wald: behind the content, a faint glow of light in the sky and slowly
 * drifting mist down to the bottom edge. In front, a few leaves fall (see LEAVES)
 * and the fireflies wander.
 */

const CSS = `
${FX} .fo-sky {
  position: absolute; inset: 0;
  background: radial-gradient(70% 55% at 78% 0%, color-mix(in srgb, var(--fx-text) 7%, transparent), transparent 70%);
}
/* Ground fog: lies on the bottom edge, so the mist never ends above it in a dark strip. */
${FX} .fo-ground {
  position: absolute; left: 0; right: 0; bottom: 0; height: 22%;
  background: linear-gradient(to top, color-mix(in srgb, var(--fx-text) 6%, transparent), transparent);
}
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
  /* Ground fog: lies on the bottom edge, so the mist never ends above it in a dark strip. */
${FX} .fo-ground {
  position: absolute; left: 0; right: 0; bottom: 0; height: 22%;
  background: linear-gradient(to top, color-mix(in srgb, var(--fx-text) 6%, transparent), transparent);
}
${FX} .fo-mist { animation: none; }
}
`;

/** Mist bands: bottom (%), height (%), alpha (%), cycle (s). */
const MIST: readonly [number, number, number, number][] = [
  [8, 24, 6, 48],
  // Centred just above the edge, half of it below the window.
  [-12, 28, 6, 37],
];

export const WOODS: EffectPart = {
  count: { small: 1, large: 1 },
  css: CSS,
  build(doc, layer) {
    const between = rangeRandom(41);
    const sky = doc.createElement('div');
    sky.className = 'fo-sky';
    const ground = doc.createElement('div');
    ground.className = 'fo-ground';
    layer.append(sky, ground);
    for (const [b, h, a, dur] of MIST) {
      const el = doc.createElement('div');
      el.className = 'fo-mist';
      el.style.setProperty('--b', `${b}%`);
      el.style.setProperty('--h', `${h}%`);
      el.style.setProperty('--a', `${a}%`);
      el.style.setProperty('--dur', `${dur}s`);
      el.style.setProperty('--delay', `${-between(0, dur).toFixed(1)}s`);
      layer.append(el);
    }
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
  count: { small: 4, large: 7 },
  seed: 19,
  sizes: [8, 13],
});
