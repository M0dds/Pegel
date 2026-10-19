import { applyPlaylistContext } from '@shared/eq';
import { onPlayerState } from './player';
import { updateSettings } from './settings';

/**
 * Switches the EQ when the playing playlist changes (see applyPlaylistContext).
 * A missing state (page reload, offline) is not treated as leaving the playlist.
 */
export function startPlaylistEq(): void {
  let current: string | null | undefined;
  onPlayerState((state) => {
    if (!state) return;
    const playlistId = state.playlistId ?? null;
    if (playlistId === current) return;
    current = playlistId;
    updateSettings((s) => {
      s.eq = applyPlaylistContext(s.eq, playlistId);
    });
  });
}
