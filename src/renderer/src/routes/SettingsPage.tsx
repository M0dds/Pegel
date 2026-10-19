import { THEME_IDS, THEMES } from '@shared/themes';
import type { Settings } from '@shared/types';
import { PageHead } from '../components/PageHead';

const PREVIEW_BARS = [10, 22, 16, 30, 12];

/** Settings page. M3: appearance; playback, integrations and "about" follow in M7. */
export function SettingsPage({ settings }: { settings: Settings }) {
  return (
    <div className="page">
      <div className="page-inner">
        <PageHead title="Einstellungen" />
        <p className="lead">
          Zurück zur Musik über den Pfeil, das Pegel-Logo oder <span className="kbd">Esc</span>.
        </p>

        <section className="section">
          <h4>Darstellung</h4>
          <div className="themes">
            {THEME_IDS.map((id) => {
              const { name, tokens } = THEMES[id];
              return (
                <button
                  key={id}
                  className="theme-card"
                  aria-pressed={settings.theme === id}
                  onClick={() => window.pegel.setTheme(id)}
                >
                  <div className="pv" style={{ background: tokens.bg }}>
                    {PREVIEW_BARS.map((h, i) => (
                      <i
                        key={i}
                        style={{ height: h, background: tokens.accent, opacity: 1 - i * 0.12 }}
                      />
                    ))}
                  </div>
                  <div className="nm">{name}</div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
