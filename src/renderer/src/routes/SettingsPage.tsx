import { useState, type CSSProperties, type ReactNode } from 'react';
import { themeEffect } from '@shared/effects';
import { AUDIO_OFFSET_MAX_MS } from '@shared/settings';
import { NAME_MAX } from '@shared/social-protocol';
import { THEME_IDS, THEMES } from '@shared/themes';
import type { AppInfo, Settings } from '@shared/types';
import type { UpdateStatus } from '@shared/update';
import { PageHead } from '../components/PageHead';
import { Switch } from '../components/Switch';
import { CloseIcon, PlaylistIcon } from '../components/icons';

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

const PREVIEW_BARS = [7, 14, 10, 17];

interface Props {
  settings: Settings;
  appInfo: AppInfo | null;
  /** Features limited because YT changed its page. */
  selectorIssues: string[];
  update: UpdateStatus;
}

function updateHint(update: UpdateStatus, supported: boolean): string {
  if (!supported) return 'Nur in der installierten Version';
  switch (update.state) {
    case 'checking':
      return 'Suche nach Updates …';
    case 'current':
      return 'Pegel ist auf dem neuesten Stand';
    case 'available':
      return `Version ${update.version} ist verfügbar`;
    case 'downloading':
      return `Version ${update.version} wird geladen … ${update.percent} %`;
    case 'ready':
      return `Version ${update.version} ist bereit und wird beim Neustart installiert`;
    case 'error':
      return 'Suche fehlgeschlagen. Bist du online?';
    default:
      return 'Pegel sucht automatisch nach neuen Versionen';
  }
}

/** Settings page (Discord integration is deferred, see M6 in docs/PLAN.md). */
export function SettingsPage({ settings, appInfo, selectorIssues, update }: Props) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const mediaKeysPending = appInfo !== null && settings.mediaKeys !== appInfo.mediaKeysAtStart;
  const updatesSupported = appInfo?.updatesSupported ?? false;
  const canInstall = update.state === 'ready' || update.state === 'available';
  const busy = update.state === 'checking' || update.state === 'downloading';
  const effect = themeEffect(settings.theme);

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
          <div className="theme-chips">
            {THEME_IDS.map((id) => {
              const { name, tokens } = THEMES[id];
              return (
                <button
                  key={id}
                  className="theme-chip"
                  aria-pressed={settings.theme === id}
                  onClick={() => window.pegel.setTheme(id)}
                >
                  <span className="swatch" style={{ background: tokens.bg }} aria-hidden="true">
                    {PREVIEW_BARS.map((h, i) => (
                      <i
                        key={i}
                        style={{ height: h, background: tokens.accent, opacity: 1 - i * 0.18 }}
                      />
                    ))}
                  </span>
                  {name}
                </button>
              );
            })}
          </div>
          {effect && (
            <Row
              title={effect.label}
              hint={
                effect.layer === 'back'
                  ? 'Steht still, wenn im System „Bewegung reduzieren“ aktiv ist'
                  : 'Aus, wenn im System „Bewegung reduzieren“ aktiv ist'
              }
            >
              <Switch
                checked={settings.effects.theme}
                label={effect.label}
                onChange={(theme) => window.pegel.patchSettings({ effects: { theme } })}
              />
            </Row>
          )}
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
              Noch keine Playlist hat ein eigenes Preset. Zuordnen kannst du es im Equalizer, wenn
              die Playlist geöffnet ist oder läuft.
            </p>
          ) : (
            <ul className="pl-chips">
              {settings.eq.playlistPresets.map((p) => (
                <li key={p.playlistId} className="pl-chip">
                  <PlaylistIcon />
                  <span className="pl-title" title={p.title}>
                    {p.title}
                  </span>
                  <span className="pl-preset">{p.preset}</span>
                  <button
                    className="pl-remove"
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
                </li>
              ))}
            </ul>
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
            title="Medientasten"
            hint={
              mediaKeysPending
                ? 'Wird nach einem Neustart von Pegel wirksam'
                : `Play/Pause, Weiter und Zurück über die Tastatur und ${isMac ? '„Jetzt läuft“' : 'die Medienanzeige von Windows'}`
            }
          >
            <Switch
              checked={settings.mediaKeys}
              label="Medientasten"
              onChange={(mediaKeys) => window.pegel.patchSettings({ mediaKeys })}
            />
          </Row>
          <Row
            title="Kopierte Links erkennen"
            hint="Kopierst du einen YouTube-Link, bietet Pegel an, ihn zu öffnen"
          >
            <Switch
              checked={settings.clipboardLinks}
              label="Kopierte Links erkennen"
              onChange={(clipboardLinks) => window.pegel.patchSettings({ clipboardLinks })}
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
            title="Visualizer im Mini-Player"
            hint="Frequenzbalken hinter den Tasten des Mini-Players"
          >
            <Switch
              checked={settings.mini.visualizer}
              label="Visualizer im Mini-Player"
              onChange={(visualizer) => window.pegel.patchSettings({ mini: { visualizer } })}
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

        <SocialSection settings={settings} />

        <section className="section">
          <h4>Über</h4>
          <Row
            title={`Pegel ${appInfo?.version ?? ''}`.trim()}
            hint="Inoffizieller Desktop-Client für YouTube Music. Nicht mit Google verbunden."
          >
            <button
              className={confirmSignOut ? 'btn btn-inline danger-solid' : 'btn btn-inline'}
              onBlur={() => setConfirmSignOut(false)}
              onClick={() => {
                if (!confirmSignOut) return setConfirmSignOut(true);
                setConfirmSignOut(false);
                window.pegel.signOut();
              }}
            >
              {confirmSignOut ? 'Wirklich abmelden?' : 'Abmelden'}
            </button>
          </Row>
          <Row title="Updates" hint={updateHint(update, updatesSupported)}>
            <button
              className={canInstall ? 'btn btn-inline primary' : 'btn btn-inline'}
              disabled={!updatesSupported || busy}
              onClick={() =>
                canInstall ? window.pegel.installUpdate() : window.pegel.checkForUpdates()
              }
            >
              {update.state === 'ready'
                ? 'Neu starten'
                : update.state === 'available'
                  ? 'Herunterladen'
                  : 'Nach Updates suchen'}
            </button>
          </Row>
        </section>
      </div>
    </div>
  );
}

