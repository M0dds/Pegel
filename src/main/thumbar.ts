import { type BrowserWindow, nativeImage, type NativeImage, nativeTheme } from 'electron';
import type { PlayerCommand } from '@shared/types';
import { type MediaGlyph, mediaGlyphPng } from './media-icons';
import { getPlayerState, onPlayerState } from './player';

/** Logical icon size of the taskbar preview buttons; 1.5× and 2× for high DPI. */
const ICON_SIZE = 16;
const SCALES = [1, 1.5, 2] as const;
/** After 'show': set the buttons, and once more a little later in case Windows was slow. */
const SHOW_DELAYS_MS = [400, 2000] as const;

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
  /** True once the window was shown and Windows had time to create its taskbar button. */
  let ready = false;
  const apply = (force = false) => {
    if (window.isDestroyed() || !ready || !window.isVisible()) return;
    const state = getPlayerState();
    const playing = !!state?.isPlaying;
    const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
    // Player updates arrive every second; only rebuild when something visible changes.
    const key = JSON.stringify([!!state, playing, dark]);
    if (!force && key === applied) return;
    // Active buttons get no flags: with 'enabled', Electron rejects the whole
    // toolbar (setThumbarButtons returns false), so it vanished during playback.
    const flags: 'disabled'[] | undefined = state ? undefined : ['disabled'];
    const ok = window.setThumbarButtons([
      {
        tooltip: 'Zurück',
        icon: image('previous', dark),
        ...(flags && { flags }),
        click: () => command({ type: 'previous' }),
      },
      {
        tooltip: playing ? 'Pause' : 'Abspielen',
        icon: image(playing ? 'pause' : 'play', dark),
        ...(flags && { flags }),
        click: () => command({ type: 'playPause' }),
      },
      {
        tooltip: 'Weiter',
        icon: image('next', dark),
        ...(flags && { flags }),
        click: () => command({ type: 'next' }),
      },
    ]);
    applied = ok ? key : '';
  };

  // Buttons set before the window has its taskbar button never show up (and
  // later calls only update them), so wait until it is shown, plus a moment
  // for Windows to create the button. After hiding to the tray the button is
  // created anew, so the same again on every 'show'.
  const timers = new Set<NodeJS.Timeout>();
  const onShow = () => {
    for (const delay of SHOW_DELAYS_MS) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        ready = true;
        apply(true);
      }, delay);
      timers.add(timer);
    }
  };
  const onTheme = () => apply();
  if (window.isVisible()) onShow();
  const stopPlayer = onPlayerState(() => apply());
  nativeTheme.on('updated', onTheme);
  window.on('show', onShow);
  return () => {
    stopPlayer();
    for (const timer of timers) clearTimeout(timer);
    nativeTheme.off('updated', onTheme);
    if (!window.isDestroyed()) window.off('show', onShow);
  };
}
