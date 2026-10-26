/**
 * YT Music's internal API ("InnerTube"), as the page itself uses it for
 * "Save to playlist". Only the pure parts live here: building requests and
 * reading answers. The requests are sent from the page's main world with the
 * page's own login (src/yt/dnd/api.ts); nothing is stored.
 */

export const YT_ORIGIN = 'https://music.youtube.com';

/** Values from the page's `ytcfg` that every InnerTube request needs. */
export interface InnertubeConfig {
  /** `INNERTUBE_CONTEXT`: client name, version, language, … (passed through as is). */
  context: Record<string, unknown>;
  /** `SESSION_INDEX`: which of several signed-in Google accounts. */
  sessionIndex?: string;
  /** `DELEGATED_SESSION_ID`: set for brand accounts. */
  pageId?: string;
  visitorData?: string;
  clientName?: string;
  clientVersion?: string;
}

export interface InnertubeRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * The page's login proof: `SAPISIDHASH <time>_<sha1("<time> <SAPISID> <origin>")>`,
 * computed per request from the cookie, the same way YT's own scripts do.
 */
export async function sapisidHash(sapisid: string, origin: string, nowMs: number): Promise<string> {
  const time = Math.floor(nowMs / 1000);
  const data = new TextEncoder().encode(`${time} ${sapisid} ${origin}`);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${time}_${hex}`;
}

/** SAPISID from `document.cookie` (YT's scripts read it the same way). */
export function readSapisid(cookie: string): string | null {
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'SAPISID' || name === '__Secure-3PAPISID') {
      const v = value.join('=');
      if (v) return v;
    }
  }
  return null;
}

function buildRequest(
  endpoint: string,
  config: InnertubeConfig,
  authorization: string,
  payload: Record<string, unknown>,
): InnertubeRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authorization,
    'X-Origin': YT_ORIGIN,
    'X-Goog-AuthUser': config.sessionIndex ?? '0',
  };
  if (config.pageId) headers['X-Goog-PageId'] = config.pageId;
  if (config.visitorData) headers['X-Goog-Visitor-Id'] = config.visitorData;
  if (config.clientName) headers['X-Youtube-Client-Name'] = config.clientName;
  if (config.clientVersion) headers['X-Youtube-Client-Version'] = config.clientVersion;
  return {
    url: `${YT_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`,
    headers,
    body: JSON.stringify({ context: config.context, ...payload }),
  };
}

/** Which of the user's playlists can take the track, and which already have it. */
export function buildAddToPlaylistQuery(
  config: InnertubeConfig,
  authorization: string,
  videoId: string,
): InnertubeRequest {
  return buildRequest('playlist/get_add_to_playlist', config, authorization, {
    videoIds: [videoId],
    excludeWatchLater: true,
  });
}

/**
 * Adds one track to a playlist, exactly like YT's own "Save to playlist".
 * Only ever ACTION_ADD_VIDEO. `DEDUPE_OPTION_CHECK` makes YT refuse a track
 * that is already in the playlist and say so; `allowDuplicate` is YT's own
 * "Trotzdem hinzufügen" (`DEDUPE_OPTION_SKIP`).
 */
export function buildAddVideoRequest(
  config: InnertubeConfig,
  authorization: string,
  playlistId: string,
  videoId: string,
  allowDuplicate = false,
): InnertubeRequest {
  const dedupeOption = allowDuplicate ? 'DEDUPE_OPTION_SKIP' : 'DEDUPE_OPTION_CHECK';
  return buildRequest('browse/edit_playlist', config, authorization, {
    playlistId,
    actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId, dedupeOption }],
  });
}

/** Text of a YT text object (`{ simpleText }` or `{ runs: [{ text }] }`). */
function ytText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { simpleText?: unknown; runs?: unknown };
  if (typeof v.simpleText === 'string') return v.simpleText;
  if (Array.isArray(v.runs)) {
    const text = v.runs.map((r: unknown) => (r as { text?: unknown })?.text ?? '').join('');
    return text || undefined;
  }
  return undefined;
}

/** Every object found under `key` anywhere in a YT response. */
function collect(root: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (!root || typeof root !== 'object' || depth > 30) return out;
  if (Array.isArray(root)) {
    for (const item of root) collect(item, key, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(root)) {
    if (k === key) out.push(v);
    else collect(v, key, out, depth + 1);
  }
  return out;
}

export interface PlaylistOption {
  playlistId: string;
  title: string;
  /** The track is already in this playlist. */
  contains: boolean;
}

/** The playlists YT offers in "Save to playlist" for the track. */
export function parseAddToPlaylist(response: unknown): PlaylistOption[] {
  const options: PlaylistOption[] = [];
  for (const raw of collect(response, 'playlistAddToOptionRenderer')) {
    const r = raw as { playlistId?: unknown; title?: unknown; containsSelectedVideos?: unknown };
    if (typeof r.playlistId !== 'string') continue;
    options.push({
      playlistId: r.playlistId,
      title: ytText(r.title) ?? '',
      contains: r.containsSelectedVideos === 'ALL',
    });
  }
  return options;
}

export type AddResult = 'added' | 'duplicate' | 'error';

/**
 * Outcome of an add request. Success only when YT says so. A track that is
 * already in the playlist is refused (`STATUS_FAILED`) together with YT's
 * offer to add it anyway: the same add again with `DEDUPE_OPTION_SKIP`
 * (seen October 2026). Anything else counts as an error.
 */
export function parseAddVideoResult(httpStatus: number, response: unknown): AddResult {
  if (httpStatus < 200 || httpStatus >= 300 || !response || typeof response !== 'object') {
    return 'error';
  }
  const status = (response as { status?: unknown }).status;
  if (status === 'STATUS_SUCCEEDED') return 'added';
  const offersDuplicate = collect(response, 'playlistEditEndpoint').some((endpoint) =>
    collect(endpoint, 'actions').some(
      (actions) =>
        Array.isArray(actions) &&
        actions.some(
          (a: { action?: unknown; dedupeOption?: unknown } | null) =>
            a?.action === 'ACTION_ADD_VIDEO' && a.dedupeOption === 'DEDUPE_OPTION_SKIP',
        ),
    ),
  );
  return status === 'STATUS_FAILED' && offersDuplicate ? 'duplicate' : 'error';
}
