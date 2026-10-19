# Pegel – Projektplan

Pegel ist ein inoffizieller Desktop-Client für YouTube Music für Windows und macOS. Er bindet die echte Seite music.youtube.com in ein eigenes Fenster ein und ergänzt sie um:

- einen 10-Band-Equalizer,
- Farb-Themes,
- einen Mini-Player,
- ein Tray-Symbol mit Medientasten,
- Autostart,
- einen Discord-Status.

Pegel ist für den privaten Gebrauch gedacht (Johann und Freunde). Es wird nicht verkauft und nicht öffentlich vertrieben.

Design-Referenz: [`design/mockup.html`](../design/mockup.html). Im Browser öffnen, dort lassen sich Ansicht, Theme und Betriebssystem umschalten.

---

## 1. Ziele und Nicht-Ziele

**Ziele**

- Eigenständige Desktop-App ohne Browser-Tab, mit Login über das eigene Google-Konto. YouTube Premium gilt dann automatisch: keine Werbung, Hintergrundwiedergabe.
- Equalizer mit 10 Bändern (31 Hz bis 16 kHz), Vorverstärkung, Presets und eigenen Presets.
- Gemeinsame Playlists funktionieren, weil die Originalseite genutzt wird. Dafür ist nichts zu bauen.
- Themes: Standard (YT-Rot), Sakura, Nordlicht, Bernstein.
- Tray-Symbol und Medientasten, Mini-Player, Autostart, Discord-Status.
- Windows zuerst, macOS (Apple Silicon und Intel) muss von Anfang an mitgedacht werden.

**Nicht-Ziele** (bewusst ausgeschlossen)

- Kein Werbeblocker, kein Download und kein Herauslösen von Audio-Streams. Das verstößt gegen die YouTube-Nutzungsbedingungen und ist mit Premium ohnehin unnötig.
- Kein Nachbau der YT-Music-Oberfläche. Die Bibliothek, die Suche usw. kommen von Google.
- Keine Speicherung von Zugangsdaten durch Pegel. Den Login verwaltet die Google-Seite selbst, Pegel hält nur die Session-Cookies in einer eigenen Partition.
- Kein Store-Vertrieb und keine Code-Signierung in Version 1.

---

## 2. Tech-Stack

| Bereich            | Wahl                                                                   | Begründung                                                                                                   |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Laufzeit           | **Electron** (aktuelle stabile Version)                                | Chromium mit Web Audio API, läuft unter Windows und macOS, Medientasten und MediaSession werden mitgeliefert |
| Sprache            | **TypeScript** (strict)                                                |                                                                                                              |
| Build              | **electron-vite**                                                      | Getrennte Builds für Main-, Preload- und Renderer-Prozess, Hot Reload                                        |
| UI (eigene Seiten) | **React** und CSS-Variablen (kein CSS-Framework)                       | Kleine Oberfläche, die Theme-Tokens kommen direkt aus `shared/themes.ts`                                     |
| Einstellungen      | **electron-store** (oder eine eigene JSON-Datei in `userData`)         | Mit Schema und Migrationen                                                                                   |
| Discord            | **@xhayper/discord-rpc**                                               | Gepflegte Bibliothek für die Discord-RPC-Schnittstelle                                                       |
| Paketierung        | **electron-builder**                                                   | Windows: NSIS-Installer (x64). macOS: DMG (arm64 und x64 oder universal)                                     |
| Tests              | **Vitest** für die Logik, **Playwright** (`_electron`) für Smoke-Tests |                                                                                                              |

Voraussetzungen auf dem Rechner: Node.js 22 LTS und Git. Für den macOS-Build ist ein Mac nötig, alternativ GitHub Actions mit einem macOS-Runner.

---

## 3. Architektur

