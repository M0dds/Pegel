import { app } from 'electron';

export const HIDDEN_ARG = '--hidden';

/**
 * Registers or removes Pegel as login item. Windows passes `--hidden`;
 * macOS (SMAppService) cannot pass arguments, there `wasOpenedAtLogin` tells.
 * Skipped in development, where it would register the bare Electron binary.
 */
export function applyStartAtLogin(enabled: boolean): void {
  if (!app.isPackaged) {
    console.info(`[autostart] development build, not changing login item (wanted: ${enabled})`);
    return;
  }
  if (process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
  }
}

/** Keeps the OS login item in line with the setting (e.g. after a reinstall). */
export function syncStartAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return;
  const options = process.platform === 'darwin' ? {} : { args: [HIDDEN_ARG] };
  if (app.getLoginItemSettings(options).openAtLogin !== enabled) applyStartAtLogin(enabled);
}

/** Started by autostart: only the tray, no window. */
export function shouldStartHidden(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
}
