import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type WheelEvent,
} from 'react';
import { isDirty } from '@shared/eq';
import { barCount, BarMeter, drawBars, fitCanvas } from '@shared/spectrum';
import { THEMES } from '@shared/themes';
import type { PartyView } from '@shared/social';
import type { PlayerCommand, PlayerState, Settings } from '@shared/types';
import {
  ExpandIcon,
  LikeIcon,
  NextIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PreviousIcon,
  VolumeIcon,
} from '../components/icons';
import { applyTheme } from '../styles/theme';

const command = (c: PlayerCommand) => window.pegel.playerCommand(c);
const VOLUME_STEP = 0.05;

/**
 * Position between the 1/s state updates, interpolated while playing so the
 * progress bar moves smoothly.
 */
function usePosition(state: PlayerState | null): number {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!state) return;
    const receivedAt = performance.now();
    const max = state.durationSec || Infinity;
    let frame = 0;
    const tick = () => {
      const elapsed = state.isPlaying ? (performance.now() - receivedAt) / 1000 : 0;
      setPosition(Math.min(max, state.positionSec + elapsed));
      if (state.isPlaying) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  return state ? position : 0;
}

const BAR_WIDTH = 7;
const BAR_GAP = 3;

/**
 * Frequency bars behind the controls, from the window's bottom edge up to just
 * below the cover. The levels come from the YT view (via the main process);
 * the bars fall and the caps sink here, so it stays smooth between messages.
 */
