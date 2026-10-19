import type { ReactNode } from 'react';
import { THEME_IDS, THEMES } from '@shared/themes';
import type { Settings } from '@shared/types';
import { PageHead } from '../components/PageHead';
import { Switch } from '../components/Switch';
import { CloseIcon } from '../components/icons';

const isMac = window.pegel.platform === 'darwin';
const OS_NAME = isMac ? 'macOS' : 'Windows';

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="row">
      <div>
        <b>{title}</b>
        <small>{hint}</small>
      </div>
      {children}
    </div>
  );
}

const PREVIEW_BARS = [10, 22, 16, 30, 12];

interface Props {
  settings: Settings;
  /** Features limited because YT changed its page. */
  selectorIssues: string[];
}

/** Settings page; Discord and "about" follow in M6/M7. */
export function SettingsPage({ settings, selectorIssues }: Props) {
  return (
    <div className="page">
      <div className="page-inner">
        <PageHead title="Einstellungen" />
        <p className="lead">
          Zurück zur Musik über den Pfeil, das Pegel-Logo oder <span className="kbd">Esc</span>.
        </p>

        {selectorIssues.length > 0 && (
          <p className="notice" role="status">
            YouTube hat etwas geändert – eingeschränkt: {selectorIssues.join(', ')}.
          </p>
        )}

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
          <Row
            title="Fallende Blütenblätter"
            hint="Im Theme Sakura. Aus, wenn im System „Bewegung reduzieren“ aktiv ist"
          >
            <Switch
              checked={settings.effects.petals}
              label="Fallende Blütenblätter"
              onChange={(petals) => window.pegel.patchSettings({ effects: { petals } })}
            />
          </Row>
          <Row
            title="Visualizer hinter dem Player"
            hint="Frequenzbalken in der Theme-Farbe, nur während der Wiedergabe"
          >
            <Switch
              checked={settings.effects.visualizer}
              label="Visualizer hinter dem Player"
              onChange={(visualizer) => window.pegel.patchSettings({ effects: { visualizer } })}
            />
          </Row>
        </section>

        <section className="section">
          <h4>Playlist-Presets</h4>
          {settings.eq.playlistPresets.length === 0 ? (
            <p className="empty-hint">
              Noch keine Playlist hat ein eigenes Preset. Zuordnen kannst du es im Equalizer,
              während die Playlist läuft.
            </p>
          ) : (
            settings.eq.playlistPresets.map((p) => (
              <Row key={p.playlistId} title={p.title} hint={`Preset: ${p.preset}`}>
                <button
                  className="icon-btn"
                  title="Zuordnung entfernen"
                  aria-label={`Preset-Zuordnung für ${p.title} entfernen`}
                  onClick={() =>
                    window.pegel.eqAction({
                      type: 'setPlaylistPreset',
                      playlistId: p.playlistId,
                      title: p.title,
                      preset: null,
                    })
                  }
                >
                  <CloseIcon />
                </button>
              </Row>
            ))
          )}
        </section>

        <section className="section">
          <h4>Wiedergabe &amp; System</h4>
          {!isMac && (
            <Row
              title="Beim Schließen in den Infobereich minimieren"
              hint="Musik läuft weiter, Steuerung über das Tray-Symbol"
            >
              <Switch
                checked={settings.closeToTray}
                label="Beim Schließen in den Infobereich minimieren"
                onChange={(closeToTray) => window.pegel.patchSettings({ closeToTray })}
              />
            </Row>
          )}
          <Row
            title={`Mit ${OS_NAME} starten`}
            hint={
              isMac
                ? 'Startet ohne Fenster, nur in der Menüleiste'
                : 'Startet minimiert im Infobereich'
            }
          >
            <Switch
              checked={settings.startAtLogin}
              label={`Mit ${OS_NAME} starten`}
              onChange={(startAtLogin) => window.pegel.patchSettings({ startAtLogin })}
            />
          </Row>
          <Row
            title="Mini-Player immer im Vordergrund"
            hint={`Bleibt über anderen Fenstern. Öffnen mit ${isMac ? '⌘' : 'Strg'} + M`}
          >
            <Switch
              checked={settings.mini.alwaysOnTop}
              label="Mini-Player immer im Vordergrund"
              onChange={(alwaysOnTop) => window.pegel.patchSettings({ mini: { alwaysOnTop } })}
            />
          </Row>
          <Row
            title="Hauptfenster beim Mini-Player ausblenden"
            hint="Der Mini-Player ersetzt das Fenster, die Musik läuft weiter"
          >
            <Switch
              checked={settings.mini.hideMainOnOpen}
              label="Hauptfenster beim Mini-Player ausblenden"
              onChange={(hideMainOnOpen) =>
                window.pegel.patchSettings({ mini: { hideMainOnOpen } })
              }
            />
          </Row>
        </section>
      </div>
    </div>
  );
}
