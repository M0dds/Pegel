import { describe, expect, it } from 'vitest';
import { THEME_EFFECTS } from '@shared/effects';
import { auroraBands } from '@shared/effects/aurora';
import { bubbleConfigs } from '@shared/effects/bubbles';
import { fireflyConfigs } from '@shared/effects/fireflies';
import { moteConfigs } from '@shared/effects/motes';
import { petalConfigs } from '@shared/effects/petals';
import { sparkConfigs } from '@shared/effects/sparks';
import { starConfigs } from '@shared/effects/stars';
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings';
import { bandBins } from '../../src/yt/audio/visualizer';

describe('petals', () => {
  it('are deterministic and spread across the width', () => {
    const a = petalConfigs(10);
    expect(petalConfigs(10)).toEqual(a);
    const xs = a.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(15);
    expect(Math.max(...xs)).toBeGreaterThan(85);
    // One petal per slot of the width, so they never clump.
    xs.forEach((x, i) => expect(Math.floor(x / 10)).toBe(i));
  });

  it('start spread over their fall (negative delays within one pass)', () => {
    for (const p of petalConfigs(14)) {
      expect(p.delay).toBeLessThanOrEqual(0);
      expect(p.delay).toBeGreaterThanOrEqual(-p.fall);
      expect(p.size).toBeGreaterThanOrEqual(9);
      expect(p.size).toBeLessThanOrEqual(16);
    }
  });
});

describe('theme effects', () => {
  const particles = {
    sparks: sparkConfigs,
    motes: moteConfigs,
    bubbles: bubbleConfigs,
    fireflies: fireflyConfigs,
    stars: starConfigs,
  };

  it.each(Object.entries(particles))(
    '%s are deterministic and spread across the width',
    (_, make) => {
      const a = make(12);
      expect(make(12)).toEqual(a);
      const xs = a.map((p) => p.x);
      for (const x of xs) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(100);
      }
      // At most one particle per slot of the width, so they never clump.
      expect(new Set(xs.map((x) => Math.floor((x / 100) * 12))).size).toBe(12);
      // Negative delays: already spread out over their cycle from the start.
      for (const p of a) expect(p.delay).toBeLessThanOrEqual(0);
    },
  );

  it('aurora bands stay in the upper part of the window', () => {
    for (const b of auroraBands(3)) {
      expect(b.top).toBeLessThan(20);
      expect(b.top + b.height).toBeLessThan(80);
      expect(b.alpha).toBeLessThanOrEqual(0.35);
    }
  });

  it('exist for the themes with a fitting one, scoped and with a reduced-motion fallback', () => {
    expect(Object.keys(THEME_EFFECTS).sort()).toEqual(
      ['bernstein', 'glut', 'lagune', 'mitternacht', 'nordlicht', 'sakura', 'wald'].sort(),
    );
    expect(THEME_EFFECTS.nordlicht?.layer).toBe('back');
    expect(THEME_EFFECTS.glut?.layer).toBe('front');
    for (const effect of Object.values(THEME_EFFECTS)) {
      expect(effect.css).toContain('prefers-reduced-motion');
      // Every rule (apart from at-rules and keyframe steps) is scoped to the layer.
      const selectors = effect.css
        .split('\n')
        .filter((line) => line.trimEnd().endsWith('{'))
        .map((line) => line.trim())
        .filter((line) => !/^(@|from|to|[\d.%, ]+\{)/.test(line));
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) expect(selector).toMatch(/^#pegel-fx /);
      expect(effect.count.yt).toBeGreaterThanOrEqual(effect.count.ui);
    }
  });
});

describe('visualizer bands', () => {
  it('are log-spaced, ascending and inside the FFT range', () => {
    const edges = bandBins(60, 2048, 48000);
    expect(edges).toHaveLength(61);
    for (let i = 1; i < edges.length; i++) expect(edges[i]!).toBeGreaterThanOrEqual(edges[i - 1]!);
    expect(edges[0]).toBe(Math.round(40 / (24000 / 2048)));
    expect(edges.at(-1)).toBeLessThan(2048);
    // Low bands are narrow, high bands wide (log scale).
    expect(edges[1]! - edges[0]!).toBeLessThan(edges[60]! - edges[59]!);
  });
});

describe('effects settings', () => {
  it('default to on and keep valid values', () => {
    expect(DEFAULT_SETTINGS.effects).toEqual({ theme: true, visualizer: true });
    expect(normalizeSettings({ effects: { theme: false, visualizer: 'ja' } }).effects).toEqual({
      theme: false,
      visualizer: true,
    });
  });

  it('take over the petals switch from 1.1.0', () => {
    expect(normalizeSettings({ effects: { petals: false } }).effects.theme).toBe(false);
    expect(normalizeSettings({ effects: { petals: false, theme: true } }).effects.theme).toBe(true);
  });
});
