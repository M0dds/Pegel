import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { normalizeProfile, type BuildProfile } from '@shared/profile';

let cached: BuildProfile | null | undefined;

/**
 * The build profile: packaged builds read `resources/profile.json` (written by
 * scripts/dist.mjs); in development `PEGEL_PROFILE=<name>` reads
 * `build-profiles/<name>.json` directly.
 */
export function getProfile(): BuildProfile | null {
  if (cached !== undefined) return cached;
  let file: string | null = null;
  if (app.isPackaged) {
    file = join(process.resourcesPath, 'profile.json');
  } else if (process.env['PEGEL_PROFILE']) {
    const name = process.env['PEGEL_PROFILE'].replace(/[^a-z0-9_-]/gi, '');
    file = join(app.getAppPath(), 'build-profiles', `${name}.json`);
  }
  try {
    cached = file ? normalizeProfile(JSON.parse(readFileSync(file, 'utf8'))) : null;
  } catch {
    cached = null; // no profile in this build
  }
  return cached;
}
