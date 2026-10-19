import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PRESETS,
  EQ_BAND_COUNT,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
} from '@shared/presets';
import { THEME_IDS, THEME_TOKENS, THEMES, isThemeId } from '@shared/themes';

describe('built-in presets', () => {
  it('match the mockup order', () => {
    expect(BUILTIN_PRESETS.map((p) => p.name)).toEqual([
      'Flat',
      'Bass Boost',
      'Vocal',
      'Akustik',
      'Elektronisch',
      'Loudness',
    ]);
  });

  it.each(BUILTIN_PRESETS)('$name has valid gains and preamp', (preset) => {
    expect(preset.gains).toHaveLength(EQ_BAND_COUNT);
    for (const g of preset.gains) {
      expect(g).toBeGreaterThanOrEqual(EQ_GAIN_MIN);
      expect(g).toBeLessThanOrEqual(EQ_GAIN_MAX);
    }
    expect(preset.preamp).toBeGreaterThanOrEqual(EQ_PREAMP_MIN);
    expect(preset.preamp).toBeLessThanOrEqual(EQ_PREAMP_MAX);
    // Preamp follows the auto-preamp rule so nothing clips (`+ 0` normalises -0).
    expect(preset.preamp).toBe(-Math.max(0, ...preset.gains) + 0);
  });
});

describe('themes', () => {
  it('contain all themes in display order', () => {
    expect(THEME_IDS).toEqual([
      'standard',
      'sakura',
      'nordlicht',
      'bernstein',
      'mitternacht',
      'lagune',
      'glut',
      'wald',
      'neon',
      'mono',
    ]);
  });

  it.each(THEME_IDS)('%s defines every token as a hex colour', (id) => {
    const { tokens } = THEMES[id];
    expect(Object.keys(tokens).sort()).toEqual([...THEME_TOKENS].sort());
    for (const value of Object.values(tokens))
      expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  });

  it('validates theme ids', () => {
    expect(isThemeId('sakura')).toBe(true);
    expect(isThemeId('toString')).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });
});
