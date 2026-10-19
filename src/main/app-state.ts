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

let mediaKeysAtStart = true;

/** Media keys are a Chromium feature switch, so the setting only applies at startup. */
export function setMediaKeysAtStart(enabled: boolean): void {
  mediaKeysAtStart = enabled;
}

export function getMediaKeysAtStart(): boolean {
  return mediaKeysAtStart;
}