/** Track fill of the offset slider from 0 to the value (see input[type='range']). */
function offsetFill(value: number): CSSProperties {
  const pos = (v: number) => `${((v + AUDIO_OFFSET_MAX_MS) / (2 * AUDIO_OFFSET_MAX_MS)) * 100}%`;
  return { '--from': pos(Math.min(value, 0)), '--to': pos(Math.max(value, 0)) } as CSSProperties;
}

function SocialSection({ settings }: { settings: Settings }) {
  const social = settings.social;
  const [name, setName] = useState(social.displayName);
  const [confirmReset, setConfirmReset] = useState(false);
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== social.displayName)
      window.pegel.socialPatch({ displayName: trimmed });
    else setName(social.displayName);
  };

  return (
    <section className="section">
      <h4>Freunde &amp; Party</h4>
      {!social.enabled ? (
        <Row
          title="Freunde sind aus"
          hint="Einrichten im Social-Panel (Titelleiste). Bis dahin baut Pegel keine Verbindung auf."
        >
          <button className="btn btn-inline" onClick={() => window.pegel.toggleSocialPanel()}>
            Einrichten
          </button>
        </Row>
      ) : (
        <>
          <Row title="Anzeigename" hint="So sehen dich deine Freunde">
            <input
              className="text-input"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </Row>
          <Row
            title="„Hört gerade“ teilen"
            hint="Freunde sehen Titel und Interpret, solange du hörst. Aus: nur „online“"
          >
            <Switch
              checked={social.shareNowPlaying}
              label="Hört gerade teilen"
              onChange={(shareNowPlaying) => window.pegel.socialPatch({ shareNowPlaying })}
            />
          </Row>
          <Row
            title="Audio-Versatz"
            hint="Nur nötig, wenn du in einer Party hörbar hinterher- oder vorausläufst (z. B. Bluetooth). Plus: dein Ton kommt später an"
          >
            <div className="offset">
              <input
                type="range"
                min={-AUDIO_OFFSET_MAX_MS}
                max={AUDIO_OFFSET_MAX_MS}
                step={10}
                value={social.audioOffsetMs}
                style={offsetFill(social.audioOffsetMs)}
                aria-label="Audio-Versatz"
                onChange={(e) =>
                  window.pegel.socialPatch({ audioOffsetMs: Number(e.target.value) })
                }
                onDoubleClick={() => window.pegel.socialPatch({ audioOffsetMs: 0 })}
              />
              <span>
                {social.audioOffsetMs > 0 ? '+' : ''}
                {social.audioOffsetMs} ms
              </span>
            </div>
          </Row>
          <Row
            title="Datenschutz"
            hint="Der Server (Cloudflare, EU) kennt Name, Schlüssel und Freundesliste nur, solange du online bist. Gespeichert werden nur Freundescodes (24 h). Keine Google-Daten."
          >
            <span />
          </Row>
          <Row
            title="Freunde ausschalten oder zurücksetzen"
            hint="Ausschalten trennt die Verbindung. Zurücksetzen löscht Schlüssel und Freundesliste auf diesem Rechner"
          >
            <div className="row-buttons">
              <button className="btn btn-inline" onClick={() => window.pegel.socialDisable()}>
                Ausschalten
              </button>
              <button
                className={confirmReset ? 'btn btn-inline danger-solid' : 'btn btn-inline'}
                onBlur={() => setConfirmReset(false)}
                onClick={() => {
                  if (!confirmReset) return setConfirmReset(true);
                  setConfirmReset(false);
                  window.pegel.socialReset();
                }}
              >
                {confirmReset ? 'Wirklich löschen?' : 'Zurücksetzen'}
              </button>
            </div>
          </Row>
        </>
      )}
    </section>
  );
}