```
┌──────────────────────────── BrowserWindow (Haupt) ─────────────────────────────┐
│  webContents = Pegel-UI (React, Route "/")                                     │
│  ┌──────────── Titelleiste (eigene UI, -webkit-app-region: drag) ───────────┐  │
│  ├───────────────────────────────────────────────┬──────────────────────────┤  │
│  │  WebContentsView "yt"                         │  EQ-Panel (eigene UI)    │  │
│  │  music.youtube.com                            │  372 px, ein-/ausklapp-  │  │
│  │  • Partition persist:pegel                    │  bar                     │  │
│  │  • preload: yt-preload (EQ, Player-Bridge)    │                          │  │
│  │  • insertCSS: Theme-Overrides                 │                          │  │
│  └───────────────────────────────────────────────┴──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
          ▲ IPC (typisierte Kanäle)                                   ▲
   Main-Prozess: Fenster, Tray, Einstellungen, Discord, Autostart, Navigation
          ▼                                                           ▼
 Mini-Player-Fenster (Pegel-UI, Route "/mini")         Tray-Menü / Discord-RPC
```

**Prinzip:** Das Hauptfenster rendert die Pegel-UI über die ganze Fläche. Die YT-Music-Ansicht ist eine `WebContentsView`, die der Main-Prozess per `setBounds()` über den Inhaltsbereich legt: unterhalb der Titelleiste und links vom EQ-Panel. Für die Seiten „Einstellungen“ und „Willkommen“ wird die YT-Ansicht ausgeblendet (`setVisible(false)`), und die Pegel-UI zeigt die Seite.

Vorteil: Die eigene Oberfläche hängt nicht vom HTML von Google ab. Wenn Google YT Music umbaut, bleiben Titelleiste, EQ-Panel und Einstellungen heil.

Die EQ-Panel-Breite und die Titelleistenhöhe sind Konstanten in `shared/layout.ts`. Main-Prozess und UI nutzen dieselben Werte. Das Ein- und Ausklappen animiert die UI. Der Main-Prozess passt die Bounds an, sobald die UI meldet, dass die Animation beendet ist (Zwischenschritte sind optional).

### 3.1 Prozesse und Verantwortlichkeiten

| Modul                         | Aufgabe                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `main/index.ts`               | App-Lebenszyklus, Single-Instance-Lock, Start im Hintergrund (`--hidden`)             |
| `main/windows/main-window.ts` | Hauptfenster, YT-Ansicht, Bounds-Layout, Fensterposition merken                       |
| `main/windows/mini-window.ts` | Mini-Player (rahmenlos, 360 × 150, optional immer im Vordergrund)                     |
| `main/yt-view.ts`             | YT-Ansicht anlegen: Partition, User-Agent, Preload, CSS-Injection, Navigations-Schutz |
| `main/tray.ts`                | Tray-Symbol und Menü                                                                  |
| `main/discord.ts`             | Discord-Status (abschaltbar, nur bei Titelwechsel, Pause bzw. Fortsetzen)             |
| `main/settings.ts`            | Persistenz, Schema, Migrationen                                                       |
| `main/autostart.ts`           | `app.setLoginItemSettings`                                                            |
| `main/ipc.ts`                 | Registrierung aller IPC-Handler (Kanäle aus `shared/ipc.ts`)                          |
| `preload/yt.ts`               | Läuft in music.youtube.com: Audio-Engine (EQ), Player-Bridge (Status und Befehle)     |
| `preload/ui.ts`               | `contextBridge`-API für die Pegel-UI                                                  |
| `yt/selectors.ts`             | **Alle** DOM-Selektoren der YT-Seite an einer Stelle                                  |
| `yt/themes/yt-theme.ts`       | Erzeugt das Farb-CSS für die YT-Seite aus den Theme-Tokens                           |
| `renderer/`                   | React-App mit den Routen `/` (Titelleiste und EQ), `/settings`, `/welcome`, `/mini`   |
| `shared/`                     | Typen, IPC-Kanäle, Theme-Tokens, EQ-Presets, Layout-Konstanten                        |

### 3.2 Sicherheit

