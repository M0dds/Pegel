import type { EqAction } from './eq';
import type {
  AppInfo,
  EqSettings,
  PlayerCommand,
  PagePlaylist,
  PlayerState,
  Settings,
  SettingsPatch,
  ThemeId,
  View,
  YtEffects,
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
  'window:is-maximized': { args: []; result: boolean };
  'player:get': { args: []; result: PlayerState | null };
  'player:get-issues': { args: []; result: string[] };
  'player:get-page-playlist': { args: []; result: PagePlaylist | null };
}

/** Fire-and-forget: Pegel UI → main via `ipcRenderer.send`. */
export interface UiToMainChannels {
  'settings:patch': SettingsPatch;
  'eq:action': EqAction;
  /** Equalizer button / Ctrl+E: from a Pegel page back to the music with the panel open. */
  'eq:toggle-panel': void;
  'view:show': View;
  /** Pegel's own window buttons (Windows/Linux). */
  'window:control': 'minimize' | 'toggleMaximize' | 'close';
  'theme:set': ThemeId;
  'yt:retry': void;
  'yt:reload': void;
  /** The panel's open/close transition ended, so the YT view may take the space back. */
  'eq-panel:animation-done': { open: boolean };
  'player:command': PlayerCommand;
  'mini:open': void;
  /** "Enlarge": close the mini player and show the main window. */
  'mini:close': void;
}

/** Main → Pegel UI (main and mini window) via `webContents.send`. */
export interface MainToUiChannels {
  'settings:changed': Settings;
  'player:state': PlayerState | null;
  /** Features limited because YT changed its page (selector self-test). */
  'player:selector-issues': string[];
  'player:page-playlist': PagePlaylist | null;
  'view:changed': View;
  'window:maximized': boolean;
  /** A playlist was created while music plays; YT's sidebar shows it only after a reload. */
  'yt:sidebar-outdated': boolean;
}

/** YT view preload → main. */
export interface YtToMainChannels {
  /** Preload is running on music.youtube.com and wants the current EQ. */
  'yt:ready': void;
  'yt:player-state': PlayerState;
  /** Result of the selector self-test: German names of affected features. */
  'yt:selector-issues': string[];
  /** The playlist page shown in the YT view changed (null: no playlist page). */
  'yt:page-playlist': PagePlaylist | null;
}

/** Main → YT view preload. */
export interface MainToYtChannels {
  'yt:eq-apply': EqSettings;
  'yt:player-command': PlayerCommand;
  'yt:effects': YtEffects;
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
  patchSettings(patch: SettingsPatch): void;
  windowControl(action: 'minimize' | 'toggleMaximize' | 'close'): void;
  isMaximized(): Promise<boolean>;
  onMaximizedChanged(listener: (maximized: boolean) => void): () => void;
  openMini(): void;
  closeMini(): void;
  getPlayerState(): Promise<PlayerState | null>;
  onPlayerState(listener: (state: PlayerState | null) => void): () => void;
  playerCommand(command: PlayerCommand): void;
  getSelectorIssues(): Promise<string[]>;
  onSelectorIssues(listener: (features: string[]) => void): () => void;
  getPagePlaylist(): Promise<PagePlaylist | null>;
  onPagePlaylist(listener: (page: PagePlaylist | null) => void): () => void;
  toggleEqPanel(): void;
  eqPanelAnimationDone(open: boolean): void;
  showView(view: View): void;
  retryLoad(): void;
  reloadYt(): void;
  onSidebarOutdated(listener: (outdated: boolean) => void): () => void;
  /** Returns a function that removes the listener. */
  onViewChanged(listener: (view: View) => void): () => void;
}
