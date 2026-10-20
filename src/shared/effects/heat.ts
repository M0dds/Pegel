import { FX, rangeRandom, sec, type EffectPart } from './common';

/**
 * Glut: heat rising at the bottom edge, behind the content. A warm glow that
 * breathes unevenly like embers, and faint rippled bands that waver sideways,
 * lean back and forth and drift up while they fade: a heat shimmer, drawn as
 * its own light. Nothing is actually distorted (no backdrop filter), so text
 * and controls stay sharp; only transform and opacity move.
 */

const WARM = 'oklch(from var(--fx-accent) calc(l + 0.08) c calc(h + 12))';

const CSS = `
${FX} .ht-glow {
  position: absolute; left: -10%; right: -10%; bottom: 0; height: var(--h);
  background:
    radial-gradient(70% 100% at var(--cx) 100%, color-mix(in srgb, var(--fx-accent) var(--a), transparent), transparent 75%);
  transform-origin: 50% 100%;
  animation: pegel-fx-embers var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform, opacity;
}
@keyframes pegel-fx-embers {
  0% { opacity: 0.55; transform: scaleY(0.9); }
  35% { opacity: 0.9; transform: scaleY(1.04); }
  60% { opacity: 0.7; transform: scaleY(0.96); }
  100% { opacity: 1; transform: scaleY(1.08); }
}
${FX} .ht-wave {
  position: absolute; left: -10%; right: -10%; bottom: var(--b); height: var(--h);
  background: repeating-linear-gradient(90deg,
    transparent 0, color-mix(in srgb, ${WARM} 9%, transparent) var(--p1),
    transparent var(--p2), color-mix(in srgb, ${WARM} 5%, transparent) var(--p3), transparent var(--p4));
  -webkit-mask-image: radial-gradient(60% 50% at 50% 50%, #000, transparent);
  mask-image: radial-gradient(60% 50% at 50% 50%, #000, transparent);
  opacity: 0;
  animation: pegel-fx-shimmer var(--dur) ease-in-out var(--delay) infinite;
  will-change: transform, opacity;
}
@keyframes pegel-fx-shimmer {
  0% { opacity: 0; transform: translate3d(0, 0, 0) skewX(-6deg) scaleY(0.8); }
  25% { opacity: 1; transform: translate3d(-1.2%, -1.5vh, 0) skewX(5deg) scaleY(1); }
  50% { opacity: 0.8; transform: translate3d(1%, -3vh, 0) skewX(-4deg) scaleY(1.1); }
  75% { opacity: 0.5; transform: translate3d(-0.8%, -4.5vh, 0) skewX(4deg) scaleY(1.15); }
  100% { opacity: 0; transform: translate3d(0.6%, -6vh, 0) skewX(-3deg) scaleY(1.2); }
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ht-glow { animation: none; opacity: 0.8; }
  ${FX} .ht-wave { display: none; }
}
`;

export interface HeatWave {
  bottom: number; // vh
  height: number; // vh
  /** Ripple stops (px): light, gap, faint light, period. Uneven, so it looks wavy. */
  ripple: [number, number, number, number];
  dur: number; // s
  delay: number; // s
}

export function heatWaves(count: number, seed = 61): HeatWave[] {
  const between = rangeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const dur = between(3.2, 5.5);
    const p1 = between(5, 10);
    const p2 = p1 + between(6, 12);
    const p3 = p2 + between(4, 8);
    return {
      bottom: (i % 3) * 3 + between(0, 3),
      height: between(7, 12),
      ripple: [p1, p2, p3, p3 + between(6, 14)],
      dur,
      // Spread over the cycle, so a new band always rises somewhere.
      delay: -((i + between(0, 0.6)) / count) * dur,
    };
  });
}

/** Two ember glows that breathe out of step: cycle (s), height (vh), strength (%), centre (%). */
const GLOWS: readonly [number, number, number, number][] = [
  [3.7, 20, 13, 35],
  [5.3, 14, 9, 70],
];

export const HEAT: EffectPart = {
  /** Shimmer bands. */
  count: { ui: 4, yt: 6 },
  css: CSS,
  build(doc, layer, count) {
    const between = rangeRandom(67);
    for (const [dur, h, a, cx] of GLOWS) {
      const glow = doc.createElement('div');
      glow.className = 'ht-glow';
      glow.style.setProperty('--dur', sec(dur));
      glow.style.setProperty('--delay', sec(-between(0, dur)));
      glow.style.setProperty('--h', `${h}vh`);
      glow.style.setProperty('--a', `${a}%`);
      glow.style.setProperty('--cx', `${cx}%`);
      layer.append(glow);
    }
    for (const w of heatWaves(count)) {
      const wave = doc.createElement('div');
      wave.className = 'ht-wave';
      wave.style.setProperty('--b', `${w.bottom.toFixed(1)}vh`);
      wave.style.setProperty('--h', `${w.height.toFixed(1)}vh`);
      w.ripple.forEach((p, i) => wave.style.setProperty(`--p${i + 1}`, `${p.toFixed(1)}px`));
      wave.style.setProperty('--dur', sec(w.dur));
      wave.style.setProperty('--delay', sec(w.delay));
      layer.append(wave);
    }
  },
};
