import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { MAIN_WINDOW_DEFAULT, MAIN_WINDOW_MIN } from '@shared/layout';
import { THEMES } from '@shared/themes';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_DEFAULT.width,
    height: MAIN_WINDOW_DEFAULT.height,
    minWidth: MAIN_WINDOW_MIN.width,
    minHeight: MAIN_WINDOW_MIN.height,
    title: 'Pegel',
    show: false,
    backgroundColor: THEMES.standard.tokens.bg,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/ui.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Never open new Electron windows from the UI; external links go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
