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
  /** New custom preset from a template preset, or from the current values (`from: null`). */
  | { type: 'createPreset'; name: string; from: string | null }
  /** Overwrites the active custom preset with the current values. */
  | { type: 'saveChanges' }
  /** Goes back to the stored values of the active preset. */
  | { type: 'discardChanges' }
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

export function findPreset(
  eq: Pick<EqSettings, 'customPresets'>,
  name: string,
): EqPreset | undefined {
  return allPresets(eq.customPresets).find((p) => p.name === name);
}

export function isBuiltinPreset(name: string): boolean {
  return BUILTIN_PRESETS.some((p) => p.name === name);
}

/**
 * True if the current values differ from the active preset (or no stored
 * preset is active). The preamp only counts when it is set manually.
 */
export function isDirty(eq: EqSettings): boolean {
  const preset = findPreset(eq, eq.preset);
  if (!preset) return true;
  if (preset.gains.some((g, i) => g !== eq.gains[i])) return true;
  return !eq.autoPreamp && preset.preamp !== eq.preamp;
}

/** German error message for a new or renamed preset name, or null if it is fine. */
export function presetNameError(
  name: string,
  custom: readonly EqPreset[],
  renaming?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Bitte einen Namen eingeben.';
  if (trimmed.length > PRESET_NAME_MAX) return `Höchstens ${PRESET_NAME_MAX} Zeichen.`;
  if (!validPresetName(trimmed)) return 'Dieser Name ist für ein Standard-Preset reserviert.';
  const lower = validPresetName(trimmed)!.toLowerCase();
  const clash = custom.some((p) => p.name.toLowerCase() === lower && p.name !== renaming);
  return clash ? 'Ein Preset mit diesem Namen gibt es schon.' : null;
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
      // The preset stays selected; the difference shows up as unsaved changes.
      return { ...eq, gains };
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
      const preset = findPreset(eq, action.name);
      if (!preset) return eq;
      return { ...eq, preset: preset.name, gains: [...preset.gains], preamp: preset.preamp };
    }
    case 'createPreset': {
      if (presetNameError(action.name, eq.customPresets)) return eq;
      const name = validPresetName(action.name)!;
      const template = action.from === null ? null : findPreset(eq, action.from);
      if (action.from !== null && !template) return eq;
      const preset: EqPreset = template
        ? { name, gains: [...template.gains], preamp: template.preamp }
        : { name, gains: [...eq.gains], preamp: effectivePreamp(eq) };
      return reduceEq(
        { ...eq, customPresets: [...eq.customPresets, preset] },
        { type: 'applyPreset', name },
      );
    }
    case 'saveChanges': {
      const index = eq.customPresets.findIndex((p) => p.name === eq.preset);
      if (index < 0) return eq;
      const saved: EqPreset = {
        name: eq.preset,
        gains: [...eq.gains],
        preamp: effectivePreamp(eq),
      };
      return { ...eq, customPresets: eq.customPresets.map((p, i) => (i === index ? saved : p)) };
    }
    case 'discardChanges':
      return reduceEq(eq, { type: 'applyPreset', name: eq.preset });
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
      const rest = { ...eq, customPresets: eq.customPresets.filter((p) => p.name !== action.name) };
      // Deleting the active preset falls back to Flat.
      return eq.preset === action.name
        ? reduceEq(rest, { type: 'applyPreset', name: 'Flat' })
        : rest;
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
    case 'deletePreset':
      return isStr(a['name']);
    case 'createPreset':
      return isStr(a['name']) && (a['from'] === null || isStr(a['from']));
    case 'renamePreset':
      return isStr(a['from']) && isStr(a['to']);
    case 'saveChanges':
    case 'discardChanges':
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
