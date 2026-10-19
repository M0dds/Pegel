import { useEffect, useState } from 'react';
import type { Settings, View } from '@shared/types';
import { EqPanel } from './components/eq/EqPanel';
import { Titlebar } from './components/Titlebar';
import { applyTheme } from './styles/theme';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';

export function App() {
  const [view, setView] = useState<View>('music');
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void window.pegel.getView().then(setView);
    void window.pegel.getSettings().then(setSettings);
    const offView = window.pegel.onViewChanged(setView);
    const offSettings = window.pegel.onSettingsChanged(setSettings);
    return () => {
      offView();
      offSettings();
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
          {settings && <EqPanel eq={settings.eq} open={panelOpen} />}
        </div>
        {view === 'settings' && settings && <SettingsPage settings={settings} />}
        {view === 'offline' && <OfflinePage />}
      </div>
    </div>
  );
}
