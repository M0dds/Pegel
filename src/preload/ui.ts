import { contextBridge, ipcRenderer } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult, PegelApi } from '@shared/ipc';

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>;
}

// Only concrete functions are exposed, never ipcRenderer itself.
const api: PegelApi = {
  getAppInfo: () => invoke('app:get-info'),
};

contextBridge.exposeInMainWorld('pegel', api);
