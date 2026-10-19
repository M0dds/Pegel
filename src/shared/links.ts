/**
 * Links that Pegel can open: YT Music links, and YouTube video/playlist links
 * (as shared from Discord, a browser, …), turned into their YT Music page.
 */

export type LinkKind = 'track' | 'playlist' | 'album' | 'artist' | 'page';

export interface PegelLink {
  /** music.youtube.com URL to load in the YT view. */
  url: string;
  kind: LinkKind;
}

const MUSIC_ORIGIN = 'https://music.youtube.com';
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
/** YT video ids: 11 characters of [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Playlist, album and mix ids (PL…, OLAK5uy_…, RD…, VL…). */
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
/** Paths on music.youtube.com worth opening; everything else is YT's own UI. */
const MUSIC_PATHS = /^\/(watch|playlist|browse\/[A-Za-z0-9_-]+|channel\/[A-Za-z0-9_-]+)$/;
/** First web link in a text, e.g. "hör mal: https://youtu.be/…". */
const FIRST_URL = /https?:\/\/[^\s<>"'`]+/i;

function watchLink(videoId: string, list: string | null): PegelLink {
  const params = new URLSearchParams({ v: videoId });
  if (list && LIST_ID.test(list)) params.set('list', list);
  return { url: `${MUSIC_ORIGIN}/watch?${params}`, kind: 'track' };
}

function playlistLink(list: string): PegelLink {
  return { url: `${MUSIC_ORIGIN}/playlist?list=${encodeURIComponent(list)}`, kind: 'playlist' };
}

function browseKind(id: string): LinkKind {
  if (id.startsWith('MPREb')) return 'album';
  if (id.startsWith('UC') || id.startsWith('MPLA')) return 'artist';
  if (id.startsWith('VL')) return 'playlist';
  return 'page';
}

function fromMusicUrl(url: URL): PegelLink | null {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!MUSIC_PATHS.test(path)) return null;
  const v = url.searchParams.get('v');
  const list = url.searchParams.get('list');
  if (path === '/watch') return v && VIDEO_ID.test(v) ? watchLink(v, list) : null;
  if (path === '/playlist') return list && LIST_ID.test(list) ? playlistLink(list) : null;
  const [, section, id = ''] = path.split('/');
  return {
    url: `${MUSIC_ORIGIN}${path}`,
    kind: section === 'channel' ? 'artist' : browseKind(id),
  };
}

function fromYoutubeUrl(url: URL): PegelLink | null {
  const host = url.hostname.toLowerCase();
  const list = url.searchParams.get('list');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return VIDEO_ID.test(id) ? watchLink(id, list) : null;
  }
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (url.pathname === '/watch') {
    const v = url.searchParams.get('v');
    return v && VIDEO_ID.test(v) ? watchLink(v, list) : null;
  }
  const short = /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
  if (short) return watchLink(short[1]!, null);
  if (url.pathname === '/playlist') return list && LIST_ID.test(list) ? playlistLink(list) : null;
  return null;
}

/** Parses one URL; null if it is not something Pegel can open. */
export function parsePegelLink(rawUrl: string): PegelLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hostname.toLowerCase() === 'music.youtube.com') return fromMusicUrl(url);
  return fromYoutubeUrl(url);
}

/** Finds an openable link in clipboard or drop text. Long texts are not searched. */
export function findPegelLink(text: string): PegelLink | null {
  if (!text || text.length > 2000) return null;
  const match = FIRST_URL.exec(text);
  return match ? parsePegelLink(match[0]) : null;
}

/** True if both URLs show the same YT Music content (ignores extra parameters). */
export function isSameContent(a: string, b: string): boolean {
  const pa = parsePegelLink(a);
  const pb = parsePegelLink(b);
  if (!pa || !pb) return false;
  if (pa.kind === 'track' && pb.kind === 'track') {
    return new URL(pa.url).searchParams.get('v') === new URL(pb.url).searchParams.get('v');
  }
  return pa.url === pb.url;
}

/** German label for the title bar hint. */
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  track: 'Titel',
  playlist: 'Playlist',
  album: 'Album',
  artist: 'Künstler',
  page: 'Seite',
};
