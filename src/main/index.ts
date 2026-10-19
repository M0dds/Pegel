import { app } from 'electron';
import { setMediaKeysAtStart, trackQuitting } from './app-state';
import { getProfile } from './profile';
import { shouldStartHidden, syncStartAtLogin } from './autostart';
import { registerIpc } from './ipc';
import { setupMenu } from './menu';
import { startPlaylistEq } from './playlist-eq';
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

// A separate profile (own login, settings and instance lock), e.g. to test a
// build next to the Pegel in daily use. Set by hand only, never by Pegel.
const customUserData = process.env['PEGEL_USER_DATA'];
if (customUserData) app.setPath('userData', customUserData);

// Settings are read before Chromium starts: the media keys switch is a command-line feature.
const startupSettings = loadSettings(getProfile()?.defaultTheme);
setMediaKeysAtStart(startupSettings.mediaKeys);
if (!startupSettings.mediaKeys) {
  // Keyboard media keys and the system media overlay (Windows SMTC, macOS Now Playing).
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
}

if (!app.requestSingleInstanceLock()) {
  // Another Pegel is already running; it gets focused via 'second-instance'.
  app.quit();
} else {
  trackQuitting();
  app.on('second-instance', () => focusMainWindow());

  app.whenReady().then(() => {
    setupMenu({ toggleMini: toggleMiniPlayer });
    registerIpc();
    startPlaylistEq();
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
