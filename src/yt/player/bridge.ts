import { contextBridge } from 'electron';
import { largestArtwork } from '@shared/player';
import type { PagePlaylist, PlayerCommand, PlayerState } from '@shared/types';
import { runSelfTest, SELECTORS } from '../selectors';

/** Position updates while playing; everything else is sent right away. */
const POSITION_INTERVAL_MS = 1000;
/** How often the shown page is checked for a playlist. */
const PAGE_POLL_MS = 700;
/** The self-test waits a bit after the first playback so the player bar is complete. */
const SELF_TEST_DELAY_MS = 2000;

export function media(): HTMLMediaElement | null {
  return document.querySelector<HTMLMediaElement>(SELECTORS.mediaElement);
}

/**
 * Calls a method of YT's player element (`#movie_player`). Its JS API only
 * exists in the page's main world, so the call runs there; nothing is
 * exposed to the page. Returns undefined if the player or method is missing.
 */
export function playerApi<T>(
  method: string,
  ...args: (string | number | boolean)[]
): T | undefined {
  try {
    return contextBridge.executeInMainWorld({
      func: (selector: string, name: string, params: unknown[]) => {
        const player = document.querySelector(selector) as unknown as Record<
          string,
          unknown
        > | null;
        const fn = player?.[name];
        return typeof fn === 'function'
          ? (fn as (...a: unknown[]) => unknown).apply(player, params)
          : undefined;
      },
      args: [SELECTORS.playerApi, method, args],
    }) as T | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Content loudness of the loaded track from YT's player response
 * (`playerConfig.audioConfig.loudnessDb`, relative to YT's reference level).
 * Null if the player is missing; `loudnessDb` undefined if YT gives none.
 */
export function readLoudness(): { videoId: string; loudnessDb?: number } | null {
  try {
    return contextBridge.executeInMainWorld({
      func: (selector: string) => {
        type Response = {
          videoDetails?: { videoId?: unknown };
          playerConfig?: { audioConfig?: { loudnessDb?: unknown } };
        };
        const player = document.querySelector(selector) as unknown as {
          getPlayerResponse?: () => Response | undefined;
        } | null;
        const response = player?.getPlayerResponse?.();
        const videoId = response?.videoDetails?.videoId;
        if (typeof videoId !== 'string') return null;
        const db = response?.playerConfig?.audioConfig?.loudnessDb;
        return typeof db === 'number' ? { videoId, loudnessDb: db } : { videoId };
      },
      args: [SELECTORS.playerApi],
    }) as { videoId: string; loudnessDb?: number } | null;
  } catch {
    return null;
  }
}

/**
 * Id and playability of the loaded track from YT's player response. `status`
 * is YT's `playabilityStatus.status` ('OK', 'UNPLAYABLE', 'LOGIN_REQUIRED', …).
 */
export function readTrackInfo(): { videoId: string; status: string } | null {
  try {
    return contextBridge.executeInMainWorld({
      func: (selector: string) => {
        type Response = {
          videoDetails?: { videoId?: unknown };
          playabilityStatus?: { status?: unknown };
        };
        const player = document.querySelector(selector) as unknown as {
          getPlayerResponse?: () => Response | undefined;
        } | null;
        const response = player?.getPlayerResponse?.();
        const videoId = response?.videoDetails?.videoId;
        if (typeof videoId !== 'string') return null;
        const status = response?.playabilityStatus?.status;
        return { videoId, status: typeof status === 'string' ? status : 'OK' };
      },
      args: [SELECTORS.playerApi],
    }) as { videoId: string; status: string } | null;
  } catch {
    return null;
  }
}

/** True while YT plays an ad instead of the track. */
export function isAdShowing(): boolean {
  return document.querySelector(SELECTORS.adShowing) !== null;
}

/**
 * Plays a track through YT's own in-page navigation (like clicking it), so
 * the page, the queue and the EQ chain stay. Returns false if YT's app
 * element is missing; the caller then falls back to loading the URL.
 */
export function navigateToTrack(videoId: string, playlistId?: string): boolean {
  try {
    return contextBridge.executeInMainWorld({
      func: (selector: string, id: string, list: string) => {
        const app = document.querySelector(selector);
        if (!app) return false;
        const watchEndpoint: Record<string, string> = { videoId: id };
        if (list) watchEndpoint['playlistId'] = list;
        app.dispatchEvent(
          new CustomEvent('yt-navigate', {
            bubbles: true,
            composed: true,
            detail: { endpoint: { watchEndpoint } },
          }),
        );
        return true;
      },
      args: [SELECTORS.app, videoId, playlistId ?? ''],
    }) as boolean;
  } catch {
    return false;
  }
}

/** A YT watch endpoint (videoId, playlistId, index, params) as plain values. */
export type WatchEndpoint = Record<string, string | number>;

/**
 * Where YT's own queue would continue: the watch endpoint of the item after
 * the one playing. Read from the queue element's data (main world) right
 * before the party queue takes over, so the host's playlist resumes there.
 */
export function readResumeEndpoint(): WatchEndpoint | null {
  try {
    return contextBridge.executeInMainWorld({
      func: (selectedSel: string, itemSel: string) => {
        const selected = document.querySelector(selectedSel);
        if (!selected) return null;
        const items = [...document.querySelectorAll(itemSel)];
        const next = items[items.indexOf(selected) + 1] as unknown as
          | {
              data?: { navigationEndpoint?: { watchEndpoint?: Record<string, unknown> } };
            }
          | undefined;
        const endpoint = next?.data?.navigationEndpoint?.watchEndpoint;
        if (!endpoint || typeof endpoint['videoId'] !== 'string') return null;
        const plain: Record<string, string | number> = {};
        for (const key of ['videoId', 'playlistId', 'index', 'params', 'playerParams']) {
          const value = endpoint[key];
          if (typeof value === 'string' || typeof value === 'number') plain[key] = value;
        }
        return plain;
      },
      args: [SELECTORS.queueItemSelected, SELECTORS.queueItem],
    }) as WatchEndpoint | null;
  } catch {
    return null;
  }
}

/** Like navigateToTrack, with a full endpoint (back into the host's playlist). */
export function navigateToEndpoint(endpoint: WatchEndpoint): boolean {
  try {
    return contextBridge.executeInMainWorld({
      func: (selector: string, watchEndpoint: Record<string, string | number>) => {
        const app = document.querySelector(selector);
        if (!app) return false;
        app.dispatchEvent(
          new CustomEvent('yt-navigate', {
            bubbles: true,
            composed: true,
            detail: { endpoint: { watchEndpoint } },
          }),
        );
        return true;
      },
      args: [SELECTORS.app, endpoint],
    }) as boolean;
  } catch {
    return false;
  }
}

/** URL of a track, for the fallback when in-page navigation does not work. */
export function trackUrl(videoId: string, playlistId?: string): string {
  const url = new URL('https://music.youtube.com/watch');
  url.searchParams.set('v', videoId);
  if (playlistId) url.searchParams.set('list', playlistId);
  return url.toString();
}

/**
 * Reports the loudness whenever another track is loaded. YT fills the player
 * response a moment after the track starts, so it is also polled lightly.
 */
export function watchLoudness(onTrack: (loudnessDb: number | undefined) => void): void {
  let lastVideoId = '';
  const check = () => {
    const info = readLoudness();
    if (!info || info.videoId === lastVideoId) return;
    lastVideoId = info.videoId;
    onTrack(info.loudnessDb);
  };
  for (const type of ['loadedmetadata', 'playing']) document.addEventListener(type, check, true);
  setInterval(check, POSITION_INTERVAL_MS);
}

/**
 * The playlist the current track plays from. YT's player knows it no matter
 * which page is shown (with the player collapsed the URL is the playlist
 * page, not /watch); the `list=` of /watch is the fallback. The name comes
 * from the queue header, or from the playlist page if it shows that list.
 */
function readPlaylist(): { id: string; title?: string } | null {
  const params = new URLSearchParams(location.search);
  const id =
    playerApi<string>('getPlaylistId') ||
    (location.pathname === '/watch' ? params.get('list') : null);
  if (!id) return null;
  const pageTitle =
    location.pathname === '/playlist' && params.get('list') === id
      ? document.querySelector(SELECTORS.playlistPageTitle)?.textContent?.trim()
      : undefined;
  const title = document.querySelector(SELECTORS.queueTitle)?.textContent?.trim() || pageTitle;
  return title ? { id, title } : { id };
}

function readLiked(): boolean | undefined {
  const status = document.querySelector(SELECTORS.likeRenderer)?.getAttribute('like-status');
  return status ? status === 'LIKE' : undefined;
}

/** Last state outside an ad: during an ad the track it interrupts is reported. */
let lastTrackState: PlayerState | null = null;

/**
 * Reads the player state, primarily from navigator.mediaSession and the
 * media element; only "liked" comes from the DOM.
 */
export function readState(): PlayerState | null {
  if (isAdShowing()) {
    return lastTrackState ? { ...lastTrackState, isPlaying: false, adPlaying: true } : null;
  }
  const metadata = navigator.mediaSession.metadata;
  const el = media();
  if (!metadata || !metadata.title) return null;
  const duration = el && Number.isFinite(el.duration) ? el.duration : 0;
  const state: PlayerState = {
    title: metadata.title,
    artist: metadata.artist,
    isPlaying: el ? !el.paused : navigator.mediaSession.playbackState === 'playing',
    positionSec: Math.floor(el?.currentTime ?? 0),
    durationSec: Math.round(duration),
  };
  if (metadata.album) state.album = metadata.album;
  const artworkUrl = largestArtwork(metadata.artwork);
  if (artworkUrl) state.artworkUrl = artworkUrl;
  const liked = readLiked();
  if (liked !== undefined) state.liked = liked;
  const playlist = readPlaylist();
  if (playlist) {
    state.playlistId = playlist.id;
    if (playlist.title) state.playlistTitle = playlist.title;
  }
  const volume = playerApi<number>('getVolume');
  if (typeof volume === 'number') state.volume = volume / 100;
  const muted = playerApi<boolean>('isMuted');
  if (typeof muted === 'boolean') state.muted = muted;
  const info = readTrackInfo();
  if (info) state.videoId = info.videoId;
  lastTrackState = state;
  return state;
}

function click(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  el?.click();
  return !!el;
}

export function runCommand(command: PlayerCommand): void {
  const el = media();
  switch (command.type) {
    case 'playPause':
      if (el) void (el.paused ? el.play() : el.pause());
      break;
    case 'play':
      if (el?.paused) void el.play().catch(() => {});
      break;
    case 'pause':
      if (el && !el.paused) el.pause();
      break;
    case 'next':
      click(SELECTORS.nextButton);
      break;
    case 'previous':
      click(SELECTORS.previousButton);
      break;
    case 'seek':
      if (el && Number.isFinite(command.sec)) el.currentTime = Math.max(0, command.sec);
      break;
    case 'setVolume': {
      // YT keeps its own volume state; setting el.volume would desync its slider
      // and be reset on the next track. Changing the volume also unmutes.
      playerApi('setVolume', Math.round(Math.min(1, Math.max(0, command.volume)) * 100));
      if (playerApi<boolean>('isMuted')) playerApi('unMute');
      break;
    }
    case 'toggleMute':
      playerApi(playerApi<boolean>('isMuted') ? 'unMute' : 'mute');
      break;
    case 'toggleLike':
      click(SELECTORS.likeButton);
      break;
  }
}

/** Commands whose effect shows up without a media event (volume, like). */
export const NEEDS_REPORT: ReadonlySet<PlayerCommand['type']> = new Set([
  'setVolume',
  'toggleMute',
  'toggleLike',
]);

/**
 * Watches the player and reports state changes. Position-only changes are
 * throttled to once per second.
 */
export function startBridge(
  onState: (state: PlayerState) => void,
  onSelectorIssues: (features: string[]) => void,
): { report(force?: boolean): void } {
  let lastKey = '';
  let lastSent = 0;

  const report = (force = false) => {
    const state = readState();
    if (!state) return;
    const { positionSec: _, ...rest } = state;
    const key = JSON.stringify(rest);
    const now = Date.now();
    const positionDue = state.isPlaying && now - lastSent >= POSITION_INTERVAL_MS;
    if (force || key !== lastKey || positionDue) {
      lastKey = key;
      lastSent = now;
      onState(state);
    }
  };

  for (const type of ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeked']) {
    document.addEventListener(type, () => report(true), true);
  }
  document.addEventListener('timeupdate', () => report(), true);

  // Title changes without media events (and the like button) are caught by a light poll.
  setInterval(() => report(), POSITION_INTERVAL_MS);

  let tested = false;
  document.addEventListener(
    'playing',
    () => {
      if (tested) return;
      tested = true;
      setTimeout(() => {
        const issues = runSelfTest(document);
        if (issues.length) console.warn('[pegel-player] selectors missing for:', issues);
        onSelectorIssues(issues);
      }, SELF_TEST_DELAY_MS);
    },
    true,
  );

  return { report };
}

/** The playlist page currently shown (/playlist?list=…), independent of playback. */
export function readPagePlaylist(): PagePlaylist | null {
  if (location.pathname !== '/playlist') return null;
  const playlistId = new URLSearchParams(location.search).get('list');
  if (!playlistId) return null;
  const title = document.querySelector(SELECTORS.playlistPageTitle)?.textContent?.trim();
  return title ? { playlistId, title } : { playlistId };
}

/**
 * Reports which playlist page is shown. YT navigates without page loads, so
 * a light poll catches both the URL change and the heading rendering later.
 */
export function startPageWatcher(onPage: (page: PagePlaylist | null) => void): void {
  let lastKey = '';
  const check = () => {
    const page = readPagePlaylist();
    const key = JSON.stringify(page);
    if (key === lastKey) return;
    lastKey = key;
    onPage(page);
  };
  check();
  setInterval(check, PAGE_POLL_MS);
}
