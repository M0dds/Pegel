import { THEMES } from '../themes';
import type { ThemeId } from '../types';
import { AURORA } from './aurora';
import { BUBBLES } from './bubbles';
import { NEON } from './neon';
import { FX, FX_ROOT_ID, type EffectPart, type EffectTarget, type ThemeEffect } from './common';
import { FIREFLIES } from './fireflies';
import { LEAVES, WOODS } from './forest';
import { MOTES } from './motes';
import { PETALS } from './petals';
import { RAYS } from './rays';
import { SPARKS } from './sparks';
import { STARS } from './stars';
import { WATER_LIGHT } from './waterlight';

export { FX_ROOT_ID, type EffectPart, type EffectTarget, type ThemeEffect } from './common';

function effect(
  label: string,
  parts: { back?: readonly EffectPart[]; front?: readonly EffectPart[] },
): ThemeEffect {
  return { label, ...parts, layer: parts.back ? 'back' : 'front' };
}

/** The optional effect of each theme (setting `effects.theme`). Standard and Mono stay plain. */
export const THEME_EFFECTS: Partial<Record<ThemeId, ThemeEffect>> = {
  sakura: effect('Fallende Blütenblätter', { front: [PETALS] }),
  nordlicht: effect('Polarlicht im Hintergrund', { back: [AURORA] }),
  bernstein: effect('Lichtstrahlen und Staub', { back: [RAYS], front: [MOTES] }),
  mitternacht: effect('Funkelnder Sternenhimmel', { back: [STARS] }),
  lagune: effect('Unterwasserlicht und Luftblasen', { back: [WATER_LIGHT], front: [BUBBLES] }),
  glut: effect('Aufsteigende Funken', { front: [SPARKS] }),
  wald: effect('Glühwürmchen und Nebel', { back: [WOODS], front: [LEAVES, FIREFLIES] }),
  neon: effect('Neon-Raster im Hintergrund', { back: [NEON] }),
};

export function themeEffect(theme: ThemeId): ThemeEffect | undefined {
  return THEME_EFFECTS[theme];
}

/** Settings hint: what "Bewegung reduzieren" in the system does to the effect. */
export function reducedMotionHint(fx: ThemeEffect): string {
  const when = 'wenn im System „Bewegung reduzieren“ aktiv ist';
  if (fx.back && fx.front) return `Nur der Hintergrund bleibt (ohne Bewegung), ${when}`;
  return fx.back ? `Steht still, ${when}` : `Aus, ${when}`;
}

/** All parts of an effect, for tests and the layer builder. */
export function effectParts(fx: ThemeEffect): EffectPart[] {
  return [...(fx.back ?? []), ...(fx.front ?? [])];
}

const BASE_CSS = `
${FX} { display: contents; }
${FX} > .fx-layer {
  position: fixed; inset: 0; overflow: hidden; pointer-events: none; contain: strict;
}
${FX} > .fx-front { z-index: 2147483000; }
/* Behind all content, above the page background (on <html> or the canvas). */
${FX} > .fx-back { z-index: -1; }
`;

/**
 * YT paints the theme background on <body> as well; it would cover a layer
 * behind the content. <html> keeps the same colour, so nothing changes visibly.
 */
const YT_BACK_CSS = `html body { background-color: transparent !important; }`;

/**
 * Builds the effect of a theme, or only its front parts (null if there is
 * nothing to show); the caller appends it and removes it again. The root takes
 * no space (`display: contents`); its layers are fixed to the viewport.
 * Everything is inside the returned element, including its <style>, so
 * removing it removes every trace.
 */
export function createThemeEffectLayer(
  doc: Document,
  theme: ThemeId,
  target: EffectTarget,
  only?: 'front',
): HTMLElement | null {
  const all = THEME_EFFECTS[theme];
  const fx = all && only === 'front' ? { ...all, back: undefined } : all;
  if (!fx || (only === 'front' && !fx.front)) return null;
  const root = doc.createElement('div');
  root.id = FX_ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  const { tokens } = THEMES[theme];
  root.style.setProperty('--fx-accent', tokens.accent);
  root.style.setProperty('--fx-text', tokens.text);
  root.style.setProperty('--fx-bg', tokens.bg);
  const style = doc.createElement('style');
  style.textContent =
    BASE_CSS +
    effectParts(fx)
      .map((part) => part.css)
      .join('') +
    (fx.back && target === 'yt' ? YT_BACK_CSS : '');
  root.append(style);
  for (const [name, parts] of [
    ['fx-back', fx.back],
    ['fx-front', fx.front],
  ] as const) {
    if (!parts) continue;
    const layer = doc.createElement('div');
    layer.className = `fx-layer ${name}`;
    for (const part of parts) part.build(doc, layer, part.count[target], target);
    root.append(layer);
  }
  return root;
}
