import { FX, particle, pct, px, rangeRandom, sec, type EffectPart } from './common';

/**
 * Sakura: falling petals. Each petal falls on its own path: an outer element
 * falls (linear), the inner one sways sideways and tumbles (rotate + rotateY
 * for the 3D flip).
 */

const PETAL_PATH =
  'M12 3.2c1-1.5 2.5-2 3.4-1.3C20.3 5.8 19.7 14.6 12 22 4.3 14.6 3.7 5.8 8.6 1.9c.9-.7 2.4-.2 3.4 1.3z';

const CSS = `
${FX} .pp {
  position: absolute; top: 0; left: var(--x);
  animation: pegel-petal-fall var(--fall) linear var(--delay) infinite;
  will-change: transform;
}
${FX} .pp svg {
  display: block; width: var(--size); height: var(--size); opacity: var(--alpha);
  fill: var(--fill, var(--fx-accent));
  animation: pegel-petal-sway var(--sway) ease-in-out var(--delay) infinite alternate;
}
@keyframes pegel-petal-fall {
  from { transform: translate3d(0, -40px, 0); }
  to { transform: translate3d(var(--drift), calc(100vh + 40px), 0); }
}
@keyframes pegel-petal-sway {
  from { transform: translateX(calc(var(--amp) * -1)) rotate(var(--r0)) rotateY(0deg); }
  to { transform: translateX(var(--amp)) rotate(var(--r1)) rotateY(70deg); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .pp { display: none; }
}
`;

export interface PetalConfig {
  x: number; // % of the width
  size: number; // px
  fall: number; // s for one pass top to bottom
  delay: number; // s, negative so petals are spread out from the start
  sway: number; // s for one side-to-side swing
  amp: number; // px of the swing
  drift: number; // px sideways over the whole fall (wind)
  r0: number; // deg
  r1: number; // deg
  alpha: number;
}

export function petalConfigs(
  count: number,
  seed = 7,
  sizes: [number, number] = [9, 16],
): PetalConfig[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const fall = between(11, 19);
    return {
      x: ((i + between(0.1, 0.9)) / count) * 100,
      size: between(...sizes),
      fall,
      delay: -between(0, fall),
      sway: between(2.2, 4),
      amp: between(14, 34),
      drift: between(-60, 120),
      r0: between(-40, 0),
      r1: between(20, 70),
      alpha: between(0.5, 0.85),
    };
  });
}

export interface FallingOptions {
  /** SVG path in a 24 × 24 box. */
  path: string;
  /** Fill colours, used in turn. */
  colors: readonly string[];
  count: EffectPart['count'];
  seed?: number;
  sizes?: [number, number];
}

/** Shapes falling and tumbling like the petals (also used for Wald's leaves). */
export function fallingShapes({
  path,
  colors,
  count,
  seed = 7,
  sizes,
}: FallingOptions): EffectPart {
  return {
    count,
    css: CSS,
    build(doc, root, n) {
      const ns = 'http://www.w3.org/2000/svg';
      petalConfigs(n, seed, sizes).forEach((p, i) => {
        const petal = particle(
          doc,
          'pp',
          {
            '--x': pct(p.x),
            '--size': px(p.size),
            '--fall': sec(p.fall),
            '--delay': sec(p.delay),
            '--sway': sec(p.sway),
            '--amp': px(p.amp),
            '--drift': px(p.drift),
            '--r0': `${p.r0.toFixed(1)}deg`,
            '--r1': `${p.r1.toFixed(1)}deg`,
            '--alpha': p.alpha.toFixed(2),
            '--fill': colors[i % colors.length]!,
          },
          false,
        );
        const svg = doc.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const shape = doc.createElementNS(ns, 'path');
        shape.setAttribute('d', path);
        svg.append(shape);
        petal.append(svg);
        root.append(petal);
      });
    },
  };
}

/** Sakura: the accent and a lighter, almost white pink, for depth against the dark background. */
export const PETALS = fallingShapes({
  path: PETAL_PATH,
  colors: [
    'var(--fx-accent)',
    'color-mix(in oklch, var(--fx-accent) 55%, var(--fx-text))',
    'var(--fx-accent)',
    'color-mix(in oklch, var(--fx-accent) 80%, var(--fx-bg))',
  ],
  count: { ui: 8, yt: 14 },
});
