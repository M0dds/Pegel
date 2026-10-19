import { Logo } from '../components/Logo';

/** First start (texts from design/mockup.html). */
export function WelcomePage() {
  return (
    <div className="page">
      <div className="welcome">
        <div>
          <div className="logo-big">
            <Logo size={76} />
          </div>
          <h2>Willkommen bei Pegel</h2>
          <p className="lead">YouTube Music als eigene App – mit Equalizer.</p>
          <button className="cta" onClick={() => window.pegel.finishWelcome(true)}>
            Mit Google-Konto anmelden
          </button>
          <p className="fine">
            Die Anmeldung läuft direkt bei Google. Pegel speichert kein Passwort.
          </p>
          <button className="link skip" onClick={() => window.pegel.finishWelcome(false)}>
            Ohne Anmeldung weiter
          </button>
        </div>
      </div>
    </div>
  );
}
