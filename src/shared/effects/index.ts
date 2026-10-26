import { THEMES } from '../themes';
import type { ThemeId } from '../types';
import { AURORA } from './aurora';
import { BUBBLES } from './bubbles';
import { NEON } from './neon';
import { FX, FX_ROOT_ID, type EffectPart, type EffectSize, type ThemeEffect } from './common';
import { FIREFLIES } from './fireflies';
import { LEAVES, WOODS } from './forest';
import { MOTES } from './motes';
import { PETALS } from './petals';
import { RAYS } from './rays';
import { SPARKS } from './sparks';
import { STARS } from './stars';
import { WATER_LIGHT } from './waterlight';

export { FX_ROOT_ID, type EffectPart, type EffectSize, type ThemeEffect } from './common';

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
/* Behind all content, above the page background. */
${FX} > .fx-back { z-index: -1; }
`;

/**
 * Which layers a document shows, and how big its area is. The back layer lives
 * only in the main window, behind everything (the YT view is see-through);
 * the YT page and the panel card add the front layer over their content.
 */
export type EffectLayers = Partial<Record<'back' | 'front', EffectSize>>;

/**
 * Builds the effect of a theme (null if the theme has none or none of the
 * wanted layers); the caller appends it and removes it again. The root takes
 * no space (`display: contents`); its layers are fixed to the viewport.
 * Everything is inside the returned element, including its <style>, so
 * removing it removes every trace.
 */
export function createThemeEffectLayer(
  doc: Document,
  theme: ThemeId,
  layers: EffectLayers,
): HTMLElement | null {
  const fx = THEME_EFFECTS[theme];
  const back = layers.back && fx?.back;
  const front = layers.front && fx?.front;
  if (!back && !front) return null;
  const root = doc.createElement('div');
  root.id = FX_ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  const { tokens } = THEMES[theme];
  root.style.setProperty('--fx-accent', tokens.accent);
  root.style.setProperty('--fx-text', tokens.text);
  root.style.setProperty('--fx-bg', tokens.bg);
  const style = doc.createElement('style');
  style.textContent = BASE_CSS + [...(back || []), ...(front || [])].map((p) => p.css).join('');
  root.append(style);
  for (const [name, parts, size] of [
    ['fx-back', back, layers.back],
    ['fx-front', front, layers.front],
  ] as const) {
    if (!parts || !size) continue;
    const layer = doc.createElement('div');
    layer.className = `fx-layer ${name}`;
    for (const part of parts) part.build(doc, layer, part.count[size]);
    root.append(layer);
  }
  return root;
}
