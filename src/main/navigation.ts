/**
 * Navigation guard for the YT view. Only YT Music itself and the Google
 * login/consent flow stay inside Pegel; everything else opens externally.
 */

const ALWAYS_ALLOWED_HOSTS = new Set([
  'music.youtube.com',
  'consent.youtube.com',
  'accounts.youtube.com',
  'accounts.google.com',
  'consent.google.com',
  'gds.google.com', // passkey / 2-step verification prompts during login
]);

/** youtube.com hosts are only allowed for the sign-in/out hops of the login flow. */
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_LOGIN_PATHS = ['/signin', '/logout'];

/** Country login domains, e.g. accounts.google.de (cookie sync after login). */
const GOOGLE_ACCOUNTS_CC = /^accounts\.google\.[a-z]{2,3}(\.[a-z]{2})?$/;

export const YT_MUSIC_URL = 'https://music.youtube.com/';

export function isAllowedInApp(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (ALWAYS_ALLOWED_HOSTS.has(host)) return true;
  if (GOOGLE_ACCOUNTS_CC.test(host)) return true;
  if (YOUTUBE_HOSTS.has(host)) {
    return YOUTUBE_LOGIN_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
  }
  return false;
}

/** Only web links are handed to the OS; other schemes are dropped. */
export function isExternalWebUrl(rawUrl: string): boolean {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
