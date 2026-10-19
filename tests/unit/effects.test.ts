import { describe, expect, it } from 'vitest';
import { petalConfigs } from '@shared/petals';
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
    expect(DEFAULT_SETTINGS.effects).toEqual({ petals: true, visualizer: true });
    expect(normalizeSettings({ effects: { petals: false, visualizer: 'ja' } }).effects).toEqual({
      petals: false,
      visualizer: true,
    });
  });
});
