import type { EqAction } from './eq';
import type {
  AppInfo,
  EqSettings,
  PlayerCommand,
  PlayerState,
  Settings,
  ThemeId,
  View,
} from './types';

/**
 * Typed IPC channels. The main process is the single source of truth for
 * settings and EQ values; UI and YT view only receive them via these channels.
 */

/** Request/response: renderer → main via `ipcRenderer.invoke`. */
export interface InvokeChannels {
  'app:get-info': { args: []; result: AppInfo };
  'settings:get': { args: []; result: Settings };
  'view:get': { args: []; result: View };
}

/** Fire-and-forget: Pegel UI → main via `ipcRenderer.send`. */
export interface UiToMainChannels {
  'settings:patch': Partial<Omit<Settings, 'version'>>;
  'eq:action': EqAction;
  /** Equalizer button / Ctrl+E: from a Pegel page back to the music with the panel open. */
  'eq:toggle-panel': void;
  'view:show': View;
  'theme:set': ThemeId;
  'yt:retry': void;
  /** The panel's open/close transition ended, so the YT view may take the space back. */
  'eq-panel:animation-done': { open: boolean };
  'player:command': PlayerCommand;
  'mini:open': void;
}

/** Main → Pegel UI (main and mini window) via `webContents.send`. */
export interface MainToUiChannels {
  'settings:changed': Settings;
  'player:state': PlayerState;
  'view:changed': View;
}

/** YT view preload → main. */
export interface YtToMainChannels {
  /** Preload is running on music.youtube.com and wants the current EQ. */
  'yt:ready': void;
  'yt:player-state': PlayerState;
}

/** Main → YT view preload. */
export interface MainToYtChannels {
  'yt:eq-apply': EqSettings;
  'yt:player-command': PlayerCommand;
}

export type InvokeChannel = keyof InvokeChannels;
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args'];
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result'];

/** Argument tuple for a fire-and-forget channel (`void` payloads take no argument). */
export type PayloadArgs<T> = [T] extends [void] ? [] : [T];

/** API exposed to the Pegel UI as `window.pegel` by `preload/ui.ts`. */
export interface PegelApi {
  /** `process.platform`, available synchronously for layout. */
  platform: string;
  getAppInfo(): Promise<AppInfo>;
  getView(): Promise<View>;
  getSettings(): Promise<Settings>;
  onSettingsChanged(listener: (settings: Settings) => void): () => void;
  eqAction(action: EqAction): void;
  setTheme(theme: ThemeId): void;
  toggleEqPanel(): void;
  eqPanelAnimationDone(open: boolean): void;
  showView(view: View): void;
  retryLoad(): void;
  /** Returns a function that removes the listener. */
  onViewChanged(listener: (view: View) => void): () => void;
}
