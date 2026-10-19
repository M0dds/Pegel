import { useEffect, useState } from 'react';
import type { View } from '@shared/types';
import { Titlebar } from './components/Titlebar';
import { OfflinePage } from './routes/OfflinePage';
import { SettingsPage } from './routes/SettingsPage';

export function App() {
  const [view, setView] = useState<View>('music');

  useEffect(() => {
    void window.pegel.getView().then(setView);
    return window.pegel.onViewChanged(setView);
  }, []);

  return (
    <div className="app">
      <Titlebar view={view} />
      {/* For 'music' the main process lays the YT view over this area. */}
      <div className="content">
        {view === 'settings' && <SettingsPage />}
        {view === 'offline' && <OfflinePage />}
      </div>
    </div>
  );
}
