import { playlistPreset } from '@shared/eq';
import type { EqSettings } from '@shared/types';
import { PlaylistIcon } from '../icons';
import { Select } from '../Select';
import { presetGroups } from './preset-options';

const NONE = '__none__';

interface Props {
  eq: EqSettings;
  playlistId: string;
  /** Name from YT's queue header; may be missing until the player page has loaded it. */
  title: string | undefined;
}

/** "This playlist always plays with preset X" while a playlist is playing. */
export function PlaylistPresetRow({ eq, playlistId, title }: Props) {
  const assigned = playlistPreset(eq, playlistId);
  const stored = eq.playlistPresets.find((p) => p.playlistId === playlistId);
  const name = title ?? stored?.title ?? 'Aktuelle Playlist';

  return (
    <div className="playlist-preset">
      <div className="field-label">Preset für diese Playlist</div>
      <div className="playlist-name" title={name}>
        <PlaylistIcon />
        <span>{name}</span>
      </div>
      <Select
        aria-label={`Preset für ${name}`}
        value={assigned ?? NONE}
        groups={presetGroups(eq, [{ value: NONE, label: 'Kein eigenes Preset' }])}
        onChange={(value) =>
          window.pegel.eqAction({
            type: 'setPlaylistPreset',
            playlistId,
            title: name,
            preset: value === NONE ? null : value,
          })
        }
      />
      <small className="hint">
        {assigned
          ? 'Wird automatisch aktiv, wenn diese Playlist läuft.'
          : 'Optional: wird automatisch aktiv, wenn diese Playlist läuft.'}
      </small>
    </div>
  );
}
