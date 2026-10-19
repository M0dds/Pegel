import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc';

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

export function registerIpc(): void {
  handle('app:get-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
}
