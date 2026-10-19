import { BrowserWindow, screen, type WebContents } from 'electron';
import { MINI_WINDOW_SIZE } from '@shared/layout';
import { THEMES } from '@shared/themes';
import type { Rect } from '@shared/types';
import { getSettings, onSettingsChanged, updateSettings } from '../settings';
import { isRectVisible } from '../window-state';
import { loadUi, UI_WEB_PREFERENCES } from './load-ui';

const MARGIN = 24;
const SAVE_DELAY_MS = 400;

let mini: BrowserWindow | null = null;
const listeners = new Set<() => void>();

export function getMiniWindow(): BrowserWindow | null {
  return mini && !mini.isDestroyed() ? mini : null;
}

export function isMiniOpen(): boolean {
  return !!mini && !mini.isDestroyed();
}

/** Notifies e.g. the tray menu when the mini player opens or closes. */
export function onMiniChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Saved position if still on a screen, otherwise bottom right of the primary screen. */
function initialBounds(): Rect {
  const { width, height } = MINI_WINDOW_SIZE;
  const saved = getSettings().mini.bounds;
  if (saved) {
    const rect = { x: saved.x, y: saved.y, width, height };
    if (
      isRectVisible(
        rect,
        screen.getAllDisplays().map((d) => d.workArea),
      )
    )
      return rect;
  }
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - width - MARGIN,
    y: area.y + area.height - height - MARGIN,
    width,
    height,
  };
}

function applyAlwaysOnTop(window: BrowserWindow, onTop: boolean): void {
  // 'floating' keeps it above normal windows on macOS without covering the menu bar.
  window.setAlwaysOnTop(onTop, process.platform === 'darwin' ? 'floating' : 'normal');
}

/**
 * Frameless 360×150 window with route /mini. It never talks to YT itself;
 * everything comes from the main process (PlayerState, settings).
 */
export function openMiniWindow(handleShortcuts: (wc: WebContents) => void): BrowserWindow {
  if (mini && !mini.isDestroyed()) {
    mini.show();
    mini.focus();
    return mini;
  }
  const settings = getSettings();
  const window = new BrowserWindow({
    ...initialBounds(),
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Pegel Mini-Player',
    backgroundColor: THEMES[settings.theme].tokens.surface,
    webPreferences: UI_WEB_PREFERENCES,
  });
  mini = window;
  applyAlwaysOnTop(window, settings.mini.alwaysOnTop);
  // Keep "Pegel Mini-Player" in the taskbar instead of the page title "Pegel".
  window.on('page-title-updated', (event) => event.preventDefault());
  handleShortcuts(window.webContents);

  let timer: NodeJS.Timeout | null = null;
  window.on('move', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.isDestroyed()) return;
      const { x, y, width, height } = window.getBounds();
      updateSettings((s) => {
        s.mini.bounds = { x, y, width, height };
      });
    }, SAVE_DELAY_MS);
  });

  let previous = settings;
  const stopWatching = onSettingsChanged((next) => {
    if (next.mini.alwaysOnTop !== previous.mini.alwaysOnTop) {
      applyAlwaysOnTop(window, next.mini.alwaysOnTop);
    }
    if (next.theme !== previous.theme) {
      window.setBackgroundColor(THEMES[next.theme].tokens.surface);
    }
    previous = next;
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    stopWatching();
    if (timer) clearTimeout(timer);
    mini = null;
    emit();
  });

  loadUi(window, { theme: settings.theme, view: 'mini' });
  emit();
  return window;
}

export function closeMiniWindow(): void {
  if (mini && !mini.isDestroyed()) mini.close();
}
