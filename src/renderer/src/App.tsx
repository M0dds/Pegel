import { useEffect, useState } from 'react';
import type { PagePlaylist, PlayerState, Settings, View } from '@shared/types';
import { EqPanel } from './components/eq/EqPanel';
import { Titlebar } from './components/Titlebar';
import { applyTheme } from './styles/theme';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';

export function App() {
  const [view, setView] = useState<View>('music');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectorIssues, setSelectorIssues] = useState<string[]>([]);
  const [playing, setPlaying] = useState<PlayerState | null>(null);
  const [pagePlaylist, setPagePlaylist] = useState<PagePlaylist | null>(null);

  useEffect(() => {
    void window.pegel.getView().then(setView);
    void window.pegel.getSettings().then(setSettings);
    const offView = window.pegel.onViewChanged(setView);
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    void window.pegel.getSelectorIssues().then(setSelectorIssues);
    const offIssues = window.pegel.onSelectorIssues(setSelectorIssues);
    void window.pegel.getPlayerState().then(setPlaying);
    const offPlayer = window.pegel.onPlayerState(setPlaying);
    void window.pegel.getPagePlaylist().then(setPagePlaylist);
    const offPage = window.pegel.onPagePlaylist(setPagePlaylist);
    return () => {
      offView();
      offSettings();
      offIssues();
      offPlayer();
      offPage();
    };
  }, []);

  const theme = settings?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const panelOpen = settings?.eq.panelOpen ?? false;

  return (
    <div className="app">
      <Titlebar view={view} eqOpen={panelOpen} theme={theme ?? 'standard'} />
      <div className="content">
        <div className="music">
          {/* The main process lays the YT view over this slot. */}
          <div className="yt-slot" />
          {settings && (
            <EqPanel
              eq={settings.eq}
              open={panelOpen}
              playing={playing}
              pagePlaylist={pagePlaylist}
            />
          )}
        </div>
        {view === 'settings' && settings && (
          <SettingsPage settings={settings} selectorIssues={selectorIssues} />
        )}
        {view === 'offline' && <OfflinePage />}
      </div>
    </div>
  );
}
