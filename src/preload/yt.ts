// Preload for the music.youtube.com view. Nothing is exposed to the page;
// the EQ runs here and talks only to the main process.
import { ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MainToYtChannels, YtToMainChannels } from '@shared/ipc';
import { EqEngine } from '../yt/audio/eq';
import { NEEDS_REPORT, runCommand, startBridge } from '../yt/player/bridge';

function send<C extends keyof YtToMainChannels>(channel: C, payload: YtToMainChannels[C]): void {
  ipcRenderer.send(channel, payload);
}

// The view also shows Google's login and consent pages; they get nothing.
if (location.hostname === 'music.youtube.com') {
  const eq = new EqEngine();
  eq.start();
  ipcRenderer.on(
    'yt:eq-apply' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, settings: MainToYtChannels['yt:eq-apply']) => eq.apply(settings),
  );
  const bridge = startBridge(
    (state) => send('yt:player-state', state),
    (issues) => send('yt:selector-issues', issues),
  );
  ipcRenderer.on(
    'yt:player-command' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, command: MainToYtChannels['yt:player-command']) => {
      runCommand(command);
      // Volume and like change without a media event; report them right away.
      if (NEEDS_REPORT.has(command.type)) setTimeout(() => bridge.report(true), 150);
    },
  );
  ipcRenderer.send('yt:ready' satisfies keyof YtToMainChannels);
  // Development only, reachable from DevTools in the preload's isolated world (not the page).
  if (import.meta.env.DEV) Object.assign(globalThis, { pegelEq: eq });
}
