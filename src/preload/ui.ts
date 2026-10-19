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
  toggleEqPanel: () => send('eq:toggle-panel'),
  eqPanelAnimationDone: (open) => send('eq-panel:animation-done', { open }),
  showView: (view) => send('view:show', view),
  retryLoad: () => send('yt:retry'),
  onViewChanged: (listener) => subscribe('view:changed', listener),
};

contextBridge.exposeInMainWorld('pegel', api);
