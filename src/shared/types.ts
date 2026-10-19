export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ThemeId =
  | 'standard'
  | 'sakura'
  | 'nordlicht'
  | 'bernstein'
  | 'mitternacht'
  | 'lagune'
  | 'glut'
  | 'wald'
  | 'neon'
  | 'mono';

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
  /** Raise quiet tracks to YT's reference loudness (YT lowers loud ones itself). */
  levelling: boolean;
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

/** A playlist page that is shown in the YT view (not necessarily playing). */
export interface PagePlaylist {
  playlistId: string;
  title?: string;
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
  /** Keyboard media keys / system media controls (Chromium); applied on the next start. */
  mediaKeys: boolean;
  /** Offer YT links from the clipboard when the window gets focus. */
  clipboardLinks: boolean;
  /** `visualizer`: frequency bars behind the mini player's controls. */
  mini: { alwaysOnTop: boolean; bounds?: Rect; hideMainOnOpen: boolean; visualizer: boolean };
  discord: { enabled: boolean; hideWhenPaused: boolean };
  window: { bounds?: Rect; maximized: boolean };
  welcomeShown: boolean;
  /**
   * Visual extras; both can be switched off in the settings. `theme`: the
   * current theme's animated effect (petals, aurora, sparks …), if it has one.
   */
  effects: { theme: boolean; visualizer: boolean };
  /** The one-time "Pegel keeps running in the tray" hint was shown (Windows). */
  trayHintShown: boolean;
  social: SocialSettings;
}

/** Friends & listening party (M10). Off until set up in the Social panel. */
export interface SocialSettings {
  enabled: boolean;
  /** Shown to friends; 1–24 characters. */
  displayName: string;
  /** Friends see "hört gerade …" (otherwise only "online"). */
  shareNowPlaying: boolean;
  /** Extra output delay of this device (e.g. Bluetooth), -300…300 ms. */
  audioOffsetMs: number;
  /** Host: friends may join the party without an invite. */
  partyOpen: boolean;
  /** Host: guests may suggest tracks. */
  allowSuggestions: boolean;
  panelOpen: boolean;
}

/** Settings the UI may change directly (validated in the main process). */
export type SettingsPatch = Partial<
  Pick<Settings, 'closeToTray' | 'startAtLogin' | 'mediaKeys' | 'clipboardLinks'>
> & {
  mini?: Partial<Pick<Settings['mini'], 'alwaysOnTop' | 'hideMainOnOpen' | 'visualizer'>>;
  effects?: Partial<Settings['effects']>;
};

/** What the YT view should draw on top of YT (sent by the main process). */
export interface YtEffects {
  /** Theme whose effect to draw (petals, aurora …); null when off or the theme has none. */
  themeEffect: ThemeId | null;
  visualizer: boolean;
  /** Theme accent, for the visualizer bars. */
  accent: string;
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
  /** The playlist the track plays from (`list=` in the URL), if any. */
  playlistId?: string;
  playlistTitle?: string;
  /** YT's own volume, 0…1. */
  volume?: number;
  muted?: boolean;
  /** YT's id of the loaded track (from the player response). */
  videoId?: string;
  /** An ad plays; title and artist stay those of the track it interrupts. */
  adPlaying?: boolean;
}

export type PlayerCommand =
  | { type: 'playPause' }
  | { type: 'play' }
  | { type: 'pause' }
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
  /** Media keys setting that was active when Pegel started (changes need a restart). */
  mediaKeysAtStart: boolean;
  /** Value of `process.platform` in the main process. */
  platform: string;
  /** Installed build that can update itself (not in development). */
  updatesSupported: boolean;
}
