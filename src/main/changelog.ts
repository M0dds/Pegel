import { app } from 'electron';
import { changelogToShow } from '@shared/changelog';
import { getSettings, updateSettings } from './settings';

/** Version whose "Was ist neu" opens once after this start (decided at startup). */
let pending: string | null = null;

/** Called once at startup, before the welcome page can mark itself as seen. */
export function initChangelog(): void {
  const current = app.getVersion();
  const { lastSeenVersion, welcomeShown } = getSettings();
  pending = changelogToShow(current, lastSeenVersion, welcomeShown);
  // Nothing to show (fresh install, same version): remember this version right away.
  if (!pending && lastSeenVersion !== current) markChangelogSeen();
}

export function getPendingChangelog(): string | null {
  return pending;
}

/** The UI opened the dialog: it is not shown by itself again for this version. */
export function markChangelogSeen(): void {
  pending = null;
  const current = app.getVersion();
  if (getSettings().lastSeenVersion === current) return;
  updateSettings((s) => {
    s.lastSeenVersion = current;
  });
}
