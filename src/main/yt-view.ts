import { join } from 'node:path';
import { app, session, shell, WebContentsView, type Session, type WebContents } from 'electron';
import { THEMES } from '@shared/themes';
import { buildYtThemeCss } from '../yt/themes/yt-theme';
import {
  isAllowedInApp,
  isExternalWebUrl,
  isPlaylistCreated,
  PLAYLIST_CREATE_PATTERN,
  YT_MUSIC_URL,
  YT_SIGN_IN_URL,
} from './navigation';
import { getSettings } from './settings';
import { toChromeUserAgent } from './user-agent';

export const YT_PARTITION = 'persist:pegel';

/** Permissions YT Music may use; everything else (camera, location, …) is denied. */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

let sessionReady = false;
const playlistCreatedListeners = new Set<() => void>();

/** Called after YT created a playlist (its sidebar only updates on reload). */
export function onPlaylistCreated(listener: () => void): () => void {
  playlistCreatedListeners.add(listener);
  return () => playlistCreatedListeners.delete(listener);
}

export function getYtSession(): Session {
  const ses = session.fromPartition(YT_PARTITION);
  if (!sessionReady) {
    sessionReady = true;
    const electronUserAgent = ses.getUserAgent();
    ses.setUserAgent(toChromeUserAgent(electronUserAgent, app.getName()));
    // Google's login refuses an embedded browser that claims to be Chrome
    // ("This browser or app may not be secure"), but accepts the unmodified
    // Electron user agent. Pear Desktop uses the same split.
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['https://accounts.google.com/*'] },
      (details, callback) => {
        details.requestHeaders['User-Agent'] = electronUserAgent;
        callback({ requestHeaders: details.requestHeaders });
      },
    );
    ses.webRequest.onCompleted({ urls: [PLAYLIST_CREATE_PATTERN] }, (details) => {
      if (!isPlaylistCreated(details.url, details.method, details.statusCode)) return;
      for (const listener of playlistCreatedListeners) listener();
    });
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission)),
    );
    ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  }
  return ses;
}

export interface YtViewEvents {
  /** The main frame failed to load (offline, DNS, …). */
  onLoadFailed(): void;
  /** The main frame finished loading successfully. */
  onLoaded(): void;
}

const isMusicUrl = (url: string) => url.startsWith('https://music.youtube.com/');

/** Key of the currently inserted theme CSS per view, for removeInsertedCSS. */
const themeCssKeys = new WeakMap<WebContents, string>();
let themeQueue: Promise<void> = Promise.resolve();

/**
 * (Re)applies the theme CSS. Must run after every full page load because
 * inserted CSS does not survive a navigation. Google's pages stay untouched.
 */
function injectTheme(wc: WebContents): Promise<void> {
  themeQueue = themeQueue.then(async () => {
    if (wc.isDestroyed()) return;
    const previous = themeCssKeys.get(wc);
    themeCssKeys.delete(wc);
    if (previous) await wc.removeInsertedCSS(previous).catch(() => undefined);
    const css = buildYtThemeCss(THEMES[getSettings().theme]);
    if (css && isMusicUrl(wc.getURL())) themeCssKeys.set(wc, await wc.insertCSS(css));
  });
  return themeQueue;
}

/** YT Music gets the theme background; Google's login and consent pages expect white. */
function updateBackground(view: WebContentsView, url: string): void {
  view.setBackgroundColor(isMusicUrl(url) ? THEMES[getSettings().theme].tokens.bg : '#ffffff');
}

/** Live theme switch, no reload needed. */
export function applyYtTheme(view: WebContentsView): void {
  updateBackground(view, view.webContents.getURL() || YT_MUSIC_URL);
  void injectTheme(view.webContents);
}

function openExternal(url: string): void {
  if (isExternalWebUrl(url)) void shell.openExternal(url);
}

export function createYtView(events: YtViewEvents): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: getYtSession(),
      preload: join(__dirname, '../preload/yt.js'),
      // Keeps the player bridge's state updates on time while the window is hidden.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const wc = view.webContents;

  // A dark background avoids a white flash while YT Music loads.
  updateBackground(view, YT_MUSIC_URL);
  wc.on('did-start-navigation', (event) => {
    if (event.isMainFrame && !event.isSameDocument) updateBackground(view, event.url);
  });
  wc.on('did-navigate', (_event, url) => updateBackground(view, url)); // covers redirects
  wc.on('dom-ready', () => void injectTheme(wc));

  // Navigation guard: only YT Music and the Google login stay in the app.
  const guard = (event: { preventDefault(): void }, url: string) => {
    if (isAllowedInApp(url)) return;
    event.preventDefault();
    openExternal(url);
  };
  wc.on('will-navigate', (event) => guard(event, event.url));
  wc.on('will-redirect', (event) => {
    if (event.isMainFrame) guard(event, event.url);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) void wc.loadURL(url);
    else openExternal(url);
    return { action: 'deny' };
  });

  // While music plays YT registers a "leave page?" beforeunload handler. A browser
  // would ask; Electron silently cancels the reload or navigation instead (F5,
  // "Jetzt aktualisieren", sign-out, quitting). Pegel has no such dialog, so the
  // unload always proceeds.
  wc.on('will-prevent-unload', (event) => event.preventDefault());

  let failed = false;
  wc.on('did-start-loading', () => {
    failed = false;
  });
  wc.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => {
    // -3 (ERR_ABORTED) is a cancelled navigation, e.g. by the guard above.
    if (!isMainFrame || errorCode === -3) return;
    failed = true;
    console.warn(`[yt] load failed: ${errorCode} ${errorDescription} ${url}`);
    events.onLoadFailed();
  });
  wc.on('did-stop-loading', () => {
    if (!failed) events.onLoaded();
  });

  void wc.loadURL(YT_MUSIC_URL);
  return view;
}

/** Retries the page that failed, or YT Music's start page. */
export function reloadYtView(view: WebContentsView): void {
  const current = view.webContents.getURL();
  void view.webContents.loadURL(
    current.startsWith('https://music.youtube.com/') ? current : YT_MUSIC_URL,
  );
}

/** Logged in to YT/Google in Pegel's partition (Google's session cookie on youtube.com). */
export async function isSignedIn(): Promise<boolean> {
  const cookies = await getYtSession().cookies.get({ domain: '.youtube.com' });
  return cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
}

/**
 * "Abmelden": deletes everything Pegel's YT partition stores (cookies, local
 * storage, cache) and loads YT Music again, now signed out.
 */
export async function signOut(view: WebContentsView): Promise<void> {
  const ses = getYtSession();
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.cookies.flushStore();
  if (!view.webContents.isDestroyed()) void view.webContents.loadURL(YT_MUSIC_URL);
}

export function startSignIn(view: WebContentsView): void {
  void view.webContents.loadURL(YT_SIGN_IN_URL);
}
