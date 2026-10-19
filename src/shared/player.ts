import type { PlayerCommand, PlayerState } from './types';

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates a state reported by the YT preload; strips unknown fields. */
export function toPlayerState(value: unknown): PlayerState | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isStr(v['title']) || !isStr(v['artist']) || typeof v['isPlaying'] !== 'boolean') return null;
  if (!isNum(v['positionSec']) || !isNum(v['durationSec'])) return null;
  const state: PlayerState = {
    title: v['title'].slice(0, 300),
    artist: v['artist'].slice(0, 300),
    isPlaying: v['isPlaying'],
    positionSec: Math.max(0, v['positionSec']),
    durationSec: Math.max(0, v['durationSec']),
  };
  if (isStr(v['album'])) state.album = v['album'].slice(0, 300);
  if (isStr(v['artworkUrl']) && v['artworkUrl'].startsWith('https://')) {
    state.artworkUrl = v['artworkUrl'];
  }
  if (typeof v['liked'] === 'boolean') state.liked = v['liked'];
  return state;
}

/** Validates a command coming from a Pegel UI window. */
export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v['type']) {
    case 'playPause':
    case 'next':
    case 'previous':
    case 'toggleLike':
      return true;
    case 'seek':
      return isNum(v['sec']);
    case 'setVolume':
      return isNum(v['volume']);
    default:
      return false;
  }
}

/** "Titel – Interpret", shortened for tray tooltips and menus. */
export function trackLabel(state: PlayerState | null, max = 60): string {
  if (!state) return 'Nichts wird abgespielt';
  const text = state.artist ? `${state.title} – ${state.artist}` : state.title;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Largest artwork from the media session ("544x544" beats "60x60"). */
export function largestArtwork(
  artwork: readonly { src: string; sizes?: string }[],
): string | undefined {
  let best: { src: string } | undefined;
  let bestSize = -1;
  for (const image of artwork) {
    const size = Math.max(
      0,
      ...(image.sizes ?? '')
        .split(/\s+/)
        .map((s) => Number.parseInt(s.split('x')[0] ?? '', 10) || 0),
    );
    if (size > bestSize) {
      best = image;
      bestSize = size;
    }
  }
  return best?.src;
}
