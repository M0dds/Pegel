# Pegel

Inoffizieller Desktop-Client für YouTube Music unter Windows und macOS. Pegel öffnet die offizielle Seite music.youtube.com in einem eigenen Fenster und bringt Folgendes mit:

- Equalizer mit 10 Bändern, Presets und eigenen Presets pro Playlist
- 10 Themes, zum Beispiel Sakura mit fallenden Blütenblättern
- einen Visualizer hinter der Player-Leiste
- Tray-Symbol, Medientasten und einen Mini-Player
- Autostart

Pegel blockiert keine Werbung, lädt nichts herunter und speichert keine Passwörter. Die Anmeldung läuft direkt bei Google.

## Installation

### Windows

1. `Pegel-Setup-<Version>.exe` starten.
2. Pegel ist nicht signiert. Deshalb kann Windows SmartScreen warnen („Der Computer wurde durch Windows geschützt“). Klicke auf **Weitere Informationen** und dann auf **Trotzdem ausführen**.
3. Wähle im Installer den Ordner. Admin-Rechte sind nicht nötig. Danach liegt Pegel im Startmenü und auf dem Desktop.

**Deinstallieren:** Einstellungen → Apps → Installierte Apps → Pegel → Deinstallieren. Einstellungen und Anmeldung bleiben erhalten. Wer sie ebenfalls loswerden will, löscht den Ordner `%APPDATA%\Pegel`.

### macOS

1. Lade die passende DMG-Datei:
   - `Pegel-<Version>-arm64.dmg` für Macs mit Apple-Chip (M1 und neuer)
   - `Pegel-<Version>-x64.dmg` für Intel-Macs
2. Öffne die DMG und ziehe Pegel in den Ordner „Programme“.
3. Pegel hat keine Apple-Signatur, deshalb blockiert Gatekeeper den ersten Start:
   - **Rechtsklick** auf Pegel → **Öffnen** → **Öffnen**, oder
   - (ab macOS 15) einmal normal starten, dann **Systemeinstellungen → Datenschutz & Sicherheit** → ganz unten **Trotzdem öffnen**.

   Ab dem zweiten Start öffnet sich Pegel ganz normal.

**Deinstallieren:** Pegel aus „Programme“ in den Papierkorb ziehen. Einstellungen und Anmeldung liegen unter `~/Library/Application Support/Pegel`.

## Bedienung

| Taste (Windows) | Taste (macOS) | Aktion                       |
| --------------- | ------------- | ---------------------------- |
| Strg + E        | ⌘ + E         | Equalizer ein- und ausblenden |
| Strg + M        | ⌘ + M         | Mini-Player                  |
| Strg + ,        | ⌘ + ,         | Einstellungen                |
| F5 / Strg + R   | ⌘ + R         | YouTube Music neu laden      |
| Esc             | Esc           | Einstellungen schließen      |

- **Medientasten** (Play/Pause, Weiter, Zurück) funktionieren auch, wenn Pegel im Hintergrund läuft. In den Einstellungen kannst du sie abschalten.
- **Fenster schließen:** Unter Windows läuft die Musik im Tray weiter, solange „Beim Schließen in den Infobereich minimieren“ aktiv ist. Unter macOS bleibt Pegel wie üblich im Dock. Ganz beenden: „Beenden“ im Tray-Menü bzw. ⌘ + Q.
- **EQ pro Playlist:** Öffne eine Playlist und wähle im Equalizer unter „Preset für diese Playlist“ ein Preset. Es wird automatisch aktiv, sobald diese Playlist läuft.

## Datenschutz

- Pegel speichert nur Einstellungen und EQ-Presets auf deinem Rechner.
- Die Anmeldung erfolgt bei Google. Pegel sieht und speichert dein Passwort nicht. Die Sitzung verhält sich wie in einem Browser.
- „Abmelden“ in den Einstellungen löscht Sitzung, Cookies und Cache von YouTube Music.
- Pegel sendet keine Nutzungsdaten.

---

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev      # App mit Hot Reload
npm test         # Vitest
npm run lint     # ESLint
npm run dist     # Installer nach dist/ (Windows: NSIS, macOS: DMG)
```

- **Geschenk-Build:** `npm run dist -- --profile=<name>` liest `build-profiles/<name>.json`. Die Datei legt das Theme für den ersten Start fest, zum Beispiel `{ "defaultTheme": "sakura" }`. Der Installer heißt dann `Pegel-Setup-<Version>-<name>.exe`.
- **Icons neu erzeugen:** `node --experimental-strip-types scripts/make-icons.mts` schreibt `resources/icon.png`, `icon.ico` und `icon.icns`.
- **macOS-DMGs** lassen sich nur auf einem Mac bauen, oder über den GitHub-Actions-Workflow `.github/workflows/build.yml`. Den Workflow startest du von Hand unter Actions → Build → Run workflow.

Plan, Architektur und Meilensteine: [docs/PLAN.md](docs/PLAN.md).

_Pegel steht in keiner Verbindung zu YouTube oder Google._
