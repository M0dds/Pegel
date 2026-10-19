/**
 * Falling Sakura petals, used in the Pegel UI and (injected) in the YT view.
 * Pure CSS animation on transform/opacity, so it runs on the compositor.
 * Each petal falls on its own path: an outer element falls (linear), the
 * inner one sways sideways and tumbles (rotate + rotateY for the 3D flip).
 */

const PETAL_PATH =
  'M12 3.2c1-1.5 2.5-2 3.4-1.3C20.3 5.8 19.7 14.6 12 22 4.3 14.6 3.7 5.8 8.6 1.9c.9-.7 2.4-.2 3.4 1.3z';

export const PETAL_ROOT_ID = 'pegel-petals';

export const PETAL_CSS = `
#${PETAL_ROOT_ID} {
  position: fixed; inset: 0; overflow: hidden; pointer-events: none;
  z-index: 2147483000; contain: strict;
}
#${PETAL_ROOT_ID} .pp {
  position: absolute; top: 0; left: var(--x);
  animation: pegel-petal-fall var(--fall) linear var(--delay) infinite;
  will-change: transform;
}
#${PETAL_ROOT_ID} .pp svg {
  display: block; width: var(--size); height: var(--size); opacity: var(--alpha);
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
  #${PETAL_ROOT_ID} { display: none; }
}
`;

/** Small deterministic PRNG so every start looks the same (and tests are stable). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

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

export function petalConfigs(count: number, seed = 7): PetalConfig[] {
  const rnd = random(seed);
  const between = (a: number, b: number) => a + (b - a) * rnd();
  return Array.from({ length: count }, (_, i) => {
    const fall = between(11, 19);
    return {
      // Spread evenly with jitter, so petals never clump on one side.
      x: ((i + between(0.1, 0.9)) / count) * 100,
      size: between(9, 16),
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

/** Builds the petal layer; the caller appends it and removes it again. */
export function createPetalLayer(doc: Document, color: string, count: number): HTMLElement {
  const root = doc.createElement('div');
  root.id = PETAL_ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  const style = doc.createElement('style');
  style.textContent = PETAL_CSS;
  root.append(style);
  const ns = 'http://www.w3.org/2000/svg';
  for (const p of petalConfigs(count)) {
    const petal = doc.createElement('span');
    petal.className = 'pp';
    const vars: Record<string, string> = {
      '--x': `${p.x.toFixed(2)}%`,
      '--size': `${p.size.toFixed(1)}px`,
      '--fall': `${p.fall.toFixed(2)}s`,
      '--delay': `${p.delay.toFixed(2)}s`,
      '--sway': `${p.sway.toFixed(2)}s`,
      '--amp': `${p.amp.toFixed(1)}px`,
      '--drift': `${p.drift.toFixed(1)}px`,
      '--r0': `${p.r0.toFixed(1)}deg`,
      '--r1': `${p.r1.toFixed(1)}deg`,
      '--alpha': p.alpha.toFixed(2),
    };
    for (const [name, value] of Object.entries(vars)) petal.style.setProperty(name, value);
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', PETAL_PATH);
    path.setAttribute('fill', color);
    svg.append(path);
    petal.append(svg);
    root.append(petal);
  }
  return root;
}
