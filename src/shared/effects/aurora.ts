import { FX, particle, pct, rangeRandom, sec, type ThemeEffect } from './common';

/**
 * Nordlicht: aurora bands across the upper part of the window, behind the
 * content. Each band is a wide soft ellipse with a curtain-like stripe mask
 * that slowly drifts, stretches and breathes. Gradients instead of a blur
 * filter, so the compositor only moves finished layers.
 */

/** Band colours, all derived from the accent: itself, a cooler and a greener shade. */
const BAND_COLORS = [
  'var(--fx-accent)',
  'oklch(from var(--fx-accent) l c calc(h + 48))',
  'oklch(from var(--fx-accent) calc(l + 0.06) c calc(h - 28))',
];

/** Soft, uneven vertical folds, so the bands look like curtains, not like stripes. */
const CURTAIN =
  'repeating-linear-gradient(90deg, #000 0, #000b 1.6%, #000 3.1%, #000d 4.4%, #000 5.2%, #000a 7%, #000 9.4%)';

const CSS = `
${FX} .au {
  position: absolute; left: -25%; width: 150%; top: var(--top); height: var(--h);
  background: radial-gradient(closest-side, var(--c) 0%, color-mix(in srgb, var(--c) 45%, transparent) 45%, transparent 100%);
  -webkit-mask-image: ${CURTAIN};
  mask-image: ${CURTAIN};
  opacity: var(--alpha); transform-origin: 50% 0;
  animation: pegel-fx-aurora var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform, opacity;
}
@keyframes pegel-fx-aurora {
  0% { transform: translate3d(-7%, 0, 0) scaleY(0.82) skewX(-10deg); opacity: calc(var(--alpha) * 0.55); }
  50% { transform: translate3d(1%, 2vh, 0) scaleY(1.12) skewX(3deg); opacity: var(--alpha); }
  100% { transform: translate3d(8%, -1vh, 0) scaleY(0.94) skewX(11deg); opacity: calc(var(--alpha) * 0.7); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .au { animation: none; }
}
`;

export interface AuroraBand {
  top: number; // % of the height
  height: number; // % of the height
  dur: number; // s for one sweep
  delay: number; // s, negative so the bands are out of step from the start
  alpha: number;
  color: string;
}

export function auroraBands(count: number, seed = 11): AuroraBand[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(22, 34);
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

export const AURORA: ThemeEffect = {
  label: 'Polarlicht im Hintergrund',
  layer: 'back',
  count: { ui: 3, yt: 3 },
  css: CSS,
  build(doc, root, count) {
    for (const b of auroraBands(count)) {
      root.append(
        particle(
          doc,
          'au',
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
