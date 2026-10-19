import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { normalizeSettings } from '@shared/settings';
import type { Settings, ThemeId } from '@shared/types';

const SAVE_DELAY_MS = 500;

let current: Settings | null = null;
let saveTimer: NodeJS.Timeout | null = null;
const listeners = new Set<(settings: Settings) => void>();

function filePath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** `firstStartTheme`: theme for a brand-new install (gift build profile). */
export function loadSettings(firstStartTheme?: ThemeId): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath(), 'utf8'));
  } catch {
    raw = firstStartTheme ? { theme: firstStartTheme } : undefined; // first start
  }
  current = normalizeSettings(raw);
  return current;
}

export function getSettings(): Settings {
  return current ?? loadSettings();
}

/**
 * Applies a change, validates the result and schedules a save.
 * The main process is the only place where settings are changed.
 */
export function updateSettings(mutate: (draft: Settings) => void): Settings {
  const draft = structuredClone(getSettings());
  mutate(draft);
  current = normalizeSettings(draft);
  scheduleSave();
  for (const listener of listeners) listener(current);
  return current;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, SAVE_DELAY_MS);
}

/** Writes pending changes immediately (atomically via a temp file). */
export function flushSettings(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!current) return;
  const target = filePath();
  const tmp = `${target}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
    renameSync(tmp, target);
  } catch (error) {
    console.error('[settings] save failed', error);
  }
}
