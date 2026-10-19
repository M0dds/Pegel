/**
 * Turns Electron's default user agent into a plain Chrome one by removing the
 * `Electron/x.y.z` and `<appName>/x.y.z` tokens. Used for YT Music; the
 * Google login gets the original user agent (see yt-view.ts).
 */
export function toChromeUserAgent(userAgent: string, appName: string): string {
  const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return userAgent
    .replace(/\s*Electron\/\S+/gi, '')
    .replace(new RegExp(`\\s*${escaped}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
