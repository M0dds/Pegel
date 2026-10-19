import type { View } from '@shared/types';
import { Logo } from './Logo';
import { EqIcon, SettingsIcon } from './icons';

const MOD = window.pegel.platform === 'darwin' ? '⌘' : 'Strg';

export function Titlebar({ view, eqOpen }: { view: View; eqOpen: boolean }) {
  return (
    <header className="titlebar">
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
