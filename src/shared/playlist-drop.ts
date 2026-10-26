/**
 * Outcome of dragging a track onto a playlist in YT's sidebar, as the YT view
 * reports it. `unavailable`: dropped while no playlist could be seen (sidebar
 * collapsed or not signed in).
 */
export interface PlaylistDropReport {
  result: 'added' | 'duplicate' | 'error' | 'unavailable';
  /** Name of the playlist (not for `unavailable`). */
  playlist?: string;
  /** With `duplicate`: what to add anyway if the user wants it twice. */
  track?: PlaylistTrack;
}

/** A track and the playlist it should go into. */
export interface PlaylistTrack {
  playlistId: string;
  videoId: string;
}

/** Validates a playlist/track pair (from the YT view or the UI). */
export function toPlaylistTrack(raw: unknown): PlaylistTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const { playlistId, videoId } = raw as { playlistId?: unknown; videoId?: unknown };
  if (typeof playlistId !== 'string' || !/^[A-Za-z0-9_-]{2,64}$/.test(playlistId)) return null;
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return { playlistId, videoId };
}

const RESULTS = new Set<PlaylistDropReport['result']>([
  'added',
  'duplicate',
  'error',
  'unavailable',
]);

/** Longest playlist name shown in the title bar hint. */
const MAX_NAME = 32;

/** Validates a report from the YT view (it is untrusted page context). */
export function toPlaylistDropReport(raw: unknown): PlaylistDropReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { result?: unknown; playlist?: unknown; track?: unknown };
  if (!RESULTS.has(r.result as PlaylistDropReport['result'])) return null;
  const report: PlaylistDropReport = { result: r.result as PlaylistDropReport['result'] };
  if (typeof r.playlist === 'string' && r.playlist.trim()) {
    report.playlist = r.playlist.trim().slice(0, 200);
  }
  const track = report.result === 'duplicate' ? toPlaylistTrack(r.track) : null;
  if (track) report.track = track;
  return report;
}

function quoted(name: string | undefined): string {
  if (!name) return 'die Playlist';
  const short = name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name;
  return `„${short}“`;
}

/** Text of the title bar hint after a drop. */
export function playlistDropText(report: PlaylistDropReport): string {
  switch (report.result) {
    case 'added':
      return `Zu ${quoted(report.playlist)} hinzugefügt`;
    case 'duplicate':
      return report.playlist ? `Schon in ${quoted(report.playlist)}` : 'Schon in der Playlist';
    case 'error':
      return `Konnte nicht zu ${quoted(report.playlist)} hinzugefügt werden`;
    case 'unavailable':
      return 'Zum Ablegen die Playlists in der Seitenleiste einblenden';
  }
}
