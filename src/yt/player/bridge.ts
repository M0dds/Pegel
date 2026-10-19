import { contextBridge } from 'electron';
import { largestArtwork } from '@shared/player';
import type { PlayerCommand, PlayerState } from '@shared/types';
import { runSelfTest, SELECTORS } from '../selectors';

/** Position updates while playing; everything else is sent right away. */
const POSITION_INTERVAL_MS = 1000;
/** The self-test waits a bit after the first playback so the player bar is complete. */
const SELF_TEST_DELAY_MS = 2000;

function media(): HTMLMediaElement | null {
  return document.querySelector<HTMLMediaElement>(SELECTORS.mediaElement);
}

function readLiked(): boolean | undefined {
  const status = document.querySelector(SELECTORS.likeRenderer)?.getAttribute('like-status');
  return status ? status === 'LIKE' : undefined;
}

/**
 * Reads the player state, primarily from navigator.mediaSession and the
 * media element; only "liked" comes from the DOM.
 */
export function readState(): PlayerState | null {
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
      // and be reset on the next track. Its player API lives in the main world.
      const volume = Math.round(Math.min(1, Math.max(0, command.volume)) * 100);
      contextBridge.executeInMainWorld({
        func: (selector: string, value: number) => {
          // Runs in the page: YT's player element exposes setVolume(0…100).
          const player = document.querySelector(selector) as unknown as {
            setVolume?: (v: number) => void;
          } | null;
          player?.setVolume?.(value);
        },
        args: [SELECTORS.playerApi, volume],
      });
      break;
    }
    case 'toggleLike':
      click(SELECTORS.likeButton);
      break;
  }
}

/**
 * Watches the player and reports state changes. Position-only changes are
 * throttled to once per second.
 */
export function startBridge(
  onState: (state: PlayerState) => void,
  onSelectorIssues: (features: string[]) => void,
): void {
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
}
