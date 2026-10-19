import type { AppInfo, EqSettings, PlayerCommand, PlayerState, Settings, View } from './types';

/**
 * Typed IPC channels. The main process is the single source of truth for
 * settings and EQ values; UI and YT view only receive them via these channels.
 */

/** Request/response: renderer → main via `ipcRenderer.invoke`. */
export interface InvokeChannels {
  'app:get-info': { args: []; result: AppInfo };
  'settings:get': { args: []; result: Settings };
}

/** Fire-and-forget: Pegel UI → main via `ipcRenderer.send`. */
export interface UiToMainChannels {
  'settings:patch': Partial<Omit<Settings, 'version'>>;
  'eq:update': Partial<EqSettings>;
  'view:show': View;
  'eq-panel:animation-done': { open: boolean };
  'player:command': PlayerCommand;
  'mini:open': void;
}

/** Main → Pegel UI (main and mini window) via `webContents.send`. */
export interface MainToUiChannels {
  'settings:changed': Settings;
  'player:state': PlayerState;
  'eq:response': number[];
  'view:changed': View;
}

/** YT view preload → main. */
export interface YtToMainChannels {
  'yt:player-state': PlayerState;
  'yt:eq-response': number[];
}

/** Main → YT view preload. */
export interface MainToYtChannels {
  'yt:eq-apply': EqSettings;
  'yt:player-command': PlayerCommand;
}

export type InvokeChannel = keyof InvokeChannels;
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args'];
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result'];

/** API exposed to the Pegel UI as `window.pegel` by `preload/ui.ts`. */
export interface PegelApi {
  getAppInfo(): Promise<AppInfo>;
}
