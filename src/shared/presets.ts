import type { EqPreset } from './types';

/** Band centre frequencies in Hz. Band 0 is a low shelf, band 9 a high shelf. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_COUNT = EQ_FREQUENCIES.length;

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;
export const EQ_PREAMP_MIN = -12;
export const EQ_PREAMP_MAX = 6;
export const EQ_STEP = 0.5;
/** Peaking filter Q, roughly one octave bandwidth. */
export const EQ_Q = 1.41;

/** Label shown when the user changed a slider away from a preset. */
export const CUSTOM_PRESET_NAME = 'Eigene';

/**
 * Built-in presets. Gains from design/mockup.html; preamp equals the
 * auto-preamp rule -max(0, ...gains) so nothing clips.
 */
export const BUILTIN_PRESETS: readonly EqPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0 },
  { name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], preamp: -6 },
  { name: 'Vocal', gains: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1], preamp: -4 },
  { name: 'Akustik', gains: [3, 2, 1, 0, 1, 1, 2, 3, 2, 1], preamp: -3 },
  { name: 'Elektronisch', gains: [5, 4, 1, 0, -2, 1, 0, 2, 4, 5], preamp: -5 },
  { name: 'Loudness', gains: [5, 3, 0, 0, -1, 0, -1, 0, 3, 4], preamp: -5 },
];
