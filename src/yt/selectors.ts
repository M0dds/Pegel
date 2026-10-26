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
  /** YT's layout while the player bar is shown at the bottom. */
  /** Progress bar in the player bar; YT colours it with its own gradient. */
  progressBar: '#progress-bar',
  /** Scroll container of YT's context menus (⋮ on tracks etc.). */
  menuPopup: 'ytmusic-menu-popup-renderer',
  /** The item list inside a context menu; carries YT's menu background. */
  menuList: 'ytmusic-menu-popup-renderer tp-yt-paper-listbox',
  /** Blurred cover art behind the top of browse pages (home, playlists). */
  browseBackground: 'ytmusic-browse-response #background',
  /** Gradient over that art; YT sizes it to one tile and repeats it down the page. */
  browseGradient: 'ytmusic-browse-response .background-gradient',
  /** YT's player element with its JS API (setVolume, …); only reachable from the main world. */
  playerApi: '#movie_player',
  /** YT marks its player like this while an ad plays (listening party waits for it). */
  adShowing: '#movie_player.ad-showing',
  /** Root element of YT Music; takes YT's own in-page navigation (listening party). */
  app: 'ytmusic-app',

  // Drag & drop into playlists (src/yt/dnd).
  /** A track row in YT's lists (album, playlist, search, home) and in the queue. */
  songRow: 'ytmusic-responsive-list-item-renderer, ytmusic-player-queue-item',
  /** A track in the queue (YT gives it a "move" cursor because it can be reordered). */
  queueRow: 'ytmusic-player-queue-item',
  /** The link of a track inside a row (`watch?v=…`); albums and artists link elsewhere. */
  trackLink: 'a[href*="watch?v="]',
  /** Title and artist inside a row (list rows / queue items). */
  rowTitle: '.title, .song-title',
  rowArtist: '.secondary-flex-columns a[href^="channel/"], .byline',
  /** Cover inside a row (lazy: a placeholder until it was visible). */
  rowCover: 'img',
  /** Parts of a row that keep their own press (menus, like, checkboxes): no drag from there. */
  rowNoDrag: 'ytmusic-menu-renderer, ytmusic-like-button-renderer, tp-yt-paper-checkbox, input',
  /** Album and playlist pages: the header's cover and artist (track rows there have none). */
  pageCover: 'ytmusic-responsive-header-renderer > ytmusic-thumbnail-renderer.thumbnail img',
  pageArtist: 'ytmusic-responsive-header-renderer .strapline-text',
  /** The current track in the player bar (cover and title, not the buttons). */
  playerBarTrack:
    'ytmusic-player-bar .thumbnail-image-wrapper, ytmusic-player-bar .content-info-wrapper',
  /** Entries of YT's left sidebar; the user's playlists are among them. */
  guideEntry: 'ytmusic-guide-renderer ytmusic-guide-entry-renderer',
  /** The visible row of a sidebar entry (carries YT's hover background). */
  guideEntryItem: 'tp-yt-paper-item',
  /** Name of a sidebar entry. */
  guideEntryTitle: '.title',
} as const satisfies Record<string, string>;

export type SelectorName = keyof typeof SELECTORS;

/** Selectors checked by the self-test, with the German name of what breaks without them. */
export const SELF_TEST: readonly { selector: SelectorName; feature: string }[] = [
  { selector: 'nextButton', feature: 'Weiter' },
  { selector: 'previousButton', feature: 'Zurück' },
  { selector: 'likeRenderer', feature: 'Gefällt mir' },
  { selector: 'likeButton', feature: 'Gefällt mir' },
  { selector: 'playerApi', feature: 'Lautstärke' },
  { selector: 'app', feature: 'Hör-Party (Titel laden)' },
  // Checked while a track plays, so the queue (song rows) and the player bar exist.
  { selector: 'songRow', feature: 'Songs in Playlists ziehen' },
  { selector: 'playerBarTrack', feature: 'Songs in Playlists ziehen' },
  { selector: 'guideEntry', feature: 'Songs in Playlists ziehen' },
];

/** Features whose selectors are missing in `root` (deduplicated). */
export function runSelfTest(root: ParentNode): string[] {
  const broken = SELF_TEST.filter(({ selector }) => !root.querySelector(SELECTORS[selector]));
  return [...new Set(broken.map((b) => b.feature))];
}
