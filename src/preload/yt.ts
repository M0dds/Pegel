// Preload for the music.youtube.com view. Nothing is exposed to the page;
// the EQ runs here and talks only to the main process.
import { ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MainToYtChannels, YtToMainChannels } from '@shared/ipc';
import { watchLinkDrops } from '@shared/link-drop';
import { EqEngine } from '../yt/audio/eq';
import { SpectrumFeed, Visualizer } from '../yt/audio/visualizer';
import { YtDecor } from '../yt/decor/effects';
import { PartyEngine } from '../yt/party/sync';
import { watchScrollbar } from '../yt/decor/scrollbar';
import { PlaylistDrag } from '../yt/dnd/drag';
import {
  NEEDS_REPORT,
  navigateToTrack,
  runCommand,
  trackUrl,
  startBridge,
  startPageWatcher,
  watchLoudness,
} from '../yt/player/bridge';

function send<C extends keyof YtToMainChannels>(channel: C, payload: YtToMainChannels[C]): void {
  ipcRenderer.send(channel, payload);
}

// The view also shows Google's login and consent pages; they get nothing.
if (location.hostname === 'music.youtube.com') {
  const eq = new EqEngine();
  eq.start();
  watchLoudness((loudnessDb) => eq.setLoudness(loudnessDb));
  ipcRenderer.on(
    'yt:eq-apply' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, settings: MainToYtChannels['yt:eq-apply']) => eq.apply(settings),
  );
  const decor = new YtDecor(new Visualizer(() => eq.getAnalyser()));
  ipcRenderer.on(
    'yt:effects' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, effects: MainToYtChannels['yt:effects']) => decor.apply(effects),
  );
  const feed = new SpectrumFeed(
    () => eq.getAnalyser(),
    (levels) => send('yt:spectrum', levels),
  );
  ipcRenderer.on(
    'yt:spectrum-feed' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, bars: MainToYtChannels['yt:spectrum-feed']) => feed.setBars(bars),
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
  const party = new PartyEngine(
    () => eq.outputLatencyMs(),
    (report) => send('yt:party-report', report),
  );
  ipcRenderer.on(
    'yt:party' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, control: MainToYtChannels['yt:party']) => party.setControl(control),
  );
  ipcRenderer.on('yt:party-resume' satisfies keyof MainToYtChannels, () => party.resume());
  ipcRenderer.on(
    'yt:play-track' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, track: MainToYtChannels['yt:play-track']) => {
      if (!navigateToTrack(track.videoId, track.playlistId)) {
        location.assign(trackUrl(track.videoId, track.playlistId));
      }
    },
  );
  ipcRenderer.send('yt:ready' satisfies keyof YtToMainChannels);
  startPageWatcher((page) => send('yt:page-playlist', page));
  watchLinkDrops(window, (url) => send('yt:drop-link', url));
  watchScrollbar();
  const playlistDrag = new PlaylistDrag((report) => send('yt:playlist-drop', report));
  playlistDrag.start();
  ipcRenderer.on(
    'yt:playlist-add-anyway' satisfies keyof MainToYtChannels,
    (_event: IpcRendererEvent, track: MainToYtChannels['yt:playlist-add-anyway']) =>
      void playlistDrag.addAnyway(track),
  );
  // Development only, reachable from DevTools in the preload's isolated world (not the page).
  if (import.meta.env.DEV)
    Object.assign(globalThis, { pegelEq: eq, pegelDecor: decor, pegelParty: party });
}
