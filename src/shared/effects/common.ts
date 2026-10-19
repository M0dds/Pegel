/** Root element of the theme effect, in the Pegel UI and over the YT page. */
export const FX_ROOT_ID = 'pegel-fx';
/** CSS prefix every effect scopes its rules with. */
export const FX = `#${FX_ROOT_ID}`;

export type EffectTarget = 'ui' | 'yt';

/**
 * A theme's optional animated extra. Pure CSS animations on transform and
 * opacity, so they run on the compositor; nothing takes pointer events.
 * Colours come from CSS variables the layer sets from the theme tokens:
 * `--fx-accent`, `--fx-text`, `--fx-bg`.
 */
export interface ThemeEffect {
  /** Name of the switch in the settings (German UI). */
  label: string;
  /** `front` floats over everything (like the petals), `back` sits behind the content. */
  layer: 'front' | 'back';
  /** Number of particles (or bands) in the Pegel UI and over the YT page. */
  count: Record<EffectTarget, number>;
  /** Rules scoped with `FX`, including the `prefers-reduced-motion` fallback. */
  css: string;
  build(doc: Document, root: HTMLElement, count: number): void;
}

/** Small deterministic PRNG so every start looks the same (and tests are stable). */
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Random numbers in a range, from a seeded PRNG. */
export function rangeRandom(seed: number): (a: number, b: number) => number {
  const rnd = random(seed);
  return (a, b) => a + (b - a) * rnd();
}

/** Evenly spread with jitter (0…100 %), so particles never clump on one side. */
export function spread(i: number, count: number, jitter: number): number {
  return ((i + 0.5 + (jitter - 0.5) * 0.8) / count) * 100;
}

/** Creates a particle element with the given CSS variables. */
export function particle(
  doc: Document,
  className: string,
  vars: Record<string, string>,
  inner = true,
): HTMLElement {
  const el = doc.createElement('span');
  el.className = className;
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  if (inner) el.append(doc.createElement('i'));
  return el;
}

export const px = (n: number) => `${n.toFixed(1)}px`;
export const pct = (n: number) => `${n.toFixed(2)}%`;
export const sec = (n: number) => `${n.toFixed(2)}s`;
