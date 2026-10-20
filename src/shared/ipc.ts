import type { EqAction } from './eq';
import type { PegelLink } from './links';
import type { PartyControl, PartyReport, SocialState } from './social';
import type { UpdateStatus } from './update';
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
  'update:get': { args: []; result: UpdateStatus };
  'social:get': { args: []; result: SocialState };
}

/** Settings of "Freunde & Party" the UI may change (validated in main). */
export interface SocialSettingsPatch {
  displayName?: string;
  shareNowPlaying?: boolean;
  audioOffsetMs?: number;
  partyOpen?: boolean;
  allowSuggestions?: boolean;
  everyoneControls?: boolean;
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
  'welcome:finish': { signIn: boolean };
  'account:sign-out': void;
  /** A side panel's (EQ or Social) open/close transition ended, so the YT view may take the space back. */
  'eq-panel:animation-done': { open: boolean };
  /** Social button / Ctrl+U: like the equalizer button, for the friends & party panel. */
  'social:toggle-panel': void;
  /** First setup: creates the identity and connects. */
  'social:enable': { displayName: string };
  'social:disable': void;
  /** Deletes identity and friend list. */
  'social:reset': void;
  'social:patch': SocialSettingsPatch;
  'social:create-code': void;
  'social:redeem-code': string;
  'social:remove-friend': string;
  'party:start': void;
  'party:invite': string;
  'party:respond': { inviteId: string; accept: boolean };
  /** Join a friend's open party. */
  'party:join': string;
  'party:leave': void;
  'party:end': void;
  'party:kick': string;
  'party:transfer': string;
  /** Host: play a suggestion now (accept) or drop it. */
  'party:suggestion': { id: string; accept: boolean };
  /** Guest: back to the party after a local pause. */
  'party:resume': void;
  /** Friend list: play the track a friend is listening to. */
  'social:play-friend-track': string;
  /** Friend list: open the playlist a friend is listening to. */
  'social:open-friend-playlist': string;
  'player:command': PlayerCommand;
  'mini:open': void;
  /** "Enlarge": close the mini player and show the main window. */
  'mini:close': void;
  /** Mini player visualizer: how many bars it draws (0: none, stops the feed). */
  'mini:spectrum-bars': number;
  /** Opens the link offered in the title bar (copied to the clipboard). */
  'link:open': void;
  'link:dismiss': void;
  /** Text dropped onto a Pegel page; opened if it is a YT link. */
  'link:drop': string;
  'update:check': void;
  /** Restart into a downloaded update (Windows) or open the download page (macOS). */
  'update:install': void;
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
  /** A YT link in the clipboard that Pegel can open (null: none / hint gone). */
  'link:offer': PegelLink | null;
  'update:status': UpdateStatus;
  /** Bar levels 0…255 for the mini player's visualizer (empty: silence). */
  'mini:spectrum': number[];
  'social:state': SocialState;
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
  /** Text dropped onto YT where YT itself does not take it. */
  'yt:drop-link': string;
  /** Bar levels for the mini player, while it asks for them. */
  'yt:spectrum': number[];
  /** Precise playback facts while in a listening party. */
  'yt:party-report': PartyReport;
}

/** Main → YT view preload. */
export interface MainToYtChannels {
  'yt:eq-apply': EqSettings;
  'yt:player-command': PlayerCommand;
  'yt:effects': YtEffects;
  /** Number of bars the mini player wants (0: stop). */
  'yt:spectrum-feed': number;
  /** Listening party role and target (null: no party). */
  'yt:party': PartyControl | null;
  /** Plays a track in-page (host accepted a suggestion). */
  'yt:play-track': { videoId: string; playlistId?: string };
  /** Guest: leave the local pause and play in sync again. */
  'yt:party-resume': void;
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
  finishWelcome(signIn: boolean): void;
  signOut(): void;
  onSidebarOutdated(listener: (outdated: boolean) => void): () => void;
  onLinkOffer(listener: (link: PegelLink | null) => void): () => void;
  openOfferedLink(): void;
  dismissLink(): void;
  dropLink(text: string): void;
  getUpdateStatus(): Promise<UpdateStatus>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  checkForUpdates(): void;
  installUpdate(): void;
  setSpectrumBars(bars: number): void;
  getSocialState(): Promise<SocialState>;
  onSocialState(listener: (state: SocialState) => void): () => void;
  toggleSocialPanel(): void;
  socialEnable(displayName: string): void;
  socialDisable(): void;
  socialReset(): void;
  socialPatch(patch: SocialSettingsPatch): void;
  createFriendCode(): void;
  redeemFriendCode(code: string): void;
  removeFriend(friendId: string): void;
  partyStart(): void;
  partyInvite(friendId: string): void;
  partyRespond(inviteId: string, accept: boolean): void;
  partyJoin(friendId: string): void;
  partyLeave(): void;
  partyEnd(): void;
  partyKick(userId: string): void;
  partyTransfer(userId: string): void;
  partySuggestion(id: string, accept: boolean): void;
  partyResume(): void;
  playFriendTrack(friendId: string): void;
  openFriendPlaylist(friendId: string): void;
  onSpectrum(listener: (levels: number[]) => void): () => void;
  /** Returns a function that removes the listener. */
  onViewChanged(listener: (view: View) => void): () => void;
}
