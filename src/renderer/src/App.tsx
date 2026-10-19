import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/types';
import { Logo } from './components/Logo';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.pegel.getAppInfo().then(setInfo);
  }, []);

  return (
    <main className="empty">
      <Logo size={64} />
      <h1>Pegel</h1>
      {info && <p className="dim">Version {info.version}</p>}
    </main>
  );
}
