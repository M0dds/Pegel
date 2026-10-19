import { describe, expect, it } from 'vitest';
import {
  autoPreamp,
  effectivePreamp,
  formatDb,
  isDirty,
  isEqAction,
  levellingBoostDb,
  presetNameError,
  reduceEq,
  validPresetName,
  type EqAction,
} from '@shared/eq';
import { normalizeSettings } from '@shared/settings';
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
  it('clamps, rounds and keeps the preset selected', () => {
    const eq = run(
      { type: 'applyPreset', name: 'Vocal' },
      { type: 'setBand', index: 2, gain: 13.2 },
      { type: 'setBand', index: 3, gain: 1.26 },
    );
    expect(eq.gains.slice(0, 4)).toEqual([-2, -2, 12, 1.5]);
    expect(eq.preset).toBe('Vocal');
    expect(isDirty(eq)).toBe(true);
  });

  it('ignores invalid band indices', () => {
    expect(run({ type: 'setBand', index: 10, gain: 3 })).toBe(base);
    expect(run({ type: 'setBand', index: 1.5, gain: 3 })).toBe(base);
  });
});

describe('dirty state', () => {
  it('is clean right after applying a preset', () => {
    expect(isDirty(run({ type: 'applyPreset', name: 'Loudness' }))).toBe(false);
  });

  it('counts the preamp only when it is set manually', () => {
    const eq = run({ type: 'applyPreset', name: 'Vocal' }, { type: 'setPreamp', preamp: -1 });
    expect(isDirty(eq)).toBe(true);
    expect(isDirty(reduceEq(eq, { type: 'setAutoPreamp', auto: true }))).toBe(false);
  });

  it('treats an unknown active preset as unsaved', () => {
    expect(isDirty({ ...base, preset: 'Eigene' })).toBe(true);
  });

  it('discarding restores the stored values', () => {
    const eq = run(
      { type: 'applyPreset', name: 'Bass Boost' },
      { type: 'setBand', index: 0, gain: -3 },
      { type: 'discardChanges' },
    );
    expect(eq.gains[0]).toBe(6);
    expect(isDirty(eq)).toBe(false);
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

  it('creates a preset from a template and selects it', () => {
    const eq = run({ type: 'createPreset', name: '  Abends  ', from: 'Akustik' });
    expect(eq.preset).toBe('Abends');
    expect(eq.customPresets).toEqual([
      { name: 'Abends', gains: [3, 2, 1, 0, 1, 1, 2, 3, 2, 1], preamp: -3 },
    ]);
    expect(isDirty(eq)).toBe(false);
  });

  it('creates a preset from the current values', () => {
    const eq = run(
      { type: 'applyPreset', name: 'Flat' },
      { type: 'setBand', index: 0, gain: 4 },
      { type: 'createPreset', name: 'Bass light', from: null },
    );
    expect(eq.customPresets[0]).toEqual({
      name: 'Bass light',
      gains: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      preamp: -4,
    });
    expect(eq.preset).toBe('Bass light');
  });

  it('rejects duplicate, reserved and unknown-template presets', () => {
    const eq = run({ type: 'createPreset', name: 'A', from: null });
    expect(reduceEq(eq, { type: 'createPreset', name: 'a', from: null })).toBe(eq);
    expect(run({ type: 'createPreset', name: 'Vocal', from: null })).toBe(base);
    expect(run({ type: 'createPreset', name: 'B', from: 'Gibt es nicht' })).toBe(base);
  });

  it('saves changes into the active custom preset only', () => {
    let eq = run(
      { type: 'createPreset', name: 'Mix', from: 'Flat' },
      { type: 'setBand', index: 9, gain: 3 },
      { type: 'saveChanges' },
    );
    expect(eq.customPresets[0]!.gains[9]).toBe(3);
    expect(isDirty(eq)).toBe(false);

    // Built-in presets stay read-only.
    eq = reduceEq(reduceEq(eq, { type: 'applyPreset', name: 'Vocal' }), {
      type: 'setBand',
      index: 0,
      gain: 5,
    });
    expect(reduceEq(eq, { type: 'saveChanges' })).toBe(eq);
  });

  it('renames and deletes custom presets', () => {
    let eq = run({ type: 'createPreset', name: 'Auto', from: 'Loudness' });
    eq = reduceEq(eq, { type: 'renamePreset', from: 'Auto', to: 'Im Auto' });
    expect(eq.preset).toBe('Im Auto');
    expect(eq.customPresets[0]!.name).toBe('Im Auto');

    eq = reduceEq(eq, { type: 'deletePreset', name: 'Im Auto' });
    expect(eq.customPresets).toEqual([]);
    expect(eq.preset).toBe('Flat');
    expect(eq.gains).toEqual(base.gains);
  });

  it('does not rename onto an existing preset', () => {
    const eq = run(
      { type: 'createPreset', name: 'A', from: null },
      { type: 'createPreset', name: 'B', from: null },
    );
    expect(reduceEq(eq, { type: 'renamePreset', from: 'A', to: 'b' })).toBe(eq);
  });

  it('validates names with German messages', () => {
    expect(validPresetName('flat')).toBeNull();
    expect(validPresetName(' Mein   Mix ')).toBe('Mein Mix');
    expect(presetNameError('', [])).toBe('Bitte einen Namen eingeben.');
    expect(presetNameError('x'.repeat(31), [])).toBe('Höchstens 30 Zeichen.');
    expect(presetNameError('Vocal', [])).toBe(
      'Dieser Name ist für ein Standard-Preset reserviert.',
    );
    const custom = [{ name: 'Mix', gains: base.gains, preamp: 0 }];
    expect(presetNameError('mix', custom)).toBe('Ein Preset mit diesem Namen gibt es schon.');
    expect(presetNameError('Mix', custom, 'Mix')).toBeNull(); // renaming to itself
  });
});

describe('isEqAction', () => {
  it('accepts valid actions', () => {
    expect(isEqAction({ type: 'setBand', index: 1, gain: 2 })).toBe(true);
    expect(isEqAction({ type: 'saveChanges' })).toBe(true);
    expect(isEqAction({ type: 'createPreset', name: 'x', from: null })).toBe(true);
    expect(isEqAction({ type: 'createPreset', name: 'x', from: 3 })).toBe(false);
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

describe('levellingBoostDb', () => {
  it('raises quiet tracks up to the reference, at most 6 dB', () => {
    expect(levellingBoostDb(-3.2)).toBe(3.2);
    expect(levellingBoostDb(-11)).toBe(6);
  });

  it('leaves loud tracks (YT lowers them) and unknown loudness alone', () => {
    expect(levellingBoostDb(4.5)).toBe(0);
    expect(levellingBoostDb(0)).toBe(0);
    expect(levellingBoostDb(undefined)).toBe(0);
    expect(levellingBoostDb(Number.NaN)).toBe(0);
  });
});

describe('setLevelling', () => {
  it('switches levelling and is validated', () => {
    const eq = normalizeSettings({}).eq;
    expect(reduceEq(eq, { type: 'setLevelling', enabled: false }).levelling).toBe(false);
    expect(isEqAction({ type: 'setLevelling', enabled: true })).toBe(true);
    expect(isEqAction({ type: 'setLevelling', enabled: 'ja' })).toBe(false);
  });
});
