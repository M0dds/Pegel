import {
  BUILTIN_PRESETS,
  EQ_BAND_COUNT,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
  EQ_STEP,
} from './presets';
import { isThemeId } from './themes';
import type { EqPreset, Rect, Settings } from './types';

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  theme: 'standard',
  eq: {
    enabled: true,
    preset: BUILTIN_PRESETS[0]!.name,
    gains: [...BUILTIN_PRESETS[0]!.gains],
    preamp: 0,
    autoPreamp: true,
    panelOpen: true,
    customPresets: [],
  },
  closeToTray: true,
  startAtLogin: false,
  mini: { alwaysOnTop: true, hideMainOnOpen: true },
  discord: { enabled: true, hideWhenPaused: true },
  window: { maximized: false },
  welcomeShown: false,
};

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Clamps to [min, max] and rounds to the EQ step (0.5 dB). */
export function clampDb(value: number, min: number, max: number): number {
  const stepped = Math.round(value / EQ_STEP) * EQ_STEP;
  return Math.min(max, Math.max(min, stepped)) + 0; // + 0 turns -0 into 0
}

function gains(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value) || value.length !== EQ_BAND_COUNT || !value.every(isNum)) {
    return [...fallback];
  }
  return value.map((g) => clampDb(g, EQ_GAIN_MIN, EQ_GAIN_MAX));
}

function preamp(value: unknown, fallback: number): number {
  return isNum(value) ? clampDb(value, EQ_PREAMP_MIN, EQ_PREAMP_MAX) : fallback;
}

function rect(value: unknown): Rect | undefined {
  if (!isObj(value)) return undefined;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(isNum)) return undefined;
  if ((width as number) <= 0 || (height as number) <= 0) return undefined;
  return {
    x: Math.round(x as number),
    y: Math.round(y as number),
    width: Math.round(width as number),
    height: Math.round(height as number),
  };
}

function customPresets(value: unknown): EqPreset[] {
  if (!Array.isArray(value)) return [];
  const result: EqPreset[] = [];
  for (const item of value) {
    if (!isObj(item) || typeof item['name'] !== 'string' || !item['name'].trim()) continue;
    if (!Array.isArray(item['gains']) || item['gains'].length !== EQ_BAND_COUNT) continue;
    result.push({
      name: item['name'].trim(),
      gains: gains(item['gains'], DEFAULT_SETTINGS.eq.gains),
      preamp: preamp(item['preamp'], 0),
    });
  }
  return result;
}

/** Brings older settings files up to the current version. */
function migrate(raw: Obj): Obj {
  // Only v1 exists so far. Future migrations go here, keyed on raw.version.
  return raw;
}

/**
 * Turns whatever was read from disk (or received over IPC) into valid
 * settings. Unknown or invalid values fall back to the defaults.
 */
export function normalizeSettings(input: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(input)) return structuredClone(d);
  const raw = migrate(input);

  const eq = isObj(raw['eq']) ? raw['eq'] : {};
  const mini = isObj(raw['mini']) ? raw['mini'] : {};
  const discord = isObj(raw['discord']) ? raw['discord'] : {};
  const win = isObj(raw['window']) ? raw['window'] : {};

  const miniBounds = rect(mini['bounds']);
  const windowBounds = rect(win['bounds']);

  return {
    version: SETTINGS_VERSION,
    theme: isThemeId(raw['theme']) ? raw['theme'] : d.theme,
    eq: {
      enabled: bool(eq['enabled'], d.eq.enabled),
      preset: typeof eq['preset'] === 'string' && eq['preset'].trim() ? eq['preset'] : d.eq.preset,
      gains: gains(eq['gains'], d.eq.gains),
      preamp: preamp(eq['preamp'], d.eq.preamp),
      autoPreamp: bool(eq['autoPreamp'], d.eq.autoPreamp),
      panelOpen: bool(eq['panelOpen'], d.eq.panelOpen),
      customPresets: customPresets(eq['customPresets']),
    },
    closeToTray: bool(raw['closeToTray'], d.closeToTray),
    startAtLogin: bool(raw['startAtLogin'], d.startAtLogin),
    mini: {
      alwaysOnTop: bool(mini['alwaysOnTop'], d.mini.alwaysOnTop),
      hideMainOnOpen: bool(mini['hideMainOnOpen'], d.mini.hideMainOnOpen),
      ...(miniBounds && { bounds: miniBounds }),
    },
    discord: {
      enabled: bool(discord['enabled'], d.discord.enabled),
      hideWhenPaused: bool(discord['hideWhenPaused'], d.discord.hideWhenPaused),
    },
    window: {
      maximized: bool(win['maximized'], d.window.maximized),
      ...(windowBounds && { bounds: windowBounds }),
    },
    welcomeShown: bool(raw['welcomeShown'], d.welcomeShown),
  };
}
