/**
 * All DOM selectors for the YT Music page live here and nowhere else.
 * Prefer navigator.mediaSession and the media element; the DOM is the last resort.
 * The player-bar selectors and the self-test follow in M4.
 */
export const SELECTORS = {
  /** The element YT Music plays through (a <video>, also for audio-only tracks). */
  mediaElement: 'video, audio',
} as const satisfies Record<string, string>;
