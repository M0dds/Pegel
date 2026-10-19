import { Menu } from 'electron';

/**
 * macOS needs an application menu, otherwise ⌘C/⌘V/⌘Q do not work
 * (e.g. pasting into the Google login). Windows/Linux get no menu bar;
 * Pegel's own shortcuts are handled in main-window.ts.
 */
export function setupMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}
