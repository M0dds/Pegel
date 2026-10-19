import { Menu } from 'electron';

export interface MenuActions {
  toggleMini(): void;
}

/**
 * macOS needs an application menu, otherwise ⌘C/⌘V/⌘Q do not work
 * (e.g. pasting into the Google login). Its Window menu maps ⌘M to the
 * mini player (the plan's shortcut) instead of "Minimize", which moves to
 * ⌥⌘M. Windows/Linux get no menu bar; shortcuts live in main-window.ts.
 */
export function setupMenu(actions: MenuActions): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'Fenster',
        submenu: [
          { label: 'Mini-Player', accelerator: 'Cmd+M', click: () => actions.toggleMini() },
          { role: 'minimize', accelerator: 'Alt+Cmd+M' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
        ],
      },
    ]),
  );
}
