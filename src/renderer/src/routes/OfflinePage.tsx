import { Logo } from '../components/Logo';

export function OfflinePage() {
  return (
    <div className="page">
      <div className="center">
        <div>
          <Logo size={56} />
          <h2>YouTube Music ist nicht erreichbar</h2>
          <p className="lead">Prüfe deine Internetverbindung und versuche es noch einmal.</p>
          <button className="cta" onClick={() => window.pegel.retryLoad()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  );
}
