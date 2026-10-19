export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ThemeId = 'standard' | 'sakura' | 'nordlicht' | 'bernstein';

export interface EqPreset {
  name: string;
  /** One gain per band in dB, length 10, -12…12. */
  gains: number[];
  /** Preamp in dB, -12…6. */
  preamp: number;
}

export interface EqSettings {
  enabled: boolean;
  /** Name of a built-in or custom preset, or 'Eigene' after manual changes. */
  preset: string;
  gains: number[];
  preamp: number;
  autoPreamp: boolean;
  panelOpen: boolean;
  customPresets: EqPreset[];
  /** Presets assigned to YT playlists; applied automatically when one plays. */
  playlistPresets: PlaylistPreset[];
  /**
   * Set while a playlist preset was applied automatically: the preset to
   * return to when the playlist is left. Cleared by any manual preset choice.
   */
  autoPreset?: { from: string };
}

export interface PlaylistPreset {
  /** YT playlist id from the `list=` parameter. */
  playlistId: string;
  /** Display name, as YT showed it when the preset was assigned. */
  title: string;
  preset: string;
}

export interface Settings {
  version: 1;
  theme: ThemeId;
  eq: EqSettings;
  closeToTray: boolean;
  startAtLogin: boolean;
  mini: { alwaysOnTop: boolean; bounds?: Rect; hideMainOnOpen: boolean };
  discord: { enabled: boolean; hideWhenPaused: boolean };
  window: { bounds?: Rect; maximized: boolean };
  welcomeShown: boolean;
  /** The one-time "Pegel keeps running in the tray" hint was shown (Windows). */
  trayHintShown: boolean;
}

/** Settings the UI may change directly (validated in the main process). */
export type SettingsPatch = Partial<Pick<Settings, 'closeToTray' | 'startAtLogin'>> & {
  mini?: Partial<Pick<Settings['mini'], 'alwaysOnTop' | 'hideMainOnOpen'>>;
};

export interface PlayerState {
  title: string;
  artist: string;
  album?: string;
  /** Largest available resolution. */
  artworkUrl?: string;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  liked?: boolean;
  /** The playlist the track plays from (`list=` in the URL), if any. */
  playlistId?: string;
  playlistTitle?: string;
  /** YT's own volume, 0…1. */
  volume?: number;
  muted?: boolean;
}

export type PlayerCommand =
  | { type: 'playPause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; sec: number }
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleMute' }
  | { type: 'toggleLike' };

/**
 * What fills the content area. 'music' means the YT view is visible; the
 * others are Pegel's own pages ('offline' after YT failed to load).
 */
export type View = 'music' | 'settings' | 'welcome' | 'offline';

export const VIEWS: readonly View[] = ['music', 'settings', 'welcome', 'offline'];

export function isView(value: unknown): value is View {
  return typeof value === 'string' && (VIEWS as readonly string[]).includes(value);
}

export interface AppInfo {
  version: string;
  /** Value of `process.platform` in the main process. */
  platform: string;
}
