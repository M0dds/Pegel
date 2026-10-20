import { describe, expect, it } from 'vitest';
import { effectParts, reducedMotionHint, THEME_EFFECTS } from '@shared/effects';
import { firPath } from '@shared/effects/forest';
import { MOON_PASS_S, moonLit, moonPath, moonState } from '@shared/effects/moon';
import { rayConfigs } from '@shared/effects/rays';
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
      ['bernstein', 'glut', 'lagune', 'mitternacht', 'neon', 'nordlicht', 'sakura', 'wald'].sort(),
    );
    expect(THEME_EFFECTS.nordlicht?.layer).toBe('back');
    expect(THEME_EFFECTS.glut?.layer).toBe('front');
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

  it('draw fir trees as closed shapes standing on the ground', () => {
    const d = firPath(100, 280, 120, 60);
    expect(d.startsWith('M100.0 160.0')).toBe(true);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d).toContain('V280');
  });

  it('let light shafts start near the upper left and lean the same way', () => {
    for (const r of rayConfigs(5)) {
      expect(r.x).toBeLessThan(50);
      expect(r.angle).toBeLessThan(-20);
    }
  });
});

describe('moon', () => {
  it('goes through the phases in order, one per pass', () => {
    const pass = MOON_PASS_S * 1000;
    const phases = Array.from({ length: 10 }, (_, i) => moonState(i * pass + pass / 2).phase);
    expect(phases).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
    expect(moonState(pass * 3 + pass / 4).progress).toBeCloseTo(0.25);
  });

  it('is dark at new moon, round at full moon, lit on the right while waxing', () => {
    expect(moonPath(0)).toBe('');
    expect(moonPath(4)).toContain('A1 1 0 1 1 0 1');
    // Waxing: the limb runs clockwise over the right side, waning over the left.
    for (const i of [1, 2, 3]) expect(moonPath(i)).toMatch(/^M0 -1A1 1 0 0 1 0 1/);
    for (const i of [5, 6, 7]) expect(moonPath(i)).toMatch(/^M0 -1A1 1 0 0 0 0 1/);
    // Quarter moons: a straight terminator.
    expect(moonPath(2)).toContain('A0 1 ');
    // Crescents are thin, gibbous moons full: the terminator bulges the other way.
    expect(moonPath(1)).toMatch(/A0\.7071 1 0 0 0 0 -1Z$/);
    expect(moonPath(3)).toMatch(/A0\.7071 1 0 0 1 0 -1Z$/);
    expect(moonLit(0)).toBe(0);
    expect(moonLit(4)).toBe(1);
    expect(moonLit(2)).toBeCloseTo(0.5);
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
