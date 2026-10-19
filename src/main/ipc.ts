import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult, UiToMainChannels } from '@shared/ipc';
import { isEqAction, reduceEq } from '@shared/eq';
import { findPegelLink } from '@shared/links';
import { MAX_FEED_BARS } from '@shared/spectrum';
import { isPlayerCommand } from '@shared/player';
import { isThemeId } from '@shared/themes';
import { isView } from '@shared/types';
import { toPartyReport } from '@shared/social';
import {
  answerSuggestion,
  createFriendCode,
  disableSocial,
  enableSocial,
  endParty,
  getSocialState,
  handlePartyReport,
  inviteToParty,
  joinFriendParty,
  kickFromParty,
  leaveParty,
  patchSocial,
  redeemFriendCode,
  removeFriend,
  resetSocial,
  respondToInvite,
  resumeParty,
  startParty,
  transferParty,
} from './social';
import { getMediaKeysAtStart } from './app-state';
import { applyStartAtLogin } from './autostart';
import {
  getPagePlaylist,
  getPlayerState,
  getSelectorIssues,
  setPagePlaylist,
  setPlayerState,
  setSelectorIssues,
} from './player';
import { reapplyPlaylistContext } from './playlist-eq';
import { getSettings, updateSettings } from './settings';
import { checkForUpdates, getUpdateStatus, installUpdate, updatesSupported } from './updater';
import {
  getView,
  handleYtReady,
  isYtSender,
  onPanelAnimationDone,
  reloadYt,
  retryYt,
  closeMiniPlayer,
  finishWelcome,
  signOutYt,
  getMainWindow,
  isMainMaximized,
  windowControl,
  openLink,
  setMiniSpectrumBars,
  forwardSpectrum,
  openOfferedLink,
  dismissOfferedLink,
  openMiniPlayer,
  sendPlayerCommand,
  showView,
  toggleEqPanel,
  toggleSocialPanel,
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
    mediaKeysAtStart: getMediaKeysAtStart(),
    updatesSupported: updatesSupported(),
  }));
  handle('settings:get', () => getSettings());
  handle('view:get', () => getView());
  handle('window:is-maximized', () => isMainMaximized());
  handle('player:get', () => getPlayerState());
  handle('player:get-issues', () => getSelectorIssues());
  handle('player:get-page-playlist', () => getPagePlaylist());
  handle('update:get', () => getUpdateStatus());
  handle('social:get', () => getSocialState());

  on('social:toggle-panel', () => toggleSocialPanel());
  on('social:enable', (_event, payload) =>
    enableSocial((payload as { displayName?: unknown } | null)?.displayName),
  );
  on('social:disable', () => disableSocial());
  on('social:reset', () => resetSocial());
  on('social:patch', (_event, patch) => patchSocial(patch));
  on('social:create-code', () => createFriendCode());
  on('social:redeem-code', (_event, code) => redeemFriendCode(code));
  on('social:remove-friend', (_event, id) => removeFriend(id));
  on('party:start', () => startParty());
  on('party:invite', (_event, id) => inviteToParty(id));
  on('party:respond', (_event, payload) => respondToInvite(payload));
  on('party:join', (_event, id) => joinFriendParty(id));
  on('party:leave', () => leaveParty());
  on('party:end', () => endParty());
  on('party:kick', (_event, id) => kickFromParty(id));
  on('party:transfer', (_event, id) => transferParty(id));
  on('party:suggestion', (_event, payload) => answerSuggestion(payload));
  on('party:resume', () => resumeParty());

  on('view:show', (_event, view) => {
    if (isView(view)) showView(view);
  });
  on('yt:retry', () => retryYt());
  on('yt:reload', () => reloadYt());
  on('welcome:finish', (_event, payload) => {
    const signIn = (payload as { signIn?: unknown } | null)?.signIn;
    finishWelcome(signIn === true);
  });
  on('account:sign-out', () => void signOutYt());

  on('eq:action', (_event, action) => {
    if (!isEqAction(action)) return;
    updateSettings((s) => {
      s.eq = reduceEq(s.eq, action);
    });
    if (action.type === 'setPlaylistPreset') reapplyPlaylistContext();
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

  on('window:control', (event, action) => {
    // Only the main window has these buttons.
    if (event.sender !== getMainWindow()?.webContents) return;
    if (action === 'minimize' || action === 'toggleMaximize' || action === 'close') {
      windowControl(action);
    }
  });
  on('link:open', () => openOfferedLink());
  on('link:dismiss', () => dismissOfferedLink());
  on('link:drop', (_event, text) => {
    const link = typeof text === 'string' ? findPegelLink(text) : null;
    if (link) openLink(link);
  });
  on('update:check', () => checkForUpdates(true));
  on('update:install', () => installUpdate());
  on('mini:spectrum-bars', (_event, bars) => {
    if (typeof bars === 'number' && Number.isFinite(bars)) {
      setMiniSpectrumBars(Math.max(0, Math.min(MAX_FEED_BARS, Math.round(bars))));
    }
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
      if (typeof p['mediaKeys'] === 'boolean') s.mediaKeys = p['mediaKeys'];
      if (typeof p['clipboardLinks'] === 'boolean') s.clipboardLinks = p['clipboardLinks'];
      const mini = p['mini'];
      if (typeof mini === 'object' && mini !== null) {
        const m = mini as Record<string, unknown>;
        if (typeof m['alwaysOnTop'] === 'boolean') s.mini.alwaysOnTop = m['alwaysOnTop'];
        if (typeof m['hideMainOnOpen'] === 'boolean') s.mini.hideMainOnOpen = m['hideMainOnOpen'];
        if (typeof m['visualizer'] === 'boolean') s.mini.visualizer = m['visualizer'];
      }
      const effects = p['effects'];
      if (typeof effects === 'object' && effects !== null) {
        const e = effects as Record<string, unknown>;
        if (typeof e['petals'] === 'boolean') s.effects.petals = e['petals'];
        if (typeof e['visualizer'] === 'boolean') s.effects.visualizer = e['visualizer'];
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
  ipcMain.on('yt:page-playlist', (event, page: unknown) => {
    if (isYtSender(event.sender)) setPagePlaylist(page);
  });
  ipcMain.on('yt:spectrum', (event, levels: unknown) => {
    if (!isYtSender(event.sender) || !Array.isArray(levels)) return;
    if (levels.length > MAX_FEED_BARS) return;
    if (!levels.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) return;
    forwardSpectrum(levels as number[]);
  });
  ipcMain.on('yt:party-report', (event, raw: unknown) => {
    if (!isYtSender(event.sender)) return;
    const report = toPartyReport(raw);
    if (report) handlePartyReport(report);
  });
  ipcMain.on('yt:drop-link', (event, text: unknown) => {
    const link = isYtSender(event.sender) && typeof text === 'string' ? findPegelLink(text) : null;
    if (link) openLink(link);
  });
}
