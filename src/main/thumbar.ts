import { type BrowserWindow, nativeImage, type NativeImage, nativeTheme } from 'electron';
import type { PlayerCommand } from '@shared/types';
import { type MediaGlyph, mediaGlyphPng } from './media-icons';
import { getPlayerState, onPlayerState } from './player';

/** Logical icon size of the taskbar preview buttons; 1.5× and 2× for high DPI. */
const ICON_SIZE = 16;
const SCALES = [1, 1.5, 2] as const;

/**
 * Windows: Zurück, Abspielen/Pause and Weiter below the window preview when
 * hovering over Pegel in the taskbar (thumbnail toolbar), like Spotify.
 * macOS has no such thing; there the system media controls ("Jetzt läuft")
 * and the tray menu cover it.
 */
export function setupThumbar(
  window: BrowserWindow,
  command: (command: PlayerCommand) => void,
): () => void {
  if (process.platform !== 'win32') return () => undefined;

  const images = new Map<string, NativeImage>();
  /** The preview follows the taskbar's light or dark mode. */
  const image = (glyph: MediaGlyph, dark: boolean): NativeImage => {
    const key = `${glyph}-${dark}`;
    let img = images.get(key);
    if (!img) {
      const color = dark ? ([255, 255, 255] as const) : ([0, 0, 0] as const);
      img = nativeImage.createEmpty();
      for (const scaleFactor of SCALES) {
        img.addRepresentation({
          scaleFactor,
          buffer: mediaGlyphPng(glyph, Math.round(ICON_SIZE * scaleFactor), color),
        });
      }
      images.set(key, img);
    }
    return img;
  };

  let applied = '';
  const apply = (force = false) => {
    if (window.isDestroyed()) return;
    const state = getPlayerState();
    const playing = !!state?.isPlaying;
    const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    // Player updates arrive every second; only rebuild when something visible changes.
    const key = JSON.stringify([!!state, playing, dark]);
    if (!force && key === applied) return;
    const flags: ('enabled' | 'disabled')[] = state ? ['enabled'] : ['disabled'];
    const ok = window.setThumbarButtons([
      {
        tooltip: 'Zurück',
        icon: image('previous', dark),
        flags,
        click: () => command({ type: 'previous' }),
      },
      {
        tooltip: playing ? 'Pause' : 'Abspielen',
        icon: image(playing ? 'pause' : 'play', dark),
        flags,
        click: () => command({ type: 'playPause' }),
      },
      {
        tooltip: 'Weiter',
        icon: image('next', dark),
        flags,
        click: () => command({ type: 'next' }),
      },
    ]);
    // Before the window was shown the call can fail; 'show' tries again.
    applied = ok ? key : '';
  };

  const onTheme = () => apply();
  const onShow = () => apply(true);
  apply();
  const stopPlayer = onPlayerState(() => apply());
  nativeTheme.on('updated', onTheme);
  // Windows drops the buttons while the window is hidden (tray), so set them again.
  window.on('show', onShow);
  return () => {
    stopPlayer();
    nativeTheme.off('updated', onTheme);
    if (!window.isDestroyed()) window.off('show', onShow);
  };
}
