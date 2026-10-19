import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  MainToUiChannels,
  PayloadArgs,
  PegelApi,
  UiToMainChannels,
} from '@shared/ipc';

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>;
}

function send<C extends keyof UiToMainChannels>(
  channel: C,
  ...args: PayloadArgs<UiToMainChannels[C]>
): void {
  ipcRenderer.send(channel, ...args);
}

function subscribe<C extends keyof MainToUiChannels>(
  channel: C,
  listener: (payload: MainToUiChannels[C]) => void,
): () => void {
  // The event object is not passed on; it would give the page access to ipcRenderer.
  const wrapped = (_event: IpcRendererEvent, payload: MainToUiChannels[C]) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

// Only concrete functions are exposed, never ipcRenderer itself.
const api: PegelApi = {
  platform: process.platform,
  getAppInfo: () => invoke('app:get-info'),
  getView: () => invoke('view:get'),
  getSettings: () => invoke('settings:get'),
  onSettingsChanged: (listener) => subscribe('settings:changed', listener),
  eqAction: (action) => send('eq:action', action),
  setTheme: (theme) => send('theme:set', theme),
  patchSettings: (patch) => send('settings:patch', patch),
  windowControl: (action) => send('window:control', action),
  isMaximized: () => invoke('window:is-maximized'),
  onMaximizedChanged: (listener) => subscribe('window:maximized', listener),
  openMini: () => send('mini:open'),
  closeMini: () => send('mini:close'),
  getPlayerState: () => invoke('player:get'),
  onPlayerState: (listener) => subscribe('player:state', listener),
  playerCommand: (command) => send('player:command', command),
  getSelectorIssues: () => invoke('player:get-issues'),
  onSelectorIssues: (listener) => subscribe('player:selector-issues', listener),
  getPagePlaylist: () => invoke('player:get-page-playlist'),
  onPagePlaylist: (listener) => subscribe('player:page-playlist', listener),
  toggleEqPanel: () => send('eq:toggle-panel'),
  eqPanelAnimationDone: (open) => send('eq-panel:animation-done', { open }),
  showView: (view) => send('view:show', view),
  retryLoad: () => send('yt:retry'),
  reloadYt: () => send('yt:reload'),
  finishWelcome: (signIn) => send('welcome:finish', { signIn }),
  signOut: () => send('account:sign-out'),
  onSidebarOutdated: (listener) => subscribe('yt:sidebar-outdated', listener),
  onViewChanged: (listener) => subscribe('view:changed', listener),
  onLinkOffer: (listener) => subscribe('link:offer', listener),
  openOfferedLink: () => send('link:open'),
  dismissLink: () => send('link:dismiss'),
  dropLink: (text) => send('link:drop', text),
  getUpdateStatus: () => invoke('update:get'),
  onUpdateStatus: (listener) => subscribe('update:status', listener),
  checkForUpdates: () => send('update:check'),
  installUpdate: () => send('update:install'),
};

contextBridge.exposeInMainWorld('pegel', api);
