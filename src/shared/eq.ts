import {
  BUILTIN_PRESETS,
  CUSTOM_PRESET_NAME,
  EQ_BAND_COUNT,
  EQ_FREQUENCIES,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
} from './presets';
import { clampDb } from './settings';
import type { EqPreset, EqSettings } from './types';

/** Changes to the EQ, sent from the UI to the main process. */
export type EqAction =
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'setPanelOpen'; open: boolean }
  | { type: 'setBand'; index: number; gain: number }
  | { type: 'setPreamp'; preamp: number }
  | { type: 'setAutoPreamp'; auto: boolean }
  | { type: 'applyPreset'; name: string }
  | { type: 'reset' }
  | { type: 'savePreset'; name: string }
  | { type: 'renamePreset'; from: string; to: string }
  | { type: 'deletePreset'; name: string };

export const PRESET_NAME_MAX = 30;

/** Preamp that keeps the loudest band at 0 dB so nothing clips. */
export function autoPreamp(gains: readonly number[]): number {
  return -Math.max(0, ...gains) + 0;
}

/** The preamp that is actually applied. */
export function effectivePreamp(eq: Pick<EqSettings, 'gains' | 'preamp' | 'autoPreamp'>): number {
  return eq.autoPreamp ? autoPreamp(eq.gains) : eq.preamp;
}

export function allPresets(custom: readonly EqPreset[]): EqPreset[] {
  return [...BUILTIN_PRESETS, ...custom];
}

function isBuiltinName(name: string): boolean {
  return BUILTIN_PRESETS.some((p) => p.name.toLowerCase() === name.toLowerCase());
}

/** Trimmed preset name, or null if it is empty, too long or reserved. */
export function validPresetName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > PRESET_NAME_MAX) return null;
  if (isBuiltinName(trimmed) || trimmed.toLowerCase() === CUSTOM_PRESET_NAME.toLowerCase()) {
    return null;
  }
  return trimmed;
}

/** Applies an action and returns the new EQ state; invalid actions change nothing. */
export function reduceEq(eq: EqSettings, action: EqAction): EqSettings {
  switch (action.type) {
    case 'setEnabled':
      return { ...eq, enabled: action.enabled };
    case 'setPanelOpen':
      return { ...eq, panelOpen: action.open };
    case 'setBand': {
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= EQ_BAND_COUNT) return eq;
      const gains = [...eq.gains];
      gains[index] = clampDb(action.gain, EQ_GAIN_MIN, EQ_GAIN_MAX);
      return { ...eq, gains, preset: CUSTOM_PRESET_NAME };
    }
    case 'setPreamp':
      return {
        ...eq,
        preamp: clampDb(action.preamp, EQ_PREAMP_MIN, EQ_PREAMP_MAX),
        autoPreamp: false,
      };
    case 'setAutoPreamp':
      // Switching auto off keeps the current value instead of jumping.
      return action.auto
        ? { ...eq, autoPreamp: true }
        : { ...eq, autoPreamp: false, preamp: effectivePreamp(eq) };
    case 'applyPreset': {
      const preset = allPresets(eq.customPresets).find((p) => p.name === action.name);
      if (!preset) return eq;
      return { ...eq, preset: preset.name, gains: [...preset.gains], preamp: preset.preamp };
    }
    case 'reset':
      return reduceEq({ ...eq, autoPreamp: true }, { type: 'applyPreset', name: 'Flat' });
    case 'savePreset': {
      const name = validPresetName(action.name);
      if (!name) return eq;
      const preset: EqPreset = { name, gains: [...eq.gains], preamp: effectivePreamp(eq) };
      const others = eq.customPresets.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
      return { ...eq, preset: name, customPresets: [...others, preset] };
    }
    case 'renamePreset': {
      const to = validPresetName(action.to);
      const index = eq.customPresets.findIndex((p) => p.name === action.from);
      if (!to || index < 0) return eq;
      const clash = eq.customPresets.some(
        (p, i) => i !== index && p.name.toLowerCase() === to.toLowerCase(),
      );
      if (clash) return eq;
      const customPresets = eq.customPresets.map((p, i) => (i === index ? { ...p, name: to } : p));
      return { ...eq, customPresets, preset: eq.preset === action.from ? to : eq.preset };
    }
    case 'deletePreset': {
      if (!eq.customPresets.some((p) => p.name === action.name)) return eq;
      return {
        ...eq,
        customPresets: eq.customPresets.filter((p) => p.name !== action.name),
        preset: eq.preset === action.name ? CUSTOM_PRESET_NAME : eq.preset,
      };
    }
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** Validates an action received over IPC. */
export function isEqAction(value: unknown): value is EqAction {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  switch (a['type']) {
    case 'setEnabled':
      return isBool(a['enabled']);
    case 'setPanelOpen':
      return isBool(a['open']);
    case 'setBand':
      return isNum(a['index']) && isNum(a['gain']);
    case 'setPreamp':
      return isNum(a['preamp']);
    case 'setAutoPreamp':
      return isBool(a['auto']);
    case 'applyPreset':
    case 'savePreset':
    case 'deletePreset':
      return isStr(a['name']);
    case 'renamePreset':
      return isStr(a['from']) && isStr(a['to']);
    case 'reset':
      return true;
    default:
      return false;
  }
}

/** Filter type per band: shelves at the edges, peaking in between. */
export function bandFilterType(index: number): BiquadFilterType {
  if (index === 0) return 'lowshelf';
  if (index === EQ_BAND_COUNT - 1) return 'highshelf';
  return 'peaking';
}

/** `count` log-spaced frequencies from 20 Hz to 20 kHz (for the curve). */
export function curveFrequencies(count: number): Float32Array<ArrayBuffer> {
  const result = new Float32Array(count);
  for (let i = 0; i < count; i++) result[i] = 20 * Math.pow(1000, i / (count - 1));
  return result;
}

/**
 * Approximation of the total response in dB (from the mockup), used when
 * Web Audio is not available.
 */
export function approximateResponse(gains: readonly number[], freqs: Float32Array): number[] {
  return Array.from(freqs, (f) => {
    let db = 0;
    EQ_FREQUENCIES.forEach((f0, i) => {
      const octaves = Math.log2(f / f0);
      const g = gains[i] ?? 0;
      if (i === 0 && octaves < 0) db += g;
      else if (i === EQ_BAND_COUNT - 1 && octaves > 0) db += g;
      else db += g * Math.exp(-(octaves * octaves) / (2 * 0.42 * 0.42));
    });
    return db;
  });
}

export function formatHz(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

/** "+3", "−1.5", "0" with a real minus sign, as in the mockup. */
export function formatDb(v: number, fixedDecimals = false): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  const abs = Math.abs(v);
  const digits = fixedDecimals || abs % 1 ? 1 : 0;
  return sign + abs.toFixed(digits);
}
