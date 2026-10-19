/**
 * Updates via GitHub Releases. Windows downloads and installs them
 * (electron-updater); macOS only notifies, because installing needs an
 * Apple-signed app (Pegel is only ad-hoc signed).
 */

export const RELEASES_REPO = { owner: 'M0dds', repo: 'Pegel' } as const;
export const RELEASES_URL = `https://github.com/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`;

export type UpdateStatus =
  /** Development build, or not checked yet. */
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current' }
  /** macOS: a newer version can be downloaded from the release page. */
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  /** Windows: downloaded, installs on restart (or when Pegel quits). */
  | { state: 'ready'; version: string }
  | { state: 'error' };

/** "1.2.3", "v1.2.3" or "1.2.3-beta.1" → [1, 2, 3] plus prerelease flag; null if invalid. */
function parseVersion(raw: string): { parts: [number, number, number]; pre: boolean } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(raw.trim());
  if (!m) return null;
  return { parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: Boolean(m[4]) };
}

/** True if `candidate` is a newer release than `current`. Pre-releases never count. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const c = parseVersion(candidate);
  const v = parseVersion(current);
  if (!c || !v || c.pre) return false;
  for (let i = 0; i < 3; i++) {
    if (c.parts[i] !== v.parts[i]) return c.parts[i]! > v.parts[i]!;
  }
  // Same numbers: the release is newer than a pre-release of it.
  return v.pre;
}