- Alle Fenster und Ansichten: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (wo möglich).
- **Navigations-Schutz** in der YT-Ansicht: Erlaubt sind `music.youtube.com`, `accounts.google.com`, `*.google.com`-Login- und Consent-Seiten sowie `consent.youtube.com`. Alle anderen Links öffnet `shell.openExternal` im Standardbrowser.
- Die Preload-API für die UI gibt nur konkrete Funktionen frei, niemals `ipcRenderer` direkt.
- Pegel liest und speichert keine Passwörter, Tokens oder Cookies außerhalb der Electron-Session-Partition.

---

## 4. Funktionen im Detail

### 4.1 YouTube-Music-Ansicht und Login

- Eigene Partition `persist:pegel`, damit der Login einen Neustart übersteht.
- **User-Agent:** Für YT Music den Electron-UA durch einen Chrome-UA ersetzen (Tokens `Electron/…` und `pegel/…` entfernen). Anfragen an `accounts.google.com` bekommen dagegen den **unveränderten Electron-UA**: Gibt sich die eingebettete Ansicht dort als Chrome aus, lehnt Google den Login mit „Dieser Browser oder diese App ist möglicherweise nicht sicher“ ab. Das gilt auch, wenn die Client Hints (`Sec-CH-UA`, `navigator.userAgentData`) passend auf „Google Chrome“ gesetzt werden; getestet im Oktober 2026. Pear Desktop (früher th-ch/youtube-music) macht es genauso.
- Läuft der Login trotzdem nicht durch: Den Login in einem eigenen `BrowserWindow` mit derselben Partition öffnen. Das ist der Plan B, siehe Risiken.
- Nach einem Netzwerkfehler zeigt die YT-Ansicht eine Pegel-eigene Fehlerseite mit dem Button „Erneut versuchen“.

### 4.2 Equalizer (Kernfunktion)

**Signalkette** (in `preload/yt.ts`, Teil der YT-Seite):

```
<video>/<audio> ──► MediaElementSource ──► Gain (Vorverstärkung)
   ──► LowShelf 31 Hz ──► Peaking 62 … 8k (Q ≈ 1.41) ──► HighShelf 16 kHz
   ──► DynamicsCompressor als Limiter (optional, Standard aus) ──► destination
```

- **Bänder:** 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k und 16k Hz, jeweils von −12 bis +12 dB in 0,5-dB-Schritten. Q = 1,41 entspricht ungefähr einer Oktave Bandbreite.
- **Vorverstärkung:** −12 bis +6 dB. Die Option „Automatisch“ setzt sie auf `-max(0, …gains)`, damit nichts übersteuert. Standard: an.
- **Media-Element finden:** Ein `MutationObserver` sucht das Element im YT-Player. `createMediaElementSource` darf pro Element **nur einmal** aufgerufen werden, deshalb merkt sich eine `WeakSet` die bereits angeschlossenen Elemente. Ersetzt YT das Element, wird das neue angeschlossen.
- **AudioContext:** Bei `play` per `resume()` aufwecken (Autoplay-Policy). Ist der Kontext `suspended`, während Audio läuft, gibt es Stille. Das muss abgefangen und geloggt werden.
- **Ausschalten:** Alle Gains sanft auf 0 setzen (`setTargetAtTime`, ca. 30 ms). Die Kette nicht umstecken, um Knackser zu vermeiden.
- **Änderungen** kommen per IPC von der UI über den Main-Prozess in die YT-Ansicht. Der Main-Prozess ist die einzige Quelle für die Werte und speichert sie.
- **Presets (eingebaut):** Flat, Bass Boost, Vocal, Akustik, Elektronisch, Loudness. Die Werte stehen in `shared/presets.ts`, abgestimmt mit dem Mockup.
- **Eigene Presets:** speichern, umbenennen, löschen. Ändert der Nutzer einen Regler, springt die Anzeige auf „Eigene“.
- **Frequenzkurve im Panel:** Die echte Kurve aus `BiquadFilterNode.getFrequencyResponse` berechnen (128 Punkte). Umgesetzt in der Pegel-UI mit denselben Filtern auf einem `OfflineAudioContext`, nicht in der YT-Ansicht: gleiche Kurve, funktioniert aber auch ohne geladene YT-Seite und braucht keinen IPC-Rückweg. Fallback: die Näherung aus dem Mockup.
- **Tastatur:** Strg/⌘+E klappt das Panel ein und aus. In den Reglern gilt: Pfeil hoch/runter = ±0,5 dB, Bild hoch/runter = ±3 dB, Doppelklick = 0 dB.

