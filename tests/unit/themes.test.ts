import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEMES } from '@shared/themes';
import {
  buildYtBackgroundCss,
  buildYtColorVarsCss,
  buildYtPolishCss,
  buildYtThemeCss,
  YT_COLOR_ROLES,
} from '../../src/yt/themes/yt-theme';

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
  it('keeps YT colours for the standard theme, only the polish', () => {
    expect(buildYtThemeCss(THEMES.standard)).toBe(buildYtPolishCss(THEMES.standard));
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

  it('only sets colour variables in the colour part', () => {
    const css = buildYtColorVarsCss(THEMES.nordlicht);
    const declarations = css.match(/^\s+[^:]+:/gm)!.map((d) => d.trim());
    expect(declarations.every((d) => d.startsWith('--'))).toBe(true);
  });

  it('replaces the cover-art glow only in Pegel themes', () => {
    expect(buildYtThemeCss(THEMES.sakura)).toContain(buildYtBackgroundCss(THEMES.sakura));
    expect(buildYtThemeCss(THEMES.standard)).not.toContain('opacity: 0');
    // Every theme gets the fix for YT's repeating gradient tile.
    expect(buildYtThemeCss(THEMES.standard)).toContain('background-repeat: no-repeat');
    const props = [...buildYtBackgroundCss(THEMES.bernstein).matchAll(/([a-z-]+)\s*:\s*[^;{}]+;/g)];
    expect(props.map((m) => m[1])).toEqual([
      'background-color',
      'opacity',
      'background-image',
      'background-size',
    ]);
  });

  it('limits the polish to scrollbars and menu surface properties', () => {
    const allowed = new Set([
      'width',
      'height',
      'background',
      'background-color',
      'background-clip',
      'border',
      'border-width',
      'border-radius',
      'box-shadow',
      'display',
      'overflow-x',
      'background-repeat',
      'scrollbar-color',
      'scrollbar-width',
    ]);
    const props = [...buildYtPolishCss(THEMES.sakura).matchAll(/([a-z-]+)\s*:\s*[^;{}]+;/g)].map(
      (m) => m[1]!,
    );
    expect(props.length).toBeGreaterThan(0);
    // No margins or paddings: YT's spacing stays untouched.
    expect(props.filter((p) => !allowed.has(p))).toEqual([]);
  });
});
