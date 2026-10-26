import { join } from 'node:path';
import { app, shell, type WebContents } from 'electron';
import { isExternalWebUrl } from '../navigation';

export const UI_PRELOAD = join(__dirname, '../preload/ui.js');

/** webPreferences shared by all Pegel UI windows. */
export const UI_WEB_PREFERENCES = {
  preload: UI_PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

/**
 * Window icon for all Pegel windows. Packaged builds take it from the
 * executable (Windows, embedded from resources/icon.ico) or the app bundle
 * (macOS); in development there is none, so show the PNG.
 */
export function uiWindowIcon(): { icon?: string } {
  return app.isPackaged ? {} : { icon: join(app.getAppPath(), 'resources', 'icon.png') };
}

/**
 * Loads the Pegel UI (dev server or built files) into a window or view. The
 * query carries the initial theme and, for the mini player and the panel card,
 * the route.
 */
export function loadUi(wc: WebContents, query: Record<string, string>): void {
  // Never open new Electron windows from the UI; external links go to the default browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void wc.loadURL(`${devUrl}?${new URLSearchParams(query)}`);
  } else {
    void wc.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
}
