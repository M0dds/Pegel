import { contextBridge } from 'electron';
import {
  buildAddToPlaylistQuery,
  buildAddVideoRequest,
  parseAddToPlaylist,
  parseAddVideoResult,
  readSapisid,
  sapisidHash,
  YT_ORIGIN,
  type AddResult,
  type InnertubeConfig,
  type InnertubeRequest,
  type PlaylistOption,
} from './innertube';

/**
 * Talks to YT Music's internal API from the page's main world, with the
 * page's own login: `ytcfg` lives only there, and the request goes out like
 * one of YT's own. Pegel keeps nothing of it.
 */

/** Signed in to YT Music (the login cookie YT's own scripts read). */
export function isSignedIn(): boolean {
  return readSapisid(document.cookie) !== null;
}

function readConfig(): InnertubeConfig | null {
  try {
    return contextBridge.executeInMainWorld({
      func: () => {
        const cfg = (window as unknown as { ytcfg?: { get?: (key: string) => unknown } }).ytcfg;
        const get = (key: string) => cfg?.get?.(key);
        const context = get('INNERTUBE_CONTEXT');
        if (!context || typeof context !== 'object') return null;
        const str = (v: unknown) =>
          typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
        // Plain JSON copy: the context object is YT's own and must not be handed out live.
        return {
          context: JSON.parse(JSON.stringify(context)) as Record<string, unknown>,
          sessionIndex: str(get('SESSION_INDEX')),
          pageId: str(get('DELEGATED_SESSION_ID')),
          visitorData: str(get('VISITOR_DATA')),
          clientName: str(get('INNERTUBE_CONTEXT_CLIENT_NAME')),
          clientVersion: str(get('INNERTUBE_CLIENT_VERSION')),
        };
      },
      args: [],
    }) as InnertubeConfig | null;
  } catch {
    return null;
  }
}

async function send(request: InnertubeRequest): Promise<{ status: number; json: unknown }> {
  // The main world's fetch, so the request carries the page's cookies and origin.
  const result = (await contextBridge.executeInMainWorld({
    func: (url: string, headers: Record<string, string>, body: string) =>
      fetch(url, { method: 'POST', headers, body, credentials: 'include' }).then(async (r) => ({
        status: r.status,
        text: await r.text(),
      })),
    args: [request.url, request.headers, request.body],
  })) as { status: number; text: string };
  let json: unknown = null;
  try {
    json = JSON.parse(result.text);
  } catch {
    // Not JSON (an error page): stays null and counts as an error.
  }
  return { status: result.status, json };
}

async function prepare(): Promise<{ config: InnertubeConfig; authorization: string } | null> {
  const sapisid = readSapisid(document.cookie);
  const config = readConfig();
  if (!sapisid || !config) return null;
  return { config, authorization: await sapisidHash(sapisid, YT_ORIGIN, Date.now()) };
}

/** The user's playlists that can take this track (null: YT could not be asked). */
export async function queryPlaylists(videoId: string): Promise<PlaylistOption[] | null> {
  try {
    const auth = await prepare();
    if (!auth) return null;
    const { status, json } = await send(
      buildAddToPlaylistQuery(auth.config, auth.authorization, videoId),
    );
    return status >= 200 && status < 300 ? parseAddToPlaylist(json) : null;
  } catch (err) {
    console.warn('[pegel-dnd] playlist query failed', err);
    return null;
  }
}

/**
 * Adds the track; YT itself reports duplicates. `allowDuplicate` only when the
 * user asked for it ("Trotzdem hinzufügen"). Never removes anything.
 */
export async function addToPlaylist(
  playlistId: string,
  videoId: string,
  allowDuplicate = false,
): Promise<AddResult> {
  try {
    const auth = await prepare();
    if (!auth) return 'error';
    const { status, json } = await send(
      buildAddVideoRequest(auth.config, auth.authorization, playlistId, videoId, allowDuplicate),
    );
    const result = parseAddVideoResult(status, json);
    if (result === 'error') console.warn('[pegel-dnd] add failed', status, json);
    return result;
  } catch (err) {
    console.warn('[pegel-dnd] add failed', err);
    return 'error';
  }
}

/** Marks the row for the main-world lookup (elements cannot cross worlds). */
const MARK_ATTR = 'data-pegel-dnd-mark';

export interface RowData {
  videoId?: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
}

/**
 * Track facts from YT's own data behind a row (Polymer's `data`), for rows
 * without a track link: queue items carry `videoId` directly.
 */
export function readRowData(row: Element): RowData | null {
  row.setAttribute(MARK_ATTR, '');
  try {
    return contextBridge.executeInMainWorld({
      func: (attr: string) => {
        type Text = { runs?: { text?: string }[] };
        const el = document.querySelector(`[${attr}]`) as unknown as { data?: unknown } | null;
        const d = el?.data as
          | {
              videoId?: unknown;
              title?: Text;
              shortBylineText?: Text;
              thumbnail?: { thumbnails?: { url?: string }[] };
              playlistItemData?: { videoId?: unknown };
            }
          | undefined;
        if (!d) return null;
        const text = (t?: Text) => t?.runs?.map((r) => r.text ?? '').join('') || undefined;
        const thumbs = d.thumbnail?.thumbnails ?? [];
        const videoId = typeof d.videoId === 'string' ? d.videoId : d.playlistItemData?.videoId;
        return {
          videoId: typeof videoId === 'string' ? videoId : undefined,
          title: text(d.title),
          artist: text(d.shortBylineText),
          thumbnail: thumbs[thumbs.length - 1]?.url,
        };
      },
      args: [MARK_ATTR],
    }) as RowData | null;
  } catch {
    return null;
  } finally {
    row.removeAttribute(MARK_ATTR);
  }
}

/**
 * Browse id behind every element matching `selector` (sidebar entries have
 * no href; YT navigates from their data). Same order as querySelectorAll.
 */
export function readBrowseIds(selector: string): (string | null)[] {
  try {
    return contextBridge.executeInMainWorld({
      func: (sel: string) =>
        [...document.querySelectorAll(sel)].map((el) => {
          const d = (el as unknown as { data?: unknown }).data as
            { navigationEndpoint?: { browseEndpoint?: { browseId?: unknown } } } | undefined;
          const id = d?.navigationEndpoint?.browseEndpoint?.browseId;
          return typeof id === 'string' ? id : null;
        }),
      args: [selector],
    }) as (string | null)[];
  } catch {
    return [];
  }
}
