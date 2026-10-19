import { app } from 'electron';

let quitting = false;

/** True once the user really quits (tray "Beenden", ⌘Q, …), not just closes the window. */
export function isQuitting(): boolean {
  return quitting;
}

export function trackQuitting(): void {
  app.on('before-quit', () => {
    quitting = true;
  });
}
