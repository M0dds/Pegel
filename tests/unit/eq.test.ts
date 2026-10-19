import { describe, expect, it } from 'vitest';
import {
  autoPreamp,
  effectivePreamp,
  formatDb,
  isEqAction,
  reduceEq,
  validPresetName,
  type EqAction,
} from '@shared/eq';
import { DEFAULT_SETTINGS } from '@shared/settings';
import type { EqSettings } from '@shared/types';

const base: EqSettings = structuredClone(DEFAULT_SETTINGS.eq);
const run = (...actions: EqAction[]) => actions.reduce(reduceEq, base);

describe('preamp', () => {
  it('auto preamp offsets the loudest boost', () => {
    expect(autoPreamp([6, 5, 4, 2, 0, 0, 0, 0, 0, 0])).toBe(-6);
    expect(autoPreamp([-3, -2, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(Object.is(autoPreamp([0, 0]), 0)).toBe(true);
  });

  it('uses the manual value when auto is off', () => {
    expect(effectivePreamp({ gains: [6], preamp: -2, autoPreamp: false })).toBe(-2);
    expect(effectivePreamp({ gains: [6], preamp: -2, autoPreamp: true })).toBe(-6);
  });

  it('turning auto off keeps the current value', () => {
    const eq = run({ type: 'applyPreset', name: 'Vocal' }, { type: 'setAutoPreamp', auto: false });
    expect(eq.autoPreamp).toBe(false);
    expect(eq.preamp).toBe(-4);
  });

  it('moving the preamp slider switches auto off and clamps', () => {
    const eq = run({ type: 'setPreamp', preamp: 10 });
    expect(eq).toMatchObject({ autoPreamp: false, preamp: 6 });
  });
});

describe('bands', () => {
  it('clamps, rounds and marks the preset as custom', () => {
    const eq = run(
      { type: 'setBand', index: 2, gain: 13.2 },
      { type: 'setBand', index: 3, gain: 1.26 },
    );
    expect(eq.gains.slice(0, 4)).toEqual([0, 0, 12, 1.5]);
    expect(eq.preset).toBe('Eigene');
  });

  it('ignores invalid band indices', () => {
    expect(run({ type: 'setBand', index: 10, gain: 3 })).toBe(base);
    expect(run({ type: 'setBand', index: 1.5, gain: 3 })).toBe(base);
  });
});

describe('presets', () => {
  it('applies built-in presets', () => {
    const eq = run({ type: 'applyPreset', name: 'Bass Boost' });
    expect(eq.preset).toBe('Bass Boost');
    expect(eq.gains).toEqual([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores unknown presets', () => {
    expect(run({ type: 'applyPreset', name: 'Gibt es nicht' })).toBe(base);
  });

  it('reset goes back to Flat with auto preamp', () => {
    const eq = run(
      { type: 'applyPreset', name: 'Loudness' },
      { type: 'setPreamp', preamp: -3 },
      { type: 'reset' },
    );
    expect(eq).toMatchObject({ preset: 'Flat', autoPreamp: true, gains: base.gains });
  });

  it('saves, overwrites, renames and deletes custom presets', () => {
    let eq = run({ type: 'setBand', index: 0, gain: 4 }, { type: 'savePreset', name: '  Auto  ' });
    expect(eq.preset).toBe('Auto');
    expect(eq.customPresets).toEqual([
      { name: 'Auto', gains: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: -4 },
    ]);

    eq = reduceEq(reduceEq(eq, { type: 'setBand', index: 0, gain: 2 }), {
      type: 'savePreset',
      name: 'auto',
    });
    expect(eq.customPresets).toHaveLength(1);
    expect(eq.customPresets[0]!.gains[0]).toBe(2);

    eq = reduceEq(eq, { type: 'renamePreset', from: 'auto', to: 'Im Auto' });
    expect(eq.preset).toBe('Im Auto');
    expect(eq.customPresets[0]!.name).toBe('Im Auto');

    eq = reduceEq(eq, { type: 'deletePreset', name: 'Im Auto' });
    expect(eq.customPresets).toEqual([]);
    expect(eq.preset).toBe('Eigene');
  });

  it('rejects reserved or empty names', () => {
    expect(validPresetName('flat')).toBeNull();
    expect(validPresetName('Eigene')).toBeNull();
    expect(validPresetName('   ')).toBeNull();
    expect(validPresetName('x'.repeat(31))).toBeNull();
    expect(validPresetName(' Mein   Mix ')).toBe('Mein Mix');
    expect(run({ type: 'savePreset', name: 'Vocal' })).toBe(base);
  });

  it('does not rename onto an existing preset', () => {
    const eq = run({ type: 'savePreset', name: 'A' }, { type: 'savePreset', name: 'B' });
    expect(reduceEq(eq, { type: 'renamePreset', from: 'A', to: 'b' })).toBe(eq);
  });
});

describe('isEqAction', () => {
  it('accepts valid actions', () => {
    expect(isEqAction({ type: 'setBand', index: 1, gain: 2 })).toBe(true);
    expect(isEqAction({ type: 'reset' })).toBe(true);
    expect(isEqAction({ type: 'renamePreset', from: 'a', to: 'b' })).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isEqAction(null)).toBe(false);
    expect(isEqAction({ type: 'setBand', index: '1', gain: 2 })).toBe(false);
    expect(isEqAction({ type: 'setBand', index: 1, gain: Number.NaN })).toBe(false);
    expect(isEqAction({ type: 'deleteEverything' })).toBe(false);
  });
});

describe('formatDb', () => {
  it('formats like the mockup', () => {
    expect(formatDb(3)).toBe('+3');
    expect(formatDb(-1.5)).toBe('−1.5');
    expect(formatDb(0)).toBe('0');
    expect(formatDb(-4, true)).toBe('−4.0');
  });
});