> Hinweis: Dieser Ansatz (Web Audio im Kontext der YT-Seite) wird von bestehenden Open-Source-Clients erfolgreich genutzt. YT Music spielt über MediaSource bzw. Blob-URLs ab, das Audio ist also _same-origin_ und für Web Audio zugänglich.

### 4.3 Player-Bridge

Läuft in `preload/yt.ts` und liefert dem Main-Prozess einen `PlayerState`:

```ts
interface PlayerState {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string; // größte verfügbare Auflösung
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  liked?: boolean;
}
```

- **Quellen, in dieser Reihenfolge:** `navigator.mediaSession.metadata` (am stabilsten), dann die Events des Media-Elements (`play`, `pause`, `timeupdate`, gedrosselt auf 1/s), zuletzt das DOM der Player-Leiste.
- **Befehle:** `playPause`, `next`, `previous`, `seek(sec)`, `setVolume`, `toggleLike`. Wo es geht, über das Media-Element (Play/Pause, Seek), sonst per Klick auf die Buttons der Player-Leiste. Die Selektoren stehen ausschließlich in `yt/selectors.ts`.
- **Selektor-Selbsttest** beim Start: Fehlt ein Selektor, schreibt Pegel eine Warnung ins Log und zeigt einen dezenten Hinweis in den Einstellungen („YouTube hat etwas geändert – Funktion X eingeschränkt“).

### 4.4 Themes

- **Tokens** in `shared/themes.ts`, identisch zum Mockup: `bg`, `surface`, `surface-2`, `surface-3`, `border`, `text`, `text-dim`, `accent`, `accent-soft`, `on-accent`.
- **Pegel-UI:** Die Tokens werden als CSS-Variablen auf `:root` gesetzt.
- **YT-Seite:** Das CSS wird aus den Theme-Tokens erzeugt (`yt/themes/yt-theme.ts`), statt eine CSS-Datei pro Theme zu pflegen. So bleibt `shared/themes.ts` die einzige Farbquelle, und ein neues Theme braucht nur Tokens. Eingespielt per `webContents.insertCSS()` nach jedem `dom-ready`, beim Theme-Wechsel live ausgetauscht (`removeInsertedCSS`). Das Standard-Theme bekommt kein Override, es ist der Original-Look von YT. YT Music definiert seine Farben als Variablen auf `html` (`--ytmusic-…`, `--yt-sys-color-baseline--…`, `--paper-…`; `--yt-spec-…` gibt es dort nicht mehr). Die Zuordnung Token → Variablen steht in `YT_COLOR_ROLES`. Farben, die YT direkt an einzelnen Elementen setzt, stehen in `YT_ELEMENT_COLORS` (bisher: der Verlauf des Fortschrittsbalkens an `#progress-bar`). Google-Login- und Consent-Seiten werden nicht eingefärbt.
- **Grundsatz:** Nur Farben überschreiben, keine Abstände und kein Layout. So geht bei Updates von Google wenig kaputt.
- **Windows:** Die Fenstersteuerung kommt über `titleBarOverlay`. Bei einem Theme-Wechsel `setTitleBarOverlay({ color, symbolColor })` aufrufen.
- **Sakura-Extra:** Ein paar Blütenblätter in der Titelleiste, wie im Mockup. Optional später: eine dezente Animation (respektiert `prefers-reduced-motion`).
- **Themes in v1:** Standard, Sakura, Nordlicht, Bernstein. Weitere sind später leicht ergänzbar: Tokens plus YT-CSS.

