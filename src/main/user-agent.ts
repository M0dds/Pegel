/**
 * Turns Electron's default user agent into a plain Chrome one by removing the
 * `Electron/x.y.z` and `<appName>/x.y.z` tokens. Without this Google often
 * rejects the login with "This browser or app may not be secure".
 */
export function toChromeUserAgent(userAgent: string, appName: string): string {
  const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return userAgent
    .replace(/\s*Electron\/\S+/gi, '')
    .replace(new RegExp(`\\s*${escaped}\\/\\S+`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
