import { app, BrowserWindow, screen, type WebContents, WebContentsView } from 'electron';
import type { MainToUiChannels, MainToYtChannels, PayloadArgs } from '@shared/ipc';
import {
  EQ_PANEL_WIDTH,
  MAIN_WINDOW_DEFAULT,
  MAIN_WINDOW_MIN,
  TITLEBAR_HEIGHT,
} from '@shared/layout';
import { THEMES } from '@shared/themes';
import type { EqSettings, PlayerCommand, Settings, View, YtEffects } from '@shared/types';
import { isQuitting } from '../app-state';
import {
  clearPlayerState,
  getPlayerState,
  onPagePlaylist,
  onPlayerState,
  onSelectorIssues,
} from '../player';
import { getSettings, onSettingsChanged, updateSettings } from '../settings';
import { matchShortcut } from '../shortcuts';
import { showBackgroundHint } from '../tray';
import { isRectVisible } from '../window-state';
import { applyYtTheme, createYtView, onPlaylistCreated, reloadYtView } from '../yt-view';
import { loadUi, UI_WEB_PREFERENCES } from './load-ui';
import { closeMiniWindow, isMiniOpen, openMiniWindow } from './mini-window';

const SAVE_BOUNDS_DELAY_MS = 400;
/** Lets YT finish its follow-up requests after creating a playlist before reloading. */
const PLAYLIST_RELOAD_DELAY_MS = 1500;
/** Fallback if the UI never reports the end of the panel's close animation. */
const PANEL_CLOSE_FALLBACK_MS = 450;

let win: BrowserWindow | null = null;
let ytView: WebContentsView | null = null;
let currentView: View = 'music';
/** Whether the YT view currently leaves room for the EQ panel. */
let panelSpace = false;
let panelCloseTimer: NodeJS.Timeout | null = null;

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function getView(): View {
  return currentView;
}

/** Sends to every Pegel UI window (main window and mini player; the YT view is not one). */
function sendToUi<C extends keyof MainToUiChannels>(
  channel: C,
  ...args: PayloadArgs<MainToUiChannels[C]>
): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args);
}

export function showView(view: View): void {
  if (!win || !ytView) return;
  currentView = view;
  const showYt = view === 'music';
  ytView.setVisible(showYt);
  if (showYt) ytView.webContents.focus();
  else win.webContents.focus();
  sendToUi('view:changed', view);
}

function sendToYt<C extends keyof MainToYtChannels>(
  channel: C,
  ...args: PayloadArgs<MainToYtChannels[C]>
): void {
  ytView?.webContents.send(channel, ...args);
}

/** True for messages that really come from the YT view (not from the Pegel UI). */
export function isYtSender(sender: WebContents): boolean {
  return sender === ytView?.webContents;
}

export function sendPlayerCommand(command: PlayerCommand): void {
  sendToYt('yt:player-command', command);
}

/** What the YT view draws on top of YT, derived from theme and settings. */
function ytEffects(settings: Settings): YtEffects {
  return {
    petals: settings.theme === 'sakura' && settings.effects.petals,
    visualizer: settings.effects.visualizer,
    accent: THEMES[settings.theme].tokens.accent,
  };
}

/** Sends EQ and effects to the YT preload once it reports ready (after every page load). */
export function handleYtReady(sender: WebContents): void {
  if (sender !== ytView?.webContents) return;
  sendToYt('yt:eq-apply', getSettings().eq);
  sendToYt('yt:effects', ytEffects(getSettings()));
}

/** Opens the mini player; the main window hides (setting "hideMainOnOpen"), music continues. */
export function openMiniPlayer(): void {
  openMiniWindow(handleShortcuts);
  if (getSettings().mini.hideMainOnOpen && win?.isVisible()) win.hide();
}

/** "Enlarge" in the mini player: back to the main window. */
export function closeMiniPlayer(): void {
  closeMiniWindow();
  focusMainWindow();
}

export function toggleMiniPlayer(): void {
  if (isMiniOpen()) closeMiniPlayer();
  else openMiniPlayer();
}

/** Equalizer button and Ctrl/⌘+E: toggle on the music view, otherwise go there and open. */
export function toggleEqPanel(): void {
  const open = currentView !== 'music' || !getSettings().eq.panelOpen;
  if (currentView !== 'music') showView('music');
  updateSettings((s) => {
    s.eq.panelOpen = open;
  });
}