### 4.5 Fenster und Titelleiste

- **Windows:** `titleBarStyle: 'hidden'` und `titleBarOverlay` mit einer Höhe von 38 px. Die nativen Buttons für Minimieren, Maximieren und Schließen zeichnet Windows (Snap-Layouts funktionieren).
- **macOS:** `titleBarStyle: 'hiddenInset'`, `trafficLightPosition` so wählen, dass die Ampel vertikal in der 38-px-Leiste zentriert ist. Das Logo beginnt rechts davon (ca. 80 px Abstand links).
- **Titelleiste:** Logo und „Pegel“ links. Rechts die Buttons Equalizer, Mini-Player und Einstellungen.
  - Das Logo ist klickbar und führt immer zurück zur Musik.
  - Aktiver Zustand: Der Button der gerade sichtbaren Ansicht ist hervorgehoben (`accent-soft`-Hintergrund, Akzentfarbe). Auf der Einstellungsseite also der Einstellungen-Button, beim offenen EQ-Panel der Equalizer-Button. Es ist nie mehr als einer gleichzeitig aktiv.
  - Ein Klick auf „Equalizer“ von einer Pegel-Seite aus führt zurück zur Musik und öffnet das Panel.
- **Pegel-Seiten** (Einstellungen usw.) haben links neben der Überschrift einen Zurück-Pfeil.
- **Fensterposition und -größe** speichern und wiederherstellen. Mindestgröße: 900 × 600.
- **Kurzbefehle** (Strg unter Windows, ⌘ unter macOS):

  | Kürzel     | Aktion                    |
  | ---------- | ------------------------- |
  | Strg/⌘ + E | Equalizer ein-/ausklappen |
  | Strg/⌘ + M | Mini-Player               |
  | Strg/⌘ + , | Einstellungen             |
  | Esc        | zurück zur Musik          |

### 4.6 Tray, Medientasten, Hintergrund

- **Tray-Menü:** aktueller Titel (deaktiviert, nur Anzeige), Play/Pause, Weiter, Zurück, EQ-Preset (Untermenü), Mini-Player, Fenster anzeigen, Beenden.
- **Windows:** Ein Linksklick auf das Tray-Symbol zeigt das Fenster. „Schließen“ minimiert in den Infobereich, wenn die Einstellung an ist (Standard: an). Beim ersten Mal erscheint ein Hinweis: „Pegel läuft im Hintergrund weiter“.
- **macOS:** Menüleisten-Symbol als Template-Image (schwarz/transparent, `…Template.png`). Schließen versteckt das Fenster, die App bleibt im Dock (macOS-Konvention). Ein Klick aufs Dock-Symbol zeigt das Fenster wieder.
- **Medientasten:** Chromium bindet die MediaSession der YT-Seite automatisch an die Systemsteuerung (Windows-Medienüberlagerung, macOS „Now Playing“). Zuerst prüfen, ob das ohne Zusatzcode reicht. Fallback: `globalShortcut` für `MediaPlayPause`, `MediaNextTrack` und `MediaPreviousTrack`. Unter macOS braucht das ggf. die Bedienungshilfen-Berechtigung, deshalb nur als Fallback.
- **Single Instance:** Ein zweiter Start fokussiert das bestehende Fenster.

### 4.7 Mini-Player

- Eigenes rahmenloses `BrowserWindow` (360 × 150), Route `/mini`, verschiebbar über die ganze Fläche außer den Buttons.
- **Inhalt:** Cover, Titel, Interpret, EQ-Badge (aktives Preset), Fortschritt, Like, Zurück, Play/Pause, Weiter, Lautstärke, Pin (immer im Vordergrund) und Vergrößern (zurück zum Hauptfenster).
- Position merken. Beim Öffnen wird das Hauptfenster minimiert bzw. versteckt (einstellbar).
- Daten kommen ausschließlich über den `PlayerState` vom Main-Prozess. Der Mini-Player hat keinen eigenen Zugriff auf YT.

