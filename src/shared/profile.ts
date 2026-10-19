import { isThemeId } from './themes';
import type { ThemeId } from './types';

/**
 * Gift builds: `build-profiles/<name>.json`, baked into the installer by
 * `npm run dist -- --profile=<name>`. Sets the theme for the very first start.
 */
export interface BuildProfile {
  defaultTheme?: ThemeId;
}

/** Validates a profile file; unknown or invalid fields are dropped. Null if nothing is left. */
export function normalizeProfile(raw: unknown): BuildProfile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return isThemeId(r['defaultTheme']) ? { defaultTheme: r['defaultTheme'] } : null;
}
