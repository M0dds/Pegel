import { describe, expect, it } from 'vitest';
import { applyPlaylistContext, playlistPreset, reduceEq, type EqAction } from '@shared/eq';
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings';
import type { EqSettings } from '@shared/types';

const base: EqSettings = structuredClone(DEFAULT_SETTINGS.eq);
const run = (eq: EqSettings, ...actions: EqAction[]) => actions.reduce(reduceEq, eq);
const ROADTRIP = 'PLroadtrip2026';
const GYM = 'PLgym';

/** Roadtrip → Bass Boost, Gym → Elektronisch; Vocal chosen outside playlists. */
function setup(): EqSettings {
  let eq = run(base, { type: 'applyPreset', name: 'Vocal' });
  eq = {
    ...eq,
    playlistPresets: [
      { playlistId: ROADTRIP, title: 'Roadtrip 2026', preset: 'Bass Boost' },
      { playlistId: GYM, title: 'Gym', preset: 'Elektronisch' },
    ],
  };
  return eq;
}

describe('playlist presets', () => {
  it('switches to the playlist preset and back when leaving', () => {
    let eq = applyPlaylistContext(setup(), ROADTRIP);
    expect(eq.preset).toBe('Bass Boost');
    expect(eq.gains).toEqual([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]);
    expect(eq.autoPreset).toEqual({ from: 'Vocal' });

    eq = applyPlaylistContext(eq, null);
    expect(eq.preset).toBe('Vocal');
    expect(eq.autoPreset).toBeUndefined();
  });

  it('remembers the original preset across playlist hops', () => {
    let eq = applyPlaylistContext(setup(), ROADTRIP);
    eq = applyPlaylistContext(eq, GYM);
    expect(eq.preset).toBe('Elektronisch');
    eq = applyPlaylistContext(eq, 'PLwithoutpreset');
    expect(eq.preset).toBe('Vocal');
  });

  it('keeps a manual choice when leaving the playlist', () => {
    let eq = applyPlaylistContext(setup(), ROADTRIP);
    eq = reduceEq(eq, { type: 'applyPreset', name: 'Akustik' });
    expect(eq.autoPreset).toBeUndefined();
    eq = applyPlaylistContext(eq, null);
    expect(eq.preset).toBe('Akustik');
  });

  it('does nothing for playlists without a preset', () => {
    const eq = setup();
    expect(applyPlaylistContext(eq, 'PLunknown')).toBe(eq);
    expect(applyPlaylistContext(eq, null)).toBe(eq);
  });

  it('assigning only stores; the playing playlist applies it', () => {
    let eq = run(setup(), {
      type: 'setPlaylistPreset',
      playlistId: ROADTRIP,
      title: 'Roadtrip 2026',
      preset: 'Loudness',
    });
    // Assigning from a playlist page that is not playing must not change the sound.
    expect(eq.preset).toBe('Vocal');
    expect(eq.playlistPresets.filter((p) => p.playlistId === ROADTRIP)).toHaveLength(1);
    expect(playlistPreset(eq, ROADTRIP)).toBe('Loudness');

    // While it plays, the main process re-applies the context.
    eq = applyPlaylistContext(eq, ROADTRIP);
    expect(eq.preset).toBe('Loudness');

    // Removing the assignment of the playing playlist goes back to the previous preset.
    eq = reduceEq(eq, { type: 'setPlaylistPreset', playlistId: ROADTRIP, title: '', preset: null });
    expect(playlistPreset(eq, ROADTRIP)).toBeNull();
    expect(applyPlaylistContext(eq, ROADTRIP).preset).toBe('Vocal');
  });

  it('rejects invalid ids and unknown presets', () => {
    const eq = setup();
    const bad = (playlistId: string, preset: string) =>
      reduceEq(eq, { type: 'setPlaylistPreset', playlistId, title: 'x', preset });
    expect(bad('../../etc', 'Vocal')).toBe(eq);
    expect(bad('PLok', 'Gibt es nicht')).toBe(eq);
  });

  it('follows renames and drops assignments of deleted presets', () => {
    let eq = run(
      setup(),
      { type: 'createPreset', name: 'Auto', from: 'Flat' },
      { type: 'setPlaylistPreset', playlistId: ROADTRIP, title: 'Roadtrip', preset: 'Auto' },
      { type: 'renamePreset', from: 'Auto', to: 'Im Auto' },
    );
    expect(playlistPreset(eq, ROADTRIP)).toBe('Im Auto');
    // "Auto" was already active after creating it, so there is nothing to return to.
    expect(eq.autoPreset).toBeUndefined();

    eq = reduceEq(eq, { type: 'deletePreset', name: 'Im Auto' });
    expect(playlistPreset(eq, ROADTRIP)).toBeNull();
    expect(eq.playlistPresets.map((p) => p.playlistId)).toEqual([GYM]);
  });

  it('validates stored assignments', () => {
    const s = normalizeSettings({
      eq: {
        playlistPresets: [
          { playlistId: ROADTRIP, title: ' Roadtrip ', preset: 'Vocal' },
          { playlistId: ROADTRIP, title: 'Doppelt', preset: 'Flat' },
          { playlistId: 'bad id!', title: 'x', preset: 'Flat' },
          { playlistId: GYM, preset: 'Flat' },
        ],
        autoPreset: { from: 'Vocal' },
      },
    });
    expect(s.eq.playlistPresets).toEqual([
      { playlistId: ROADTRIP, title: 'Roadtrip', preset: 'Vocal' },
      { playlistId: GYM, title: GYM, preset: 'Flat' },
    ]);
    expect(s.eq.autoPreset).toEqual({ from: 'Vocal' });
  });
});