### 4.8 Autostart

- `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`. Unter macOS wird `openAsHidden` bzw. das Argument im Main-Prozess ausgewertet.
- Mit `--hidden` startet Pegel nur im Tray, ohne Fenster.
- Standard: aus. Die Einstellung ist abschaltbar.

### 4.9 Discord-Status

- Aktivitätstyp „Listening“ (Hört): Details = Titel, State = Interpret, großes Bild = Cover-URL, Zeitstempel für den Fortschritt.
- **Benötigt eine Discord-Application-ID.** Johann legt im Discord Developer Portal eine Application „Pegel“ an und trägt die ID in `src/main/config.ts` ein (die ID ist nicht geheim).
- Updates nur bei Titelwechsel, Pause und Fortsetzen. Bei Pause wird der Status optional ausgeblendet.
- Läuft Discord nicht, Pegel still im Hintergrund alle 30 s neu verbinden lassen, ohne Fehlermeldung an den Nutzer.

### 4.10 Einstellungen und Willkommensseite

- **Einstellungsseite** wie im Mockup, mit den Abschnitten:
  - Darstellung: Theme-Karten
  - Wiedergabe & System: Tray, Autostart, Medientasten, Mini-Player immer im Vordergrund
  - Integrationen: Discord
  - Über: Version, Hinweis „Inoffiziell, nicht mit Google verbunden“, Abmelden
- **Abmelden:** Session-Daten der Partition `persist:pegel` löschen und die YT-Ansicht neu laden.
- **Willkommensseite** beim allerersten Start. Ein Klick auf „Mit Google-Konto anmelden“ öffnet den Login von YT Music.
- **Geschenk-Build für den Kumpel:** Eine Datei `build-profiles/<name>.json` legt Standard-Theme und persönliche Nachricht fest:

  ```json
  { "defaultTheme": "sakura", "welcomeMessage": "Hey! …", "welcomeFrom": "Johann" }
  ```

  Gebaut wird per `npm run dist -- --profile=<name>` (oder eine Umgebungsvariable). Ohne Profil zeigt die Seite keine Nachricht.

### 4.11 Einstellungs-Schema (v1)

```ts
interface Settings {
  version: 1;
  theme: 'standard' | 'sakura' | 'nordlicht' | 'bernstein';
  eq: {
    enabled: boolean;
    preset: string; // Name des eingebauten oder eigenen Presets, oder 'Eigene'
    gains: number[]; // Länge 10, -12…12
    preamp: number; // -12…6
    autoPreamp: boolean;
    panelOpen: boolean;
    customPresets: { name: string; gains: number[]; preamp: number }[];
  };
  closeToTray: boolean;
  startAtLogin: boolean;
  mini: { alwaysOnTop: boolean; bounds?: Rect; hideMainOnOpen: boolean };
  discord: { enabled: boolean; hideWhenPaused: boolean };
  window: { bounds?: Rect; maximized: boolean };
  welcomeShown: boolean;
}
```

---

## 5. Projektstruktur

```
pegel/  (= D:\Projects\ytmusic)
├─ CLAUDE.md
├─ README.md                  ← Anleitung für Nutzer (Installation, SmartScreen/Gatekeeper)
├─ docs/PLAN.md               ← dieses Dokument
├─ design/mockup.html         ← Design-Referenz
├─ build-profiles/            ← Geschenk-Builds (z. B. kumpel.json)
├─ resources/                 ← Icons (.ico, .icns, Tray-PNGs, Template-Images)
├─ src/
│  ├─ main/  (index, config, ipc, settings, tray, discord, autostart, yt-view, windows/)
│  ├─ preload/ (yt.ts, ui.ts)
│  ├─ yt/    (selectors.ts, audio/eq.ts, player/bridge.ts, themes/*.css)
│  ├─ renderer/ (React: routes/, components/, styles/)
│  └─ shared/ (types.ts, ipc.ts, themes.ts, presets.ts, layout.ts)
├─ tests/   (unit/, e2e/)
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ package.json
```

