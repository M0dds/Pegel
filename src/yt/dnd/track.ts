/** What a drag carries: one YT Music track. */
export interface DraggedTrack {
  videoId: string;
  title: string;
  artist?: string;
  /** Cover as the page shows it (already loaded, so the card has it at once). */
  coverUrl?: string;
  /** The same cover in a size that is sharp on the card, swapped in once loaded. */
  sharpCoverUrl?: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

/**
 * Video id from a YT row link (`watch?v=…&list=…`, relative or absolute).
 * Null for links that are not a track (albums, artists, playlists).
 */
export function videoIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://music.youtube.com/');
  } catch {
    return null;
  }
  if (url.pathname !== '/watch') return null;
  const id = url.searchParams.get('v');
  return isVideoId(id) ? id : null;
}

/**
 * Playlist id behind a sidebar entry: YT links playlists as browse pages
 * with the id prefixed by "VL". Other browse ids (home, library, …) give null.
 */
export function playlistIdFromBrowseId(browseId: unknown): string | null {
  if (typeof browseId !== 'string' || !browseId.startsWith('VL')) return null;
  const id = browseId.slice(2);
  return /^[A-Za-z0-9_-]{2,}$/.test(id) ? id : null;
}

/**
 * Asks Google's image server for a cover of at least `px` square pixels. YT
 * lists use 60 px images (`…=w60-h60-l90-rj`); the card wants a sharper one.
 * Larger images and other URLs (video thumbnails on i.ytimg.com) stay as they are.
 */
export function sizedCover(url: string | null | undefined, px: number): string | undefined {
  if (!url || !/^https:\/\//.test(url)) return undefined;
  return url.replace(/=w(\d+)-h(\d+)/, (match, w: string, h: string) =>
    Math.max(+w, +h) < px ? `=w${px}-h${px}` : match,
  );
}
