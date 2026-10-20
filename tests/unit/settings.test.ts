import { describe, expect, it } from 'vitest';
import { clampDb, DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings';

describe('normalizeSettings', () => {
  it('returns defaults for missing or broken input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('does not share arrays with the defaults', () => {
    const s = normalizeSettings(undefined);
    s.eq.gains[0] = 5;
    expect(DEFAULT_SETTINGS.eq.gains[0]).toBe(0);
  });

  it('keeps valid values', () => {
    const input = {
      ...DEFAULT_SETTINGS,
      theme: 'sakura',
      window: { maximized: true, bounds: { x: 10, y: 20, width: 1000, height: 700 } },
    };
    expect(normalizeSettings(input)).toEqual(input);
  });

  it('replaces invalid values with defaults', () => {
    const s = normalizeSettings({
      theme: 'regenbogen',
      closeToTray: 'yes',
      window: { bounds: { x: 0, y: 0, width: -5, height: 100 } },
      eq: { gains: [1, 2, 3] },
    });
    expect(s.theme).toBe('standard');
    expect(s.closeToTray).toBe(true);
    expect(s.window.bounds).toBeUndefined();
    expect(s.eq.gains).toEqual(DEFAULT_SETTINGS.eq.gains);
  });

  it('clamps and rounds EQ values', () => {
    const s = normalizeSettings({
      eq: { gains: [20, -20, 1.3, 0, 0, 0, 0, 0, 0, -0.2], preamp: 9 },
    });
    expect(s.eq.gains).toEqual([12, -12, 1.5, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.eq.preamp).toBe(6);
  });

  it('drops invalid custom presets', () => {
    const s = normalizeSettings({
      eq: {
        customPresets: [
          { name: ' Mein Preset ', gains: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], preamp: -1 },
          { name: '', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          { name: 'Kaputt', gains: [1] },
          'nope',
        ],
      },
    });
    expect(s.eq.customPresets).toEqual([
      { name: 'Mein Preset', gains: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], preamp: -1 },
    ]);
  });
});

describe('clampDb', () => {
  it('never returns negative zero', () => {
    expect(Object.is(clampDb(-0.1, -12, 12), 0)).toBe(true);
  });
});

describe('social notifications', () => {
  it('are on by default and keep a stored choice', () => {
    expect(normalizeSettings({}).social.notifications).toBe(true);
    expect(normalizeSettings({ social: { notifications: false } }).social.notifications).toBe(
      false,
    );
    expect(normalizeSettings({ social: { notifications: 'nein' } }).social.notifications).toBe(
      true,
    );
  });
});
