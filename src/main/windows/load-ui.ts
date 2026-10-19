import { join } from 'node:path';
import { shell, type BrowserWindow } from 'electron';
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
 * Loads the Pegel UI (dev server or built files). The query carries the
 * initial theme and, for the mini player, the route.
 */
export function loadUi(window: BrowserWindow, query: Record<string, string>): void {
  // Never open new Electron windows from the UI; external links go to the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void window.loadURL(`${devUrl}?${new URLSearchParams(query)}`);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
}