/**
 * Opening: the YT view shrinks at once and the panel slides into the free space.
 * Closing: the panel slides out first, then the YT view takes the space back.
 */
function updatePanelSpace(open: boolean): void {
  if (panelCloseTimer) clearTimeout(panelCloseTimer);
  panelCloseTimer = null;
  if (open) {
    panelSpace = true;
    layout();
  } else if (panelSpace) {
    panelCloseTimer = setTimeout(() => onPanelAnimationDone(false), PANEL_CLOSE_FALLBACK_MS);
  }
}

export function onPanelAnimationDone(open: boolean): void {
  if (open || getSettings().eq.panelOpen) return;
  if (panelCloseTimer) clearTimeout(panelCloseTimer);
  panelCloseTimer = null;
  panelSpace = false;
  layout();
}

/** EQ values relevant for the audio engine (panelOpen is UI only). */
function audioKey(eq: EqSettings): string {
  const { panelOpen: _, ...audio } = eq;
  return JSON.stringify(audio);
}

/** Live theme switch for window and YT view (the window buttons are Pegel UI). */
function applyWindowTheme(): void {
  if (!win || !ytView) return;
  win.setBackgroundColor(THEMES[getSettings().theme].tokens.bg);
  applyYtTheme(ytView);
}

export type WindowControl = 'minimize' | 'toggleMaximize' | 'close';

/** Pegel's own window buttons (Windows/Linux). Close goes through the usual close handling. */
export function windowControl(action: WindowControl): void {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'close') win.close();
  else if (win.isMaximized()) win.unmaximize();
  else win.maximize();
}

export function isMainMaximized(): boolean {
  return win?.isMaximized() ?? false;
}

function watchSettings(): () => void {
  let previous = getSettings();
  return onSettingsChanged((settings: Settings) => {
    sendToUi('settings:changed', settings);
    if (audioKey(settings.eq) !== audioKey(previous.eq)) sendToYt('yt:eq-apply', settings.eq);
    if (settings.eq.panelOpen !== previous.eq.panelOpen) updatePanelSpace(settings.eq.panelOpen);
    if (settings.theme !== previous.theme) applyWindowTheme();
    if (JSON.stringify(ytEffects(settings)) !== JSON.stringify(ytEffects(previous))) {
      sendToYt('yt:effects', ytEffects(settings));
    }
    previous = settings;
  });
}

/** F5 / Ctrl+R: reloads YT Music (the page itself, not Pegel). */
export function reloadYt(): void {
  if (!ytView) return;
  if (currentView !== 'music') showView('music');
  ytView.webContents.reload();
}

export function retryYt(): void {
  if (ytView) reloadYtView(ytView);
}

/** Places the YT view below the title bar and left of the EQ panel. */
function layout(): void {
  if (!win || !ytView) return;
  const [width, height] = win.getContentSize() as [number, number];
  const panel = panelSpace ? EQ_PANEL_WIDTH : 0;
  ytView.setBounds({
    x: 0,
    y: TITLEBAR_HEIGHT,
    width: Math.max(0, width - panel),
    height: Math.max(0, height - TITLEBAR_HEIGHT),
  });
}

function platformChrome(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    // Traffic lights (12 px high) vertically centred in the 38 px title bar.
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } };
  }
  // No native caption buttons: Pegel draws its own (hover like the other title bar
  // buttons). Resizing, Aero Snap by dragging and Win+arrow keys keep working;
  // only the Snap Layouts flyout on the maximize button is gone.
  return { titleBarStyle: 'hidden' };
}

function restoredBounds(): Electron.Rectangle | undefined {
  const { bounds } = getSettings().window;
  if (!bounds) return undefined;
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  return isRectVisible(bounds, workAreas) ? bounds : undefined;
}

function handleShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    const action = matchShortcut(input, process.platform, currentView, !app.isPackaged);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'devtools') return wc.toggleDevTools();
    if (action.type === 'toggleMini') return toggleMiniPlayer();
    if (action.type === 'reloadYt') {
      if (wc !== win?.webContents && wc !== ytView?.webContents) closeMiniPlayer();
      return reloadYt();
    }
    // From the mini player, Pegel pages and the EQ open in the main window.
    if (wc !== win?.webContents && wc !== ytView?.webContents) closeMiniPlayer();
    if (action.type === 'show') showView(action.view);
    else toggleEqPanel();
  });
}

