import { FX, particle, pct, px, rangeRandom, sec, type EffectPart } from './common';

/**
 * Neon: a quiet cyberpunk backdrop behind the content. A soft magenta glow
 * on a thin neon horizon, a perspective grid slowly running towards the
 * viewer below it, a little fine rain and faint scanlines. Cyan is the
 * accent, magenta is the accent turned on the colour wheel.
 */

const CYAN = 'var(--fx-accent)';
const MAGENTA = 'oklch(from var(--fx-accent) calc(l - 0.12) calc(c + 0.06) calc(h + 135))';
const HORIZON = 72; // % from the top

const CSS = `
${FX} .ny-glow {
  position: absolute; left: 0; right: 0; top: ${HORIZON - 30}%; height: 30%;
  background:
    radial-gradient(60% 100% at 50% 100%, color-mix(in srgb, ${MAGENTA} 18%, transparent), transparent 70%),
    radial-gradient(30% 70% at 22% 100%, color-mix(in srgb, ${CYAN} 8%, transparent), transparent 70%);
  animation: pegel-fx-neon-pulse 9s ease-in-out infinite alternate;
}
@keyframes pegel-fx-neon-pulse {
  from { opacity: 0.65; }
  to { opacity: 1; }
}
${FX} .ny-horizon {
  position: absolute; left: 0; right: 0; top: ${HORIZON}%; height: 1px;
  background: linear-gradient(90deg, transparent, ${MAGENTA} 20%, ${CYAN} 50%, ${MAGENTA} 80%, transparent);
  box-shadow: 0 0 10px 1px color-mix(in srgb, ${MAGENTA} 35%, transparent);
  opacity: 0.45;
}
${FX} .ny-floor {
  position: absolute; left: 0; right: 0; top: ${HORIZON}%; bottom: 0; overflow: hidden;
  perspective: 260px; perspective-origin: 50% 0;
  opacity: 0.55;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 55%);
  mask-image: linear-gradient(to bottom, transparent, #000 55%);
}
${FX} .ny-plane {
  position: absolute; left: -100%; width: 300%; top: 0; height: 400%;
  transform-origin: 50% 0;
  background:
    repeating-linear-gradient(90deg, color-mix(in srgb, ${CYAN} 26%, transparent) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, color-mix(in srgb, ${MAGENTA} 30%, transparent) 0 1px, transparent 1px 64px);
  animation: pegel-fx-grid 4.5s linear infinite;
  will-change: transform;
}
@keyframes pegel-fx-grid {
  from { transform: rotateX(76deg) translateY(-64px); }
  to { transform: rotateX(76deg) translateY(0); }
}
${FX} .ny-rain {
  position: absolute; top: 0; left: var(--x); width: 1px; height: var(--len);
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, ${CYAN} 45%, transparent));
  opacity: var(--alpha);
  animation: pegel-fx-rain var(--dur) linear var(--delay) infinite;
  will-change: transform;
}
@keyframes pegel-fx-rain {
  from { transform: translate3d(0, -20vh, 0) rotate(8deg); }
  to { transform: translate3d(-14vh, 110vh, 0) rotate(8deg); }
}
${FX} .ny-scan {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(0deg, #0000 0 2px, #0000001c 2px 3px);
}
@media (prefers-reduced-motion: reduce) {
  ${FX} .ny-glow, ${FX} .ny-plane { animation: none; }
  ${FX} .ny-plane { transform: rotateX(76deg); }
  ${FX} .ny-rain { display: none; }
}
`;

export const NEON: EffectPart = {
  /** Rain drops. */
  count: { ui: 10, yt: 16 },
  css: CSS,
  build(doc, layer, count) {
    const between = rangeRandom(37);
    const div = (className: string) => {
      const el = doc.createElement('div');
      el.className = className;
      return el;
    };
    const floor = div('ny-floor');
    floor.append(div('ny-plane'));
    layer.append(div('ny-glow'), div('ny-horizon'), floor);
    for (let i = 0; i < count; i++) {
      const dur = between(1.1, 1.8);
      layer.append(
        particle(
          doc,
          'ny-rain',
          {
            '--x': pct(between(0, 115)),
            '--len': px(between(40, 80)),
            '--alpha': between(0.1, 0.22).toFixed(2),
            '--dur': sec(dur),
            '--delay': sec(-between(0, dur)),
          },
          false,
        ),
      );
    }
    layer.append(div('ny-scan'));
  },
};