function MiniVisualizer({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const meter = new BarMeter();
    let targets: number[] | null = null;
    let frame = 0;
    let last = 0;
    let bars = 0;

    const draw = (time: number) => {
      frame = 0;
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 1 / 60;
      last = time;
      const dpr = window.devicePixelRatio || 1;
      if (!fitCanvas(canvas, dpr)) return;
      const count = barCount(canvas.clientWidth, BAR_WIDTH, BAR_GAP);
      if (count !== bars) {
        bars = count;
        window.pegel.setSpectrumBars(count);
      }
      meter.update(targets, count, dt);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBars(ctx, canvas.clientWidth, canvas.clientHeight, meter, {
        barWidth: BAR_WIDTH,
        gap: BAR_GAP,
        usable: 0.94,
        color,
      });
      // Keep animating while something moves; a new message starts it again.
      if (targets || !meter.isIdle()) frame = requestAnimationFrame(draw);
      else last = 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const off = window.pegel.onSpectrum((levels) => {
      targets = levels.length ? levels.map((v) => v / 255) : null;
      wake();
    });
    wake();
    return () => {
      off();
      if (frame) cancelAnimationFrame(frame);
      window.pegel.setSpectrumBars(0);
    };
  }, [color]);

  return <canvas ref={canvasRef} className="mini-visualizer" aria-hidden="true" />;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Mini player window (route /mini). Data only from the main process. */
export function MiniPlayer() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [party, setParty] = useState<PartyView | null>(null);

  useEffect(() => {
    void window.pegel.getSocialState().then((s) => setParty(s.party));
    const offSocial = window.pegel.onSocialState((s) => setParty(s.party));
    void window.pegel.getPlayerState().then(setState);
    void window.pegel.getSettings().then(setSettings);
    const offState = window.pegel.onPlayerState(setState);
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    return () => {
      offSocial();
      offState();
      offSettings();
    };
  }, []);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const position = usePosition(state);
  const progress = state?.durationSec ? Math.min(1, position / state.durationSec) : 0;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;
  const has = !!state;
  const pinned = settings?.mini.alwaysOnTop ?? false;
  const eq = settings?.eq;
  const eqLabel = !eq ? '' : eq.enabled ? `EQ · ${eq.preset}${isDirty(eq) ? ' •' : ''}` : 'EQ aus';
  // In a party guests skip and seek only with "Alle dürfen steuern"; pausing always works.
  const guest = party?.role === 'guest' && !party.canControl;
  const hostName = party?.members.find((m) => m.isHost)?.name ?? 'der Host';
  const steerTitle = `Steuert ${hostName}`;

  const seek = (e: MouseEvent<HTMLDivElement>) => {
    if (!state?.durationSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    command({ type: 'seek', sec: Math.round(ratio * state.durationSec) });
  };

  const wheelVolume = (e: WheelEvent) => {
    if (!has) return;
    const next = Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)));
    command({ type: 'setVolume', volume: Math.round(next * 100) / 100 });
  };

  return (
    <div className="mini">
      <div
        className={`mini-progress${has && !guest ? '' : ' disabled'}`}
        role="slider"
        aria-label="Fortschritt"
        aria-valuemin={0}
        aria-valuemax={state?.durationSec ?? 0}
        aria-valuenow={Math.floor(position)}
        aria-valuetext={state ? `${formatTime(position)} von ${formatTime(state.durationSec)}` : ''}
        title={state ? `${formatTime(position)} / ${formatTime(state.durationSec)}` : undefined}
        onClick={guest ? undefined : seek}
      >
        <i style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="mini-top">
        <div className="mini-cover">
          {state?.artworkUrl && <img src={state.artworkUrl} alt="" draggable={false} />}
        </div>
        <div className="mini-meta">
          <b title={state?.title}>{state?.title ?? 'Nichts wird abgespielt'}</b>
          <small title={state?.artist}>
            {state ? state.artist : 'Starte Musik im Hauptfenster'}
          </small>
          {(eqLabel || party) && (
            <div className="mini-badges">
              {party && <span className="eq-badge">Party · {party.members.length}</span>}
              {eqLabel && <span className={`eq-badge${eq?.enabled ? '' : ' off'}`}>{eqLabel}</span>}
            </div>
          )}
        </div>
        <div className="mini-tools">
          <button
            className="icon-btn"
            aria-pressed={pinned}
            title={pinned ? 'Nicht mehr im Vordergrund halten' : 'Immer im Vordergrund'}
            aria-label="Immer im Vordergrund"
            onClick={() => window.pegel.patchSettings({ mini: { alwaysOnTop: !pinned } })}
          >
            <PinIcon />
          </button>
          <button
            className="icon-btn"
            title="Zum Hauptfenster"
            aria-label="Zum Hauptfenster"
            onClick={() => window.pegel.closeMini()}
          >
            <ExpandIcon />
          </button>
        </div>
      </div>

      <div className="mini-ctrl">
        {settings?.mini.visualizer && (
          <MiniVisualizer color={THEMES[settings.theme].tokens.accent} />
        )}
        <button
          className="icon-btn"
          disabled={!has}
          aria-pressed={state?.liked ?? false}
          title={state?.liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
          aria-label="Gefällt mir"
          onClick={() => command({ type: 'toggleLike' })}
        >
          <LikeIcon active={state?.liked ?? false} />
        </button>
        <button
          className="icon-btn"
          disabled={!has || party?.role === 'guest'}
          title={
            party?.role === 'guest'
              ? guest
                ? steerTitle
                : 'Zurück gibt es in der Party nicht'
              : 'Zurück'
          }
          aria-label="Zurück"
          onClick={() => command({ type: 'previous' })}
        >
          <PreviousIcon />
        </button>
        <button
          className="play"
          disabled={!has}
          title={state?.isPlaying ? 'Pause' : 'Abspielen'}
          aria-label={state?.isPlaying ? 'Pause' : 'Abspielen'}
          onClick={() => command({ type: 'playPause' })}
        >
          {state?.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="icon-btn"
          disabled={!has || guest}
          title={guest ? steerTitle : 'Weiter'}
          aria-label="Weiter"
          onClick={() => command({ type: 'next' })}
        >
          <NextIcon />
        </button>
        <div className="mini-volume" onWheel={wheelVolume}>
          <button
            className="icon-btn"
            disabled={!has}
            title={muted ? 'Ton an' : 'Stumm'}
            aria-label={muted ? 'Ton an' : 'Stumm'}
            onClick={() => command({ type: 'toggleMute' })}
          >
            <VolumeIcon volume={volume} muted={muted} />
          </button>
          {has && (
            <div className="mini-volume-pop">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                aria-label="Lautstärke"
                style={
                  { '--from': '0%', '--to': `${(muted ? 0 : volume) * 100}%` } as CSSProperties
                }
                onChange={(e) => command({ type: 'setVolume', volume: Number(e.target.value) })}
              />
              <span>{Math.round((muted ? 0 : volume) * 100)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
