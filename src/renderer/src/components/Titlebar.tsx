import type { View } from '@shared/types';
import { Logo } from './Logo';
import { SettingsIcon } from './icons';

const MOD = window.pegel.platform === 'darwin' ? '⌘' : 'Strg';

export function Titlebar({ view }: { view: View }) {
  return (
    <header className="titlebar">
      <button className="brand" title="Zur Musik" onClick={() => window.pegel.showView('music')}>
        <Logo />
        Pegel
      </button>
      <div className="tb-spacer" />
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
