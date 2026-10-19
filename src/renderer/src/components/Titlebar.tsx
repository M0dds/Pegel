import type { ThemeId, View } from '@shared/types';
import { Logo } from './Logo';
import { EqIcon, MiniPlayerIcon, SettingsIcon } from './icons';

const MOD = window.pegel.platform === 'darwin' ? '⌘' : 'Strg';

interface Props {
  view: View;
  eqOpen: boolean;
  theme: ThemeId;
  /** Falling petals are drawn by PetalLayer; the static ones are the fallback. */
  animatedPetals: boolean;
}

/** Sakura extra: a few petals scattered over the title bar (from the mockup). */
function Petals() {
  return (
    <svg className="petals" viewBox="0 0 1280 38" preserveAspectRatio="none" aria-hidden="true">
      <g fill="var(--accent)">
        <ellipse cx="420" cy="12" rx="4" ry="2.4" transform="rotate(30 420 12)" />
        <ellipse cx="610" cy="27" rx="3.4" ry="2" transform="rotate(-20 610 27)" />
        <ellipse cx="760" cy="9" rx="4.2" ry="2.4" transform="rotate(60 760 9)" />
        <ellipse cx="905" cy="25" rx="3" ry="1.8" transform="rotate(10 905 25)" />
        <ellipse cx="300" cy="28" rx="3" ry="1.8" transform="rotate(-50 300 28)" />
      </g>
    </svg>
  );
}

export function Titlebar({ view, eqOpen, theme, animatedPetals }: Props) {
  return (
    <header className="titlebar">
      {theme === 'sakura' && !animatedPetals && <Petals />}
      <button className="brand" title="Zur Musik" onClick={() => window.pegel.showView('music')}>
        <Logo />
        Pegel
      </button>
      <div className="tb-spacer" />
      <button
        className="tb-btn"
        aria-pressed={view === 'music' && eqOpen}
        title={`Equalizer (${MOD}+E)`}
        onClick={() => window.pegel.toggleEqPanel()}
      >
        <EqIcon />
        Equalizer
      </button>
      <button
        className="tb-btn"
        title={`Mini-Player (${MOD}+M)`}
        aria-label="Mini-Player"
        onClick={() => window.pegel.openMini()}
      >
        <MiniPlayerIcon />
      </button>
      <button
        className="tb-btn"
        aria-pressed={view === 'settings'}
        title={`Einstellungen (${MOD}+,)`}
        aria-label="Einstellungen"
        onClick={() => window.pegel.showView(view === 'settings' ? 'music' : 'settings')}
      >
        <SettingsIcon />
      </button>
    </header>
  );
}