---

## 6. Meilensteine

Die Meilensteine werden in dieser Reihenfolge abgearbeitet. Jeder endet mit einer lauffähigen App und einem Commit. Häkchen setzen, wenn ein Punkt erledigt ist.

### M0 – Grundgerüst

- [x] Projekt mit electron-vite (React und TypeScript), ESLint und Prettier, Vitest
- [x] Git-Repo, `.gitignore`, `npm run dev`, `npm run build`, `npm test`
- [x] Ordnerstruktur wie in Abschnitt 5, `shared/`-Grundtypen und IPC-Kanäle
- **Fertig, wenn:** Ein leeres Pegel-Fenster startet mit Hot Reload.

### M1 – YT Music im eigenen Fenster

- [x] Hauptfenster mit eigener Titelleiste (Windows-Overlay bzw. macOS-Ampel)
- [x] YT-Ansicht mit Partition, User-Agent, Bounds-Layout, Navigations-Schutz
- [x] Login mit Google funktioniert und übersteht einen Neustart
- [x] Fensterposition und -größe gespeichert, Single-Instance-Lock
- **Fertig, wenn:** Johann sich anmelden und Musik hören kann. Externe Links öffnen im Browser.

### M2 – Equalizer

- [x] Audio-Engine in `preload/yt.ts`, inklusive Wiederanschluss bei neuem Media-Element
- [x] EQ-Panel wie im Mockup: Regler, Presets, Kurve, Vorverstärkung, an/aus
- [x] Werte gespeichert und nach dem Neustart aktiv, eigene Presets
- [x] Unit-Tests für Presets und Gain-Begrenzung, manueller Hörtest (Bass Boost deutlich hörbar, kein Knacksen beim Umschalten)
- **Fertig, wenn:** Der EQ hörbar wirkt, auch nach Titelwechsel, Seitenwechsel und Neustart.

### M3 – Themes

- [x] Theme-Tokens, Pegel-UI themed
- [x] YT-CSS für alle 4 Themes, Titelleisten-Overlay-Farben (Windows)
- [x] Sakura-Blütenblätter
- **Fertig, wenn:** Ein Theme-Wechsel sofort wirkt, ohne Neuladen. YT bleibt gut lesbar (Kontrast prüfen).

### M4 – Player-Bridge, Tray, Medientasten, Autostart

- [ ] `PlayerState` und Befehle, `yt/selectors.ts` mit Selbsttest
- [ ] Tray mit Menü, Schließen in den Tray, macOS-Menüleiste
- [ ] Medientasten verifizieren (ggf. Fallback)
- [ ] Autostart mit `--hidden`
- **Fertig, wenn:** Pegel minimiert weiterspielt und per Tray und Tastatur steuerbar ist.

### M5 – Mini-Player

- [ ] Fenster, Layout wie im Mockup, Pin, Position merken
- **Fertig, wenn:** Der Mini-Player den Titel live anzeigt und alle Buttons funktionieren.

### M6 – Discord-Status

- [ ] RPC mit Reconnect, Einstellungen
- **Fertig, wenn:** Discord „Hört Pegel“ mit Titel, Interpret und Cover anzeigt.

### M7 – Einstellungen und Willkommensseite

- [ ] Einstellungsseite komplett, Abmelden
- [ ] Willkommensseite und Build-Profile
- **Fertig, wenn:** Der erste Start mit dem Kumpel-Profil Sakura und die Nachricht zeigt.

### M8 – Paketierung und Weitergabe

