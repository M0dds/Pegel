import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult, UiToMainChannels } from '@shared/ipc';
import { isView } from '@shared/types';
import { getSettings } from './settings';
import { getView, retryYt, showView } from './windows/main-window';

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

  on('view:show', (_event, view) => {
    if (isView(view)) showView(view);
  });
  on('yt:retry', () => retryYt());
}
