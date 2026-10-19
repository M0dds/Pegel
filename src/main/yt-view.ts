import { join } from 'node:path';
import { app, session, shell, WebContentsView, type Session } from 'electron';
import { THEMES } from '@shared/themes';
import { isAllowedInApp, isExternalWebUrl, YT_MUSIC_URL } from './navigation';
import { toChromeUserAgent } from './user-agent';

export const YT_PARTITION = 'persist:pegel';

/** Permissions YT Music may use; everything else (camera, location, …) is denied. */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

let sessionReady = false;

export function getYtSession(): Session {
  const ses = session.fromPartition(YT_PARTITION);
  if (!sessionReady) {
    sessionReady = true;
    ses.setUserAgent(toChromeUserAgent(ses.getUserAgent(), app.getName()));
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

function openExternal(url: string): void {
  if (isExternalWebUrl(url)) void shell.openExternal(url);
}

export function createYtView(events: YtViewEvents): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: getYtSession(),
      preload: join(__dirname, '../preload/yt.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const wc = view.webContents;

  // YT Music is dark, so a dark background avoids a white flash while it loads.
  // Google's login and consent pages have a transparent body and expect white.
  const updateBackground = (url: string) => {
    const isMusic = url.startsWith('https://music.youtube.com/');
    view.setBackgroundColor(isMusic ? THEMES.standard.tokens.bg : '#ffffff');
  };
  updateBackground(YT_MUSIC_URL);
  wc.on('did-start-navigation', (event) => {
    if (event.isMainFrame && !event.isSameDocument) updateBackground(event.url);
  });
  wc.on('did-navigate', (_event, url) => updateBackground(url)); // covers redirects

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
