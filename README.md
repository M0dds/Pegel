# Pegel

Inoffizieller Desktop-Client für YouTube Music unter Windows und macOS. Pegel öffnet die offizielle Seite music.youtube.com in einem eigenen Fenster und bringt Folgendes mit:

- Equalizer mit 10 Bändern, Presets und eigenen Presets pro Playlist
- Lautstärke angleichen: Leise Titel werden so laut wie die anderen
- Links öffnen: Ein kopierter YouTube-Link (zum Beispiel aus Discord) lässt sich mit einem Klick in Pegel abspielen
- 10 Themes, zum Beispiel Sakura mit fallenden Blütenblättern
- einen Visualizer hinter der Player-Leiste
- Tray-Symbol, Medientasten und einen Mini-Player
- Autostart und automatische Updates

Pegel blockiert keine Werbung, lädt nichts herunter und speichert keine Passwörter. Die Anmeldung läuft direkt bei Google.

## Installation

**Download:** [Neueste Version](https://github.com/M0dds/Pegel/releases/latest). Unter „Assets“ findest du `Pegel-Setup-<Version>.exe` für Windows und die DMG-Dateien für macOS.

### Windows

1. `Pegel-Setup-<Version>.exe` herunterladen und starten.
2. Pegel ist nicht signiert. Deshalb kann Windows SmartScreen warnen („Der Computer wurde durch Windows geschützt“). Klicke auf **Weitere Informationen** und dann auf **Trotzdem ausführen**.
3. Wähle im Installer den Ordner. Admin-Rechte sind nicht nötig. Danach liegt Pegel im Startmenü und auf dem Desktop.

**Updates** lädt Pegel selbst im Hintergrund. Ist eins bereit, erscheint oben „Update auf … bereit“ mit dem Knopf „Neu starten“. Spätestens beim nächsten Beenden wird es installiert.

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

**Updates:** Gibt es eine neue Version, zeigt Pegel oben einen Hinweis mit „Herunterladen“. Die neue DMG installierst du wie oben, sie ersetzt die alte Version. Automatisch installieren kann macOS nur Apps mit Apple-Signatur.

**Deinstallieren:** Pegel aus „Programme“ in den Papierkorb ziehen. Einstellungen und Anmeldung liegen unter `~/Library/Application Support/Pegel`.

## Bedienung

| Taste (Windows) | Taste (macOS) | Aktion                       |
| --------------- | ------------- | ---------------------------- |
| Strg + E        | ⌘ + E         | Equalizer ein- und ausblenden |
| Strg + U        | ⌘ + U         | Freunde & Party (Social)     |
| Strg + M        | ⌘ + M         | Mini-Player                  |
| Strg + ,        | ⌘ + ,         | Einstellungen                |
| F5 / Strg + R   | ⌘ + R         | YouTube Music neu laden      |
| Esc             | Esc           | Einstellungen schließen      |

- **Medientasten** (Play/Pause, Weiter, Zurück) funktionieren auch, wenn Pegel im Hintergrund läuft. In den Einstellungen kannst du sie abschalten.
- **Fenster schließen:** Unter Windows läuft die Musik im Tray weiter, solange „Beim Schließen in den Infobereich minimieren“ aktiv ist. Unter macOS bleibt Pegel wie üblich im Dock. Ganz beenden: „Beenden“ im Tray-Menü bzw. ⌘ + Q.
- **Links öffnen:** Kopiere einen YouTube- oder YouTube-Music-Link (Titel, Playlist, Album) und wechsle zu Pegel. Oben erscheint dann zum Beispiel „Kopierter Link: Titel“ mit dem Knopf „Öffnen“. Du kannst Links auch direkt aufs Pegel-Fenster ziehen. Ein Klick auf einen Link in Discord öffnet weiterhin den Browser, weil Windows und macOS das nicht anders zulassen.
- **Lautstärke angleichen** (im Equalizer, standardmäßig an): YouTube macht laute Titel selbst leiser. Pegel hebt leise Titel um bis zu 6 dB an. Ein Limiter verhindert Übersteuern.
- **EQ pro Playlist:** Öffne eine Playlist und wähle im Equalizer unter „Preset für diese Playlist“ ein Preset. Es wird automatisch aktiv, sobald diese Playlist läuft.

## Freunde & Hör-Party

- **Einrichten:** Klick oben auf „Social“ und gib einen Namen ein. Ein Passwort gibt es nicht, und Pegel braucht keine Google-Daten: Es erzeugt auf deinem Rechner einen eigenen Schlüssel.
- **Freunde hinzufügen:** „Freund hinzufügen“ zeigt deinen Code (z. B. `K7Q2-M9XD`, 24 Stunden gültig, nur einmal). Schick ihn deinem Freund, er gibt ihn bei sich ein. Danach seht ihr euch gegenseitig online und was ihr gerade hört.
- **Hör-Party:** „Party starten“ oder bei einem Freund „Einladen“. Alle hören denselben Titel zur gleichen Zeit, jeder über sein eigenes YouTube-Music-Konto. Pegel überträgt kein Audio, es gleicht nur Titel, Position und Pause ab.
  - Der Host steuert. Wählt ein Gast einen anderen Titel, geht der als Vorschlag an den Host.
  - Bekommt ein Gast ohne Premium Werbung, wartet die Party bis zu 30 Sekunden auf ihn.
  - Der Equalizer bleibt bei jedem der eigene.
  - **Mithören:** Ein Klick auf den Titel, den ein Freund gerade hört, spielt ihn bei dir ab. „aus …“ öffnet seine Playlist, wenn sie öffentlich oder per Link geteilt ist.
  - Läuft dein Ton mit Bluetooth-Kopfhörern hörbar hinterher, hilft „Audio-Versatz“ in den Einstellungen.

## Datenschutz

- Pegel speichert nur Einstellungen und EQ-Presets auf deinem Rechner.
- Die Anmeldung erfolgt bei Google. Pegel sieht und speichert dein Passwort nicht. Die Sitzung verhält sich wie in einem Browser.
- „Abmelden“ in den Einstellungen löscht Sitzung, Cookies und Cache von YouTube Music.
- Pegel sendet keine Nutzungsdaten. Für Updates fragt Pegel nur bei GitHub nach, ob es eine neue Version gibt.
- Kopierte Links liest Pegel nur, wenn du ins Fenster wechselst, und nur auf deinem Rechner. In den Einstellungen lässt sich das abschalten („Kopierte Links erkennen“).
- **Freunde & Party** sind aus, bis du sie einrichtest. Danach verbindet sich Pegel mit einem kleinen Server (Cloudflare, Rechenzentren in der EU):
  - Der Server kennt deinen Namen, deinen öffentlichen Schlüssel, deine Freundesliste und „Hört gerade“ nur im Arbeitsspeicher, solange du online bist.
  - Gespeichert werden nur Freundescodes (höchstens 24 Stunden) und noch nicht zugestellte Hinweise „X hat deinen Code eingelöst“ (höchstens 30 Tage).
  - Party-Daten verschwinden, wenn die Party endet.
  - Zu „Hört gerade“ gehört auch die Playlist, aus der du hörst (Name und ID). Freunde können sie öffnen, wenn sie öffentlich oder per Link geteilt ist.
  - Deine Freundesliste liegt nur auf deinem Rechner. „Hört gerade teilen“ lässt sich abschalten, „Zurücksetzen“ löscht Schlüssel und Liste.

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

Freunde & Party lokal testen (Server in `server/`, zwei Pegel mit eigenem Profil):

```bash
cd server && npm install && npm run dev      # Relay auf ws://127.0.0.1:8787
PEGEL_SOCIAL_URL=ws://127.0.0.1:8787 PEGEL_USER_DATA=/tmp/pegel-a npm run dev
```

- **Geschenk-Build:** `npm run dist -- --profile=<name>` liest `build-profiles/<name>.json`. Die Datei legt das Theme für den ersten Start fest, zum Beispiel `{ "defaultTheme": "sakura" }`. Der Installer heißt dann `Pegel-Setup-<Version>-<name>.exe`.
- **Icons neu erzeugen:** `node --experimental-strip-types scripts/make-icons.mts` schreibt `resources/icon.png`, `icon.ico` und `icon.icns`.
- **Release veröffentlichen:** Version in `package.json` erhöhen, committen, dann einen Tag `v<Version>` pushen (z. B. `git tag v1.0.1 && git push origin v1.0.1`). Der Workflow `.github/workflows/release.yml` baut Windows und macOS, lädt alles in ein GitHub-Release und veröffentlicht es. Installierte Pegels finden das Update dann von selbst.
- **macOS-DMGs** lassen sich nur auf einem Mac bauen, oder über den GitHub-Actions-Workflow `.github/workflows/build.yml`. Den Workflow startest du von Hand unter Actions → Build → Run workflow.

Plan, Architektur und Meilensteine: [docs/PLAN.md](docs/PLAN.md).

_Pegel steht in keiner Verbindung zu YouTube oder Google._
