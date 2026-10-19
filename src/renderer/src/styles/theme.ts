import { THEME_TOKENS, THEMES } from '@shared/themes';
import type { ThemeId } from '@shared/types';

/** Sets the theme tokens as CSS variables on :root. */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  const { tokens } = THEMES[id];
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, tokens[token]);
  root.dataset['theme'] = id;
}
