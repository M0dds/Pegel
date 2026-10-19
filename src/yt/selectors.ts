/**
 * All DOM selectors for the YT Music page live here and nowhere else.
 * Prefer navigator.mediaSession and the media element; the DOM is the last resort.
 * Checked against music.youtube.com in October 2026.
 */
export const SELECTORS = {
  /** The element YT Music plays through (a <video>, also for audio-only tracks). */
  mediaElement: 'video, audio',
  playerBar: 'ytmusic-player-bar',
  nextButton: 'ytmusic-player-bar .next-button',
  previousButton: 'ytmusic-player-bar .previous-button',
  /** Carries `like-status="LIKE" | "INDIFFERENT" | "DISLIKE"`. */
  likeRenderer: 'ytmusic-player-bar ytmusic-like-button-renderer',
  likeButton: 'ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like button',
  /** "Playing from <name>" above the queue on the player page. */
  queueTitle: 'ytmusic-queue-header-renderer .subtitle',
  /** Heading of a playlist page (/playlist?list=…). */
  playlistPageTitle: 'ytmusic-responsive-header-renderer h1',
  /** YT's player element with its JS API (setVolume, …); only reachable from the main world. */
  playerApi: '#movie_player',
} as const satisfies Record<string, string>;

export type SelectorName = keyof typeof SELECTORS;

/** Selectors checked by the self-test, with the German name of what breaks without them. */
export const SELF_TEST: readonly { selector: SelectorName; feature: string }[] = [
  { selector: 'nextButton', feature: 'Weiter' },
  { selector: 'previousButton', feature: 'Zurück' },
  { selector: 'likeRenderer', feature: 'Gefällt mir' },
  { selector: 'likeButton', feature: 'Gefällt mir' },
  { selector: 'playerApi', feature: 'Lautstärke' },
];

/** Features whose selectors are missing in `root` (deduplicated). */
export function runSelfTest(root: ParentNode): string[] {
  const broken = SELF_TEST.filter(({ selector }) => !root.querySelector(SELECTORS[selector]));
  return [...new Set(broken.map((b) => b.feature))];
}