- [ ] App-Icon (Pegel-Balken) als `.ico`, `.icns` und Tray-Varianten
- [ ] Windows-NSIS-Installer (x64), Startmenü-Eintrag, Deinstallation
- [ ] macOS-DMG (arm64 und x64), ad-hoc signiert (auf Apple Silicon Pflicht)
- [ ] Optional: GitHub-Actions-Workflow, der beide Plattformen baut
- [ ] README für Nutzer: Installation, SmartScreen-Hinweis („Weitere Informationen → Trotzdem ausführen“), macOS-Gatekeeper (Rechtsklick → Öffnen bzw. „Trotzdem öffnen“ in den Systemeinstellungen)
- **Fertig, wenn:** Der Installer auf einem frischen Windows-PC funktioniert und das DMG auf Johanns MacBook.

### Später (optional)

- Auto-Update über GitHub Releases (`electron-updater`). Unter Windows geht das auch unsigniert, unter macOS nur signiert.
- `music.youtube.com`-Links direkt in Pegel öffnen (Protokoll- bzw. Link-Handler)
- Liedtexte im Seitenpanel, Last.fm-Scrobbling, weitere Themes, Lautstärkeangleichung zwischen Titeln

---

## 7. Risiken

| Risiko                                              | Wahrscheinlichkeit | Gegenmaßnahme                                                                                                                                                       |
| --------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google blockiert den Login im eingebetteten Browser | mittel             | Original-Electron-UA für `accounts.google.com`, Chrome-UA für YT Music. Plan B: Login im separaten Fenster mit derselben Partition                                                                                       |
| Google ändert das DOM (Selektoren brechen)          | hoch, regelmäßig   | Selektoren zentral in `yt/selectors.ts`, MediaSession bevorzugen, Selbsttest. Der EQ hängt nur am Media-Element und ist damit robust                                |
| Theme-CSS bricht nach YT-Update                     | mittel             | Nur Farben überschreiben. Im Zweifel bleibt der Standard-Look, die Funktion geht nicht verloren                                                                     |
| Einzelne Inhalte brauchen DRM (Widevine)            | niedrig            | Standard-Electron hat kein Widevine. Tritt das auf, auf den castLabs-Electron-Build (mit Widevine) wechseln                                                         |
| AudioContext stumm (Autoplay-Policy)                | niedrig            | `resume()` bei `play`, Überwachung und Log                                                                                                                          |
| Nutzungsbedingungen von YouTube                     | niedrig            | Kein Blocken von Werbung, kein Download, Wiedergabe nur über die offizielle Seite mit eigenem Konto. Pegel nicht öffentlich mit YouTube-Logo bzw. -Marke verbreiten |
| Unsignierte App: Warnungen unter Windows und macOS  | sicher             | Kurzanleitung in der README. Signierung bewusst nicht in v1                                                                                                         |

---

## 8. Test-Checkliste (manuell, vor jeder Weitergabe)

- [ ] Frischer Start: Willkommensseite, Login, Musik startet
- [ ] EQ: jedes Preset hörbar, an/aus ohne Knacksen, nach Titelwechsel aktiv, nach Neustart aktiv
- [ ] Alle 4 Themes: YT lesbar, Fortschrittsbalken und Akzente passen, Titelleisten-Buttons (Windows) passen
- [ ] Gemeinsame Playlist öffnen, Song hinzufügen
- [ ] Fenster schließen: Musik läuft weiter (Tray). Tray-Menü funktioniert. Beenden beendet wirklich
- [ ] Medientasten der Tastatur und Medienüberlagerung des Systems
- [ ] Mini-Player: alle Buttons, Pin, Position nach Neustart
- [ ] Autostart an: nach Neuanmeldung im Tray
- [ ] Discord: Status erscheint, verschwindet bei Pause (falls eingestellt)
- [ ] Abmelden und erneut anmelden
- [ ] Windows: installieren, starten, deinstallieren. macOS: DMG öffnen, App starten
