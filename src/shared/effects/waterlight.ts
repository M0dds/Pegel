import { FX, particle, pct, rangeRandom, sec, type EffectPart } from './common';

/**
 * Lagune: light falling through the water surface, behind the content.
 * Wide soft bands in the upper part, streaked like light shafts, that slowly
 * drift, stretch and breathe. Gradients instead of a blur filter, so the
 * compositor only moves finished layers. (This was Nordlicht's first aurora.)
 */

/**
 * Band colours: turquoise, aqua and a cooler cyan, from the theme's pale
 * blue-green text token with more colour (the accent is coral, not water).
 */
const BAND_COLORS = [
  'oklch(from var(--fx-text) calc(l - 0.18) calc(c + 0.09) h)',
  'oklch(from var(--fx-text) calc(l - 0.24) calc(c + 0.1) calc(h - 25))',
  'oklch(from var(--fx-text) calc(l - 0.12) calc(c + 0.06) calc(h + 20))',
];

/** Soft, uneven vertical streaks, like shafts of light under water. */
const CURTAIN =
  'repeating-linear-gradient(90deg, #000 0, #000b 1.6%, #000 3.1%, #000d 4.4%, #000 5.2%, #000a 7%, #000 9.4%)';

const CSS = `
${FX} .wl {
  position: absolute; left: -25%; width: 150%; top: var(--top); height: var(--h);
  background: radial-gradient(closest-side, var(--c) 0%, color-mix(in srgb, var(--c) 45%, transparent) 45%, transparent 100%);
  -webkit-mask-image: ${CURTAIN};
  mask-image: ${CURTAIN};
  opacity: var(--alpha); transform-origin: 50% 0;
  animation: pegel-fx-waterlight var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform, opacity;
}
@keyframes pegel-fx-waterlight {
  0% { transform: translate3d(-7%, 0, 0) scaleY(0.82) skewX(-10deg); opacity: calc(var(--alpha) * 0.55); }
  50% { transform: translate3d(1%, 2vh, 0) scaleY(1.12) skewX(3deg); opacity: var(--alpha); }
  100% { transform: translate3d(8%, -1vh, 0) scaleY(0.94) skewX(11deg); opacity: calc(var(--alpha) * 0.7); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .wl { animation: none; }
}
`;

export interface LightBand {
  top: number; // % of the height
  height: number; // % of the height
  dur: number; // s for one sweep
  delay: number; // s, negative so the bands are out of step from the start
  alpha: number;
  color: string;
}

export function waterLightBands(count: number, seed = 11): LightBand[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(18, 28);
    return {
      top: -14 + i * 9 + between(0, 6),
      height: between(38, 52),
      dur,
      delay: -between(0, dur),
      alpha: between(0.16, 0.26),
      color: BAND_COLORS[i % BAND_COLORS.length]!,
    };
  });
}

export const WATER_LIGHT: EffectPart = {
  count: { small: 3, large: 3 },
  css: CSS,
  build(doc, root, count) {
    for (const b of waterLightBands(count)) {
      root.append(
        particle(
          doc,
          'wl',
          {
            '--top': pct(b.top),
            '--h': pct(b.height),
            '--dur': sec(b.dur),
            '--delay': sec(b.delay),
            '--alpha': b.alpha.toFixed(2),
            '--c': b.color,
          },
          false,
        ),
      );
    }
  },
};
