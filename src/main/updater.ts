import { app, net, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  isNewerVersion,
  LATEST_RELEASE_API,
  RELEASES_URL,
  type UpdateStatus,
} from '@shared/update';

/** First check a little after the start, so YT Music loads first. */
const FIRST_CHECK_DELAY_MS = 20_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let status: UpdateStatus = { state: 'idle' };
const listeners = new Set<(status: UpdateStatus) => void>();
/** Errors are only shown for a check the user started (offline at start is no news). */
let userCheck = false;

function setStatus(next: UpdateStatus): void {
  status = next;
  for (const listener of listeners) listener(next);
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function onUpdateStatus(listener: (status: UpdateStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Only installed builds update; a development build has nothing to update. */
export function updatesSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
}

function failed(error?: unknown): void {
  // No release (or none for this platform) yet: nothing to update, not an error.
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/\b404\b|No published versions|latest(-mac)?\.yml/i.test(message)) {
    return setStatus({ state: 'current' });
  }
  setStatus(userCheck ? { state: 'error' } : { state: 'idle' });
}

function setupWindows(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'current' }));
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'downloading', version: info.version, percent: 0 }),
  );
  autoUpdater.on('download-progress', (progress) => {
    if (status.state !== 'downloading') return;
    setStatus({ ...status, percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'ready', version: info.version }),
  );
  autoUpdater.on('error', failed);
}

/** macOS: ask GitHub for the latest release and compare versions. */
async function checkGithub(): Promise<void> {
  setStatus({ state: 'checking' });
  const response = await net.fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  // No release published yet.
  if (response.status === 404) return setStatus({ state: 'current' });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const tag = ((await response.json()) as { tag_name?: unknown }).tag_name;
  if (typeof tag === 'string' && isNewerVersion(tag, app.getVersion())) {
    setStatus({ state: 'available', version: tag.replace(/^v/, '') });
  } else {
    setStatus({ state: 'current' });
  }
}

/** Background or "Nach Updates suchen". Does nothing while a download runs or one is ready. */
export function checkForUpdates(byUser = false): void {
  if (!updatesSupported()) return;
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') {
    return;
  }
  userCheck = byUser;
  if (process.platform === 'darwin') {
    checkGithub().catch(failed);
  } else {
    // Errors also arrive as the 'error' event.
    autoUpdater.checkForUpdates().catch(() => undefined);
  }
}

/** Title bar / settings button: restart into the update, or (macOS) open the download page. */
export function installUpdate(): void {
  if (status.state === 'ready' && process.platform === 'win32') {
    // Silent install, Pegel starts again afterwards.
    autoUpdater.quitAndInstall(true, true);
  } else if (status.state === 'available') {
    void shell.openExternal(RELEASES_URL);
  }
}

export function startUpdates(): void {
  if (!updatesSupported()) return;
  if (process.platform === 'win32') setupWindows();
  setTimeout(() => checkForUpdates(), FIRST_CHECK_DELAY_MS);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
}
