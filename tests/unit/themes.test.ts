import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEMES } from '@shared/themes';
import { buildYtThemeCss, YT_COLOR_ROLES } from '../../src/yt/themes/yt-theme';

/** WCAG relative luminance of an opaque #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('theme contrast (WCAG AA)', () => {
  it.each(THEME_IDS)('%s keeps text readable', (id) => {
    const t = THEMES[id].tokens;
    for (const bg of [t.bg, t.surface, t['surface-2']]) {
      expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['text-dim'], bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Buttons/chips with bold text on accent. Standard's white on #ff1f4b (from the
    // mockup, like YT's own white on red) reaches 3.8:1, so 3:1 is the floor here.
    expect(contrast(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(id === 'standard' ? 3 : 4.5);
    // Accent is used for progress bars, toggles and links on dark backgrounds.
    expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('buildYtThemeCss', () => {
  it('leaves the standard theme to YT', () => {
    expect(buildYtThemeCss(THEMES.standard)).toBeNull();
  });

  it('maps every listed variable to the theme token', () => {
    const css = buildYtThemeCss(THEMES.sakura)!;
    for (const [token, vars] of Object.entries(YT_COLOR_ROLES)) {
      const value = THEMES.sakura.tokens[token as keyof typeof THEMES.sakura.tokens];
      for (const name of vars!) expect(css).toContain(`${name}: ${value} !important;`);
    }
  });

  it('recolours the progress bar gradient', () => {
    expect(buildYtThemeCss(THEMES.bernstein)).toContain(
      '--paper-slider-active-color: #f2a93b !important;',
    );
  });

  it('only sets colour variables, no layout properties', () => {
    const css = buildYtThemeCss(THEMES.nordlicht)!;
    const declarations = css.match(/^\s+[^:]+:/gm)!.map((d) => d.trim());
    expect(declarations.every((d) => d.startsWith('--'))).toBe(true);
  });
});
