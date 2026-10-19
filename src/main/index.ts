import { app } from 'electron';
import { registerIpc } from './ipc';
import { setupMenu } from './menu';
import { flushSettings, loadSettings } from './settings';
import { getYtSession } from './yt-view';
import { createMainWindow, focusMainWindow, getMainWindow } from './windows/main-window';

// Development only: a separate profile (own login, settings and instance lock),
// e.g. to run a test instance next to the normal one.
const devUserData = process.env['PEGEL_USER_DATA'];
if (devUserData && !app.isPackaged) app.setPath('userData', devUserData);

if (!app.requestSingleInstanceLock()) {
  // Another Pegel is already running; it gets focused via 'second-instance'.
  app.quit();
} else {
  app.on('second-instance', () => focusMainWindow());

  app.whenReady().then(() => {
    loadSettings();
    setupMenu();
    registerIpc();
    createMainWindow();

    app.on('activate', () => {
      // macOS: dock icon clicked.
      if (!getMainWindow()) createMainWindow();
      else focusMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    flushSettings();
    // Make sure login cookies reach the disk before the process ends.
    void getYtSession().cookies.flushStore();
  });
}
