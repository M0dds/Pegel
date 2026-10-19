import { applyPlaylistContext } from '@shared/eq';
import { getPlayerState, onPlayerState } from './player';
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

/**
 * After an assignment changed: applies it if that playlist is playing right
 * now (assigning from a playlist page that is not playing changes nothing).
 */
export function reapplyPlaylistContext(): void {
  const state = getPlayerState();
  if (!state) return;
  updateSettings((s) => {
    s.eq = applyPlaylistContext(s.eq, state.playlistId ?? null);
  });
}
