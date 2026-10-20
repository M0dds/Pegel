import { describe, expect, it } from 'vitest';
import { effectParts, reducedMotionHint, THEME_EFFECTS } from '@shared/effects';
import { rayConfigs } from '@shared/effects/rays';
import { CURTAINS, curtainEdge, rayLevel } from '@shared/effects/aurora';
import { bubbleConfigs } from '@shared/effects/bubbles';
import { fireflyConfigs } from '@shared/effects/fireflies';
import { heatWaves } from '@shared/effects/heat';
import { moteConfigs } from '@shared/effects/motes';
import { petalConfigs } from '@shared/effects/petals';
import { sparkConfigs } from '@shared/effects/sparks';
import { starConfigs } from '@shared/effects/stars';
import { waterLightBands } from '@shared/effects/waterlight';
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
    fireflies: fireflyConfigs,
    stars: starConfigs,
  };

  it.each(Object.entries(particles))(
    '%s are deterministic and spread across the width',
    (_, make) => {
      const a = make(12).filter((p) => !('follower' in p) || !p.follower);
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

  it('bubbles: big ones rise faster, every fourth pulls two tiny followers', () => {
    const all = bubbleConfigs(12);
    expect(bubbleConfigs(12)).toEqual(all);
    const main = all.filter((b) => !b.follower);
    expect(main).toHaveLength(12);
    expect(all.length - main.length).toBe(6);
    const xs = main.map((b) => b.x);
    expect(new Set(xs.map((x) => Math.floor((x / 100) * 12))).size).toBe(12);
    for (const b of all) {
      expect(b.delay).toBeLessThanOrEqual(0);
      expect(b.delay).toBeGreaterThanOrEqual(-b.dur);
    }
    const bySize = [...main].sort((a, b) => a.size - b.size);
    expect(bySize[0]!.dur).toBeGreaterThan(bySize.at(-1)!.dur);
  });

  it('aurora curtains run diagonally with a bright lower edge inside the sky', () => {
    for (const c of CURTAINS) {
      expect(c.y1).toBeLessThan(c.y0);
      for (const t of [0, 37, 500]) {
        for (let u = 0; u <= 1; u += 0.05) {
          const edge = curtainEdge(c, u, t);
          expect(edge).toBeGreaterThan(0.05);
          expect(edge).toBeLessThan(0.9);
          const level = rayLevel(c, u * 300, u, t);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(c.strength);
        }
      }
    }
    // Fine rays: neighbouring columns differ, the curtain is not a flat band.
    const c = CURTAINS[0]!;
    const brightest = Math.max(...Array.from({ length: 21 }, (_, i) => rayLevel(c, 0, i / 20, 10)));
    const u = Array.from({ length: 21 }, (_, i) => i / 20).find(
      (v) => rayLevel(c, 0, v, 10) === brightest,
    )!;
    const levels = Array.from({ length: 60 }, (_, x) => rayLevel(c, x, u, 10));
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.2);
  });

  it('heat shimmer stays low and keeps a band rising at any time', () => {
    const waves = heatWaves(6);
    expect(heatWaves(6)).toEqual(waves);
    for (const w of waves) {
      expect(w.bottom + w.height).toBeLessThan(20);
      expect(w.delay).toBeLessThanOrEqual(0);
      expect(w.delay).toBeGreaterThan(-w.dur);
      expect(w.ripple).toEqual([...w.ripple].sort((a, b) => a - b));
    }
    // Phases spread over the cycle (no two bands start together).
    const phases = waves.map((w) => -w.delay / w.dur).sort();
    for (let i = 1; i < phases.length; i++)
      expect(phases[i]! - phases[i - 1]!).toBeGreaterThan(0.02);
  });

  it('underwater light stays in the upper part of the window', () => {
    for (const b of waterLightBands(3)) {
      expect(b.top).toBeLessThan(20);
      expect(b.top + b.height).toBeLessThan(80);
      expect(b.alpha).toBeLessThanOrEqual(0.35);
    }
  });

  it('exist for the themes with a fitting one, scoped and with a reduced-motion fallback', () => {
    expect(Object.keys(THEME_EFFECTS).sort()).toEqual(
      ['bernstein', 'glut', 'lagune', 'mitternacht', 'neon', 'nordlicht', 'sakura', 'wald'].sort(),
    );
    expect(THEME_EFFECTS.nordlicht?.layer).toBe('back');
    expect(THEME_EFFECTS.sakura?.layer).toBe('front');
    expect(THEME_EFFECTS.glut?.back?.length).toBeGreaterThan(0);
    // Back and front: the main layer is the back one (it stands still with reduced motion).
    expect(THEME_EFFECTS.wald?.layer).toBe('back');
    expect(THEME_EFFECTS.wald?.front?.length).toBeGreaterThan(0);
    expect(reducedMotionHint(THEME_EFFECTS.wald!)).toMatch(/^Nur der Hintergrund/);
    expect(reducedMotionHint(THEME_EFFECTS.mitternacht!)).toMatch(/^Steht still/);
    expect(reducedMotionHint(THEME_EFFECTS.sakura!)).toMatch(/^Aus/);
    for (const effect of Object.values(THEME_EFFECTS)) {
      for (const part of effectParts(effect)) {
        expect(part.css).toContain('prefers-reduced-motion');
        // Every rule (apart from at-rules and keyframe steps) is scoped to the layer.
        const selectors = part.css
          .split('\n')
          .filter((line) => line.trimEnd().endsWith('{'))
          .map((line) => line.trim())
          .filter((line) => !/^(@|from|to|[\d.%, ]+\{)/.test(line));
        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors) {
          for (const one of selector.replace(/\s*\{$/, '').split(',')) {
            expect(one.trim()).toMatch(/^#pegel-fx /);
          }
        }
        expect(part.count.yt).toBeGreaterThanOrEqual(part.count.ui);
      }
    }
  });

  it('let light shafts start near the upper left and lean the same way', () => {
    for (const r of rayConfigs(5)) {
      expect(r.x).toBeLessThan(50);
      expect(r.angle).toBeLessThan(-20);
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
