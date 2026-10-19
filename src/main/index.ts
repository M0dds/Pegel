import { app } from 'electron';
import { trackQuitting } from './app-state';
import { shouldStartHidden, syncStartAtLogin } from './autostart';
import { registerIpc } from './ipc';
import { setupMenu } from './menu';
import { flushSettings, getSettings, loadSettings } from './settings';
import { createTray } from './tray';
import { getYtSession } from './yt-view';
import {
  createMainWindow,
  focusMainWindow,
  getMainWindow,
  sendPlayerCommand,
  toggleMiniPlayer,
} from './windows/main-window';
import { isMiniOpen, onMiniChanged } from './windows/mini-window';

// Development only: a separate profile (own login, settings and instance lock),
// e.g. to run a test instance next to the normal one.
const devUserData = process.env['PEGEL_USER_DATA'];
if (devUserData && !app.isPackaged) app.setPath('userData', devUserData);

if (!app.requestSingleInstanceLock()) {
  // Another Pegel is already running; it gets focused via 'second-instance'.
  app.quit();
} else {
  trackQuitting();
  app.on('second-instance', () => focusMainWindow());

  app.whenReady().then(() => {
    loadSettings();
    setupMenu({ toggleMini: toggleMiniPlayer });
    registerIpc();
    syncStartAtLogin(getSettings().startAtLogin);
    createTray({
      showWindow: focusMainWindow,
      command: sendPlayerCommand,
      toggleMini: toggleMiniPlayer,
      isMiniOpen,
      onMiniChanged,
    });
    // Autostart (--hidden): YT loads in the background, only the tray is visible.
    createMainWindow({ show: !shouldStartHidden() });

    app.on('activate', () => {
      // macOS: dock icon clicked.
      if (!getMainWindow()) createMainWindow();
      else focusMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Only reached when the window really closed (close-to-tray is off).
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    flushSettings();
    // Make sure login cookies reach the disk before the process ends.
    void getYtSession().cookies.flushStore();
  });
}
