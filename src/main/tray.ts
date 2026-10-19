import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron';
import { allPresets, reduceEq } from '@shared/eq';
import { trackLabel } from '@shared/player';
import { THEMES } from '@shared/themes';
import type { PlayerCommand, Settings } from '@shared/types';
import { getPlayerState, onPlayerState } from './player';
import { getSettings, onSettingsChanged, updateSettings } from './settings';
import { hexToRgb, logoPng } from './tray-icon';

export interface TrayActions {
  showWindow(): void;
  command(command: PlayerCommand): void;
  toggleMini(): void;
  isMiniOpen(): boolean;
  onMiniChanged(listener: () => void): void;
}

let tray: Tray | null = null;

function icon(settings: Settings): NativeImage {
  const image = nativeImage.createEmpty();
  if (process.platform === 'darwin') {
    // Menu bar: template image (black + alpha), macOS adapts it to light/dark.
    image.addRepresentation({ scaleFactor: 1, buffer: logoPng(16, [0, 0, 0]) });
    image.addRepresentation({ scaleFactor: 2, buffer: logoPng(32, [0, 0, 0]) });
    image.setTemplateImage(true);
  } else {
    const color = hexToRgb(THEMES[settings.theme].tokens.accent);
    for (const scaleFactor of [1, 1.25, 1.5, 2]) {
      const size = Math.round(16 * scaleFactor);
      image.addRepresentation({ scaleFactor, buffer: logoPng(size, color) });
    }
  }
  return image;
}

function buildMenu(actions: TrayActions): Menu {
  const state = getPlayerState();
  const { eq } = getSettings();
  const hasTrack = !!state;
  return Menu.buildFromTemplate([
    { label: trackLabel(state, 50), enabled: false },
    { type: 'separator' },
    {
      label: state?.isPlaying ? 'Pause' : 'Abspielen',
      enabled: hasTrack,
      click: () => actions.command({ type: 'playPause' }),
    },
    { label: 'Weiter', enabled: hasTrack, click: () => actions.command({ type: 'next' }) },
    { label: 'Zurück', enabled: hasTrack, click: () => actions.command({ type: 'previous' }) },
    { type: 'separator' },
    {
      label: 'EQ-Preset',
      submenu: [
        {
          label: 'Equalizer an',
          type: 'checkbox',
          checked: eq.enabled,
          click: (item) =>
            updateSettings((s) => {
              s.eq = reduceEq(s.eq, { type: 'setEnabled', enabled: item.checked });
            }),
        },
        { type: 'separator' },
        ...allPresets(eq.customPresets).map((preset) => ({
          label: preset.name,
          type: 'radio' as const,
          checked: eq.preset === preset.name,
          click: () =>
            updateSettings((s) => {
              s.eq = reduceEq(s.eq, { type: 'applyPreset', name: preset.name });
            }),
        })),
      ],
    },
    { type: 'separator' },
    {
      label: 'Mini-Player',
      type: 'checkbox',
      checked: actions.isMiniOpen(),
      click: () => actions.toggleMini(),
    },
    { label: 'Fenster anzeigen', click: () => actions.showWindow() },
    { label: 'Beenden', click: () => app.quit() },
  ]);
}

/** Only rebuild the menu when something visible in it changed. */
function menuKey(miniOpen: boolean): string {
  const state = getPlayerState();
  const { eq } = getSettings();
  return JSON.stringify([
    miniOpen,
    state?.title,
    state?.artist,
    state?.isPlaying,
    eq.enabled,
    eq.preset,
    eq.customPresets.map((p) => p.name),
  ]);
}

export function createTray(actions: TrayActions): Tray {
  const instance = new Tray(icon(getSettings()));
  tray = instance;
  let key = '';
  const refresh = () => {
    const next = menuKey(actions.isMiniOpen());
    if (next === key) return;
    key = next;
    instance.setContextMenu(buildMenu(actions));
    instance.setToolTip(`Pegel – ${trackLabel(getPlayerState())}`);
  };
  refresh();

  // Windows/Linux: left click shows the window, right click opens the menu.
  // macOS: any click opens the menu (menu bar convention).
  if (process.platform !== 'darwin') instance.on('click', () => actions.showWindow());

  onPlayerState(refresh);
  actions.onMiniChanged(refresh);
  let theme = getSettings().theme;
  onSettingsChanged((settings) => {
    refresh();
    if (settings.theme !== theme) {
      theme = settings.theme;
      instance.setImage(icon(settings));
    }
  });
  return instance;
}

/** One-time hint (Windows) that closing keeps Pegel running in the tray. */
export function showBackgroundHint(): void {
  if (!tray || process.platform !== 'win32' || getSettings().trayHintShown) return;
  tray.displayBalloon({
    iconType: 'info',
    title: 'Pegel läuft im Hintergrund weiter',
    content:
      'Die Musik spielt weiter. Über das Pegel-Symbol im Infobereich holst du das Fenster zurück oder beendest Pegel.',
  });
  updateSettings((s) => {
    s.trayHintShown = true;
  });
}
