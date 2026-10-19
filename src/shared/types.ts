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
}

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
}

export type PlayerCommand =
  | { type: 'playPause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; sec: number }
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleLike' };

/** Pegel's own pages shown instead of the YT view. 'music' means the YT view is visible. */
export type View = 'music' | 'settings' | 'welcome';

export interface AppInfo {
  version: string;
  /** Value of `process.platform` in the main process. */
  platform: string;
}
