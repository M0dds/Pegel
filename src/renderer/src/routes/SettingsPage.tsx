import { PageHead } from '../components/PageHead';

/** Placeholder; the full settings page follows in M7. */
export function SettingsPage() {
  return (
    <div className="page">
      <div className="page-inner">
        <PageHead title="Einstellungen" />
        <p className="lead">
          Hier kommen bald Theme, Tray, Autostart und Discord hin. Zurück über den Pfeil, das
          Pegel-Logo oder <span className="kbd">Esc</span>.
        </p>
      </div>
    </div>
  );
}
