import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult, UiToMainChannels } from '@shared/ipc';
import { isEqAction, reduceEq } from '@shared/eq';
import { isPlayerCommand } from '@shared/player';
import { isThemeId } from '@shared/themes';
import { isView } from '@shared/types';
import { applyStartAtLogin } from './autostart';
import { getPlayerState, getSelectorIssues, setPlayerState, setSelectorIssues } from './player';
import { getSettings, updateSettings } from './settings';
import {
  getView,
  handleYtReady,
  isYtSender,
  onPanelAnimationDone,
  retryYt,
  closeMiniPlayer,
  openMiniPlayer,
  sendPlayerCommand,
  showView,
  toggleEqPanel,
} from './windows/main-window';

function handle<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: InvokeArgs<C>
  ) => InvokeResult<C> | Promise<InvokeResult<C>>,
): void {
  // ipcMain's own signature is untyped (any[]); the channel map narrows it.
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as InvokeArgs<C>)));
}

/**
 * Payloads from renderers are not trusted: the channel name is typed, the
 * payload stays `unknown` until the handler has validated it.
 */
function on<C extends keyof UiToMainChannels>(
  channel: C,
  listener: (event: IpcMainEvent, payload: unknown) => void,
): void {
  ipcMain.on(channel, (event, payload: unknown) => listener(event, payload));
}

export function registerIpc(): void {
  handle('app:get-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
  handle('settings:get', () => getSettings());
  handle('view:get', () => getView());
  handle('player:get', () => getPlayerState());
  handle('player:get-issues', () => getSelectorIssues());

  on('view:show', (_event, view) => {
    if (isView(view)) showView(view);
  });
  on('yt:retry', () => retryYt());

  on('eq:action', (_event, action) => {
    if (!isEqAction(action)) return;
    updateSettings((s) => {
      s.eq = reduceEq(s.eq, action);
    });
  });
  on('eq:toggle-panel', () => toggleEqPanel());
  on('theme:set', (_event, theme) => {
    if (!isThemeId(theme)) return;
    updateSettings((s) => {
      s.theme = theme;
    });
  });
  on('eq-panel:animation-done', (_event, payload) => {
    const open = (payload as { open?: unknown } | null)?.open;
    if (typeof open === 'boolean') onPanelAnimationDone(open);
  });

  on('mini:open', () => openMiniPlayer());
  on('mini:close', () => closeMiniPlayer());
  on('player:command', (_event, command) => {
    if (isPlayerCommand(command)) sendPlayerCommand(command);
  });
  on('settings:patch', (_event, patch) => {
    if (typeof patch !== 'object' || patch === null) return;
    const p = patch as Record<string, unknown>;
    const before = getSettings();
    updateSettings((s) => {
      if (typeof p['closeToTray'] === 'boolean') s.closeToTray = p['closeToTray'];
      if (typeof p['startAtLogin'] === 'boolean') s.startAtLogin = p['startAtLogin'];
      const mini = p['mini'];
      if (typeof mini === 'object' && mini !== null) {
        const m = mini as Record<string, unknown>;
        if (typeof m['alwaysOnTop'] === 'boolean') s.mini.alwaysOnTop = m['alwaysOnTop'];
        if (typeof m['hideMainOnOpen'] === 'boolean') s.mini.hideMainOnOpen = m['hideMainOnOpen'];
      }
    });
    const { startAtLogin } = getSettings();
    if (startAtLogin !== before.startAtLogin) applyStartAtLogin(startAtLogin);
  });

  // Sent by the YT view's preload; only accepted from that view.
  ipcMain.on('yt:ready', (event) => handleYtReady(event.sender));
  ipcMain.on('yt:player-state', (event, state: unknown) => {
    if (isYtSender(event.sender)) setPlayerState(state);
  });
  ipcMain.on('yt:selector-issues', (event, issues: unknown) => {
    if (isYtSender(event.sender)) setSelectorIssues(issues);
  });
}
