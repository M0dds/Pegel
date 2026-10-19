import { THEMES } from '../themes';
import type { ThemeId } from '../types';
import { AURORA } from './aurora';
import { BUBBLES } from './bubbles';
import { FX, FX_ROOT_ID, type EffectTarget, type ThemeEffect } from './common';
import { FIREFLIES } from './fireflies';
import { MOTES } from './motes';
import { PETALS } from './petals';
import { SPARKS } from './sparks';
import { STARS } from './stars';

export { FX_ROOT_ID, type EffectTarget, type ThemeEffect } from './common';

/** The optional effect of each theme (setting `effects.theme`). Standard, Neon and Mono stay plain. */
export const THEME_EFFECTS: Partial<Record<ThemeId, ThemeEffect>> = {
  sakura: PETALS,
  nordlicht: AURORA,
  bernstein: MOTES,
  mitternacht: STARS,
  lagune: BUBBLES,
  glut: SPARKS,
  wald: FIREFLIES,
};

export function themeEffect(theme: ThemeId): ThemeEffect | undefined {
  return THEME_EFFECTS[theme];
}

const BASE_CSS = `
${FX} {
  position: fixed; inset: 0; overflow: hidden; pointer-events: none; contain: strict;
}
${FX}.fx-front { z-index: 2147483000; }
/* Behind all content, above the page background (on <html> or the canvas). */
${FX}.fx-back { z-index: -1; }
`;

/**
 * YT paints the theme background on <body> as well; it would cover a layer
 * behind the content. <html> keeps the same colour, so nothing changes visibly.
 */
const YT_BACK_CSS = `html body { background-color: transparent !important; }`;

/**
 * Builds the effect layer of a theme (null if the theme has none); the caller
 * appends it and removes it again. Everything is inside the returned element,
 * including its <style>, so removing it removes every trace.
 */
export function createThemeEffectLayer(
  doc: Document,
  theme: ThemeId,
  target: EffectTarget,
): HTMLElement | null {
  const effect = THEME_EFFECTS[theme];
  if (!effect) return null;
  const root = doc.createElement('div');
  root.id = FX_ROOT_ID;
  root.className = `fx-${effect.layer}`;
  root.setAttribute('aria-hidden', 'true');
  const { tokens } = THEMES[theme];
  root.style.setProperty('--fx-accent', tokens.accent);
  root.style.setProperty('--fx-text', tokens.text);
  root.style.setProperty('--fx-bg', tokens.bg);
  const style = doc.createElement('style');
  style.textContent =
    BASE_CSS + effect.css + (effect.layer === 'back' && target === 'yt' ? YT_BACK_CSS : '');
  root.append(style);
  effect.build(doc, root, effect.count[target]);
  return root;
}