function trackBounds(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (window.isDestroyed() || window.isMinimized()) return;
    updateSettings((s) => {
      s.window.maximized = window.isMaximized();
      // Normal bounds = size before maximising, so un-maximising after a restart works.
      s.window.bounds = window.getNormalBounds();
    });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_BOUNDS_DELAY_MS);
  };
  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', save);
  window.on('unmaximize', save);
  window.on('close', save);
}

export function createMainWindow({ show = true }: { show?: boolean } = {}): BrowserWindow {
  const bounds = restoredBounds();
  const window = new BrowserWindow({
    ...(bounds ?? MAIN_WINDOW_DEFAULT),
    minWidth: MAIN_WINDOW_MIN.width,
    minHeight: MAIN_WINDOW_MIN.height,
    title: 'Pegel',
    show: false,
    backgroundColor: THEMES[getSettings().theme].tokens.bg,
    ...platformChrome(),
    webPreferences: UI_WEB_PREFERENCES,
  });
  win = window;
  panelSpace = getSettings().eq.panelOpen;
  const stopWatching = watchSettings();
  const stopPlayer = onPlayerState((state) => sendToUi('player:state', state));
  const stopIssues = onSelectorIssues((issues) => sendToUi('player:selector-issues', issues));
  const stopPage = onPagePlaylist((page) => sendToUi('player:page-playlist', page));
  // YT only loads its sidebar per page load. A new playlist appears after a reload:
  // automatically when nothing plays, otherwise the title bar offers it.
  const stopPlaylistCreated = onPlaylistCreated(() => {
    if (getPlayerState()?.isPlaying) sendToUi('yt:sidebar-outdated', true);
    else setTimeout(() => reloadYt(), PLAYLIST_RELOAD_DELAY_MS);
  });

  const view = createYtView({
    onLoadFailed: () => showView('offline'),
    onLoaded: () => {
      if (currentView === 'offline') showView('music');
    },
  });
  ytView = view;
  window.contentView.addChildView(view);
  layout();

  window.on('resize', layout);
  window.on('maximize', layout);
  window.on('unmaximize', layout);
  window.on('maximize', () => window.webContents.send('window:maximized', true));
  window.on('unmaximize', () => window.webContents.send('window:maximized', false));
  trackBounds(window);
  handleShortcuts(window.webContents);
  handleShortcuts(view.webContents);

  // A full page load in the YT view starts without a track.
  view.webContents.on('did-start-navigation', (event) => {
    if (!event.isMainFrame || event.isSameDocument) return;
    clearPlayerState();
    sendToUi('yt:sidebar-outdated', false); // a full load fetches the sidebar again
  });

  window.once('ready-to-show', () => {
    if (!show) return; // autostart: tray only
    if (getSettings().window.maximized) window.maximize();
    window.show();
    view.webContents.focus();
  });

  // Closing keeps Pegel running (music continues): always on macOS, on
  // Windows/Linux when "close to tray" is on. Quitting goes via tray or ⌘Q.
  window.on('close', (event) => {
    if (isQuitting()) return;
    if (process.platform !== 'darwin' && !getSettings().closeToTray) return;
    event.preventDefault();
    if (window.isFullScreen()) window.setFullScreen(false);
    window.hide();
    showBackgroundHint();
  });

  window.on('closed', () => {
    // The main window really closed (close-to-tray off): Pegel ends, so does the mini player.
    closeMiniWindow();
    stopWatching();
    stopPlayer();
    stopIssues();
    stopPage();
    stopPlaylistCreated();
    if (!view.webContents.isDestroyed()) view.webContents.close();
    win = null;
    ytView = null;
    currentView = 'music';
  });

  // The theme comes along in the URL so the UI paints in the right colours from the start.
  loadUi(window, { theme: getSettings().theme });

  return window;
}

/** Brings the main window to the front (second app start, dock click, …). */
export function focusMainWindow(): void {
  if (!win) {
    createMainWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible() && getSettings().window.maximized) win.maximize();
  win.show();
  win.focus();
}
