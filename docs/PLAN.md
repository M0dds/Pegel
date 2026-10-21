# Pegel – Projektplan

Pegel ist ein inoffizieller Desktop-Client für YouTube Music für Windows und macOS. Er bindet die echte Seite music.youtube.com in ein eigenes Fenster ein und ergänzt sie um:

- einen 10-Band-Equalizer,
- Farb-Themes,
- einen Mini-Player,
- ein Tray-Symbol mit Medientasten,
- Autostart,
- einen Discord-Status.

Pegel ist ein privates Hobbyprojekt für Johann und Freunde. Der Quellcode und die Installer liegen öffentlich auf GitHub (`M0dds/Pegel`), damit der Download-Link und die Updates funktionieren. Pegel wird nicht verkauft und nicht mit YouTube-Logo oder -Marke beworben.

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
- **Neue Playlists:** YT Music lädt die Seitenleiste nur beim Laden der Seite (auch im Browser). Pegel erkennt eine erfolgreich angelegte Playlist an YTs Anfrage `youtubei/v1/playlist/create` (`webRequest.onCompleted`). Ohne Wiedergabe lädt es YT nach 1,5 s neu, bei laufender Musik zeigt die Titelleiste „Neue Playlist angelegt · Jetzt aktualisieren“. F5, Strg/⌘+R und der Neuladen-Button in der Titelleiste laden jederzeit neu, auch bei laufender Musik (YTs „Seite verlassen?“-Abfrage wird übergangen; die Wiedergabe stoppt dabei).

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
- **Eigene Presets** (überarbeitet nach M2): Der Chip „+ Preset“ öffnet ein Overlay mit Name und Vorlage (aktuelle Einstellung, Standard- oder eigenes Preset) samt Vorschaukurve. Das neue Preset ist danach ausgewählt.
  - Beim Verstellen bleibt das Preset ausgewählt. Der Chip bekommt einen Punkt, unten erscheint eine Leiste mit „Verwerfen“, „Als neues Preset“ und, nur bei eigenen Presets, „Speichern“. Standard-Presets sind schreibgeschützt.
  - Umbenennen und Löschen über das „⋯“ an eigenen Preset-Chips (auch Rechtsklick; Doppelklick öffnet direkt Umbenennen). Löschen fragt nach, danach ist Flat aktiv.
  - Die Regler stehen ohne Skala gleichmäßig über die Panelbreite, mit durchgehender 0-dB-Linie. Werte ungleich 0 sind hervorgehoben.
- **Playlist-Presets** (Wunsch nach M5): Einer YT-Playlist lässt sich ein Preset zuordnen.
  - Erkennung: Playlist-ID über YTs Player-API (`getPlaylistId()`), weil die URL bei eingeklapptem Player die Playlist-Seite statt `/watch` zeigt; `list=` der `/watch`-URL ist die Rückfallebene. Name aus dem Warteschlangen-Kopf (`queueTitle`), sonst aus der Überschrift der Playlist-Seite. Beides kommt mit dem `PlayerState` (`playlistId`, `playlistTitle`).
  - Zuordnen im EQ-Panel (Zeile „Preset für diese Playlist“): für die angezeigte Playlist-Seite, sonst für die laufende Playlist. Sofort angewendet wird nur, wenn diese Playlist gerade läuft. Verwalten und Entfernen in den Einstellungen unter „Playlist-Presets“.
  - Automatik: Beim Wechsel in die Playlist schaltet der EQ auf ihr Preset und merkt sich das vorherige (`eq.autoPreset.from`). Beim Verlassen kommt es zurück. Wählt man in der Zwischenzeit selbst ein Preset, bleibt diese Wahl. Umbenennen zieht die Zuordnungen mit, Löschen entfernt sie.
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
- **Befehle:** `playPause`, `next`, `previous`, `seek(sec)`, `setVolume`, `toggleLike`. `setVolume` läuft über YTs Player-API (`#movie_player.setVolume`) per `contextBridge.executeInMainWorld`, weil `video.volume` YTs eigenen Lautstärkezustand umgeht. Wo es geht, über das Media-Element (Play/Pause, Seek), sonst per Klick auf die Buttons der Player-Leiste. Die Selektoren stehen ausschließlich in `yt/selectors.ts`.
- **Selektor-Selbsttest** beim Start: Fehlt ein Selektor, schreibt Pegel eine Warnung ins Log und zeigt einen dezenten Hinweis in den Einstellungen („YouTube hat etwas geändert – Funktion X eingeschränkt“).

### 4.4 Themes

- **Tokens** in `shared/themes.ts`, identisch zum Mockup: `bg`, `surface`, `surface-2`, `surface-3`, `border`, `text`, `text-dim`, `accent`, `accent-soft`, `on-accent`.
- **Pegel-UI:** Die Tokens werden als CSS-Variablen auf `:root` gesetzt.
- **YT-Seite:** Das CSS wird aus den Theme-Tokens erzeugt (`yt/themes/yt-theme.ts`), statt eine CSS-Datei pro Theme zu pflegen. So bleibt `shared/themes.ts` die einzige Farbquelle, und ein neues Theme braucht nur Tokens. Eingespielt per `webContents.insertCSS()` nach jedem `dom-ready`, beim Theme-Wechsel live ausgetauscht (`removeInsertedCSS`). Das Standard-Theme bekommt kein Override, es ist der Original-Look von YT. YT Music definiert seine Farben als Variablen auf `html` (`--ytmusic-…`, `--yt-sys-color-baseline--…`, `--paper-…`; `--yt-spec-…` gibt es dort nicht mehr). Die Zuordnung Token → Variablen steht in `YT_COLOR_ROLES`. Farben, die YT direkt an einzelnen Elementen setzt, stehen in `YT_ELEMENT_COLORS` (bisher: der Verlauf des Fortschrittsbalkens an `#progress-bar`). Google-Login- und Consent-Seiten werden nicht eingefärbt.
- **Grundsatz (aktualisiert):** Die YT-Seite darf über Farben hinaus gestaltet werden, solange es robust bleibt: Variablen bevorzugen, Selektoren zentral, Bedienung von YT nie blockieren. Ursprünglich galt „nur Farben“.
  - **Bisher umgesetzt** (`buildYtPolishCss`, in allen Themes): schmale Scrollleisten in Theme-Farben ohne Pfeile (YTs `scrollbar-color` wird dafür auf `auto` gesetzt, sonst ignoriert Chromium `::-webkit-scrollbar`), Kontextmenüs mit 10 px Radius, Rahmen und Schatten per `box-shadow`, ohne horizontale Scrollleiste. Außerdem ein YT-Bugfix: Der Verlauf hinter Seitenköpfen kachelt sonst als Streifen über die Seite. 
  - **Pegel-Themes** ersetzen das Albumcover-Licht oben auf Übersichtsseiten durch einen dunklen Verlauf mit etwas Akzentfarbe (Cover nur per `opacity` ausgeblendet) und färben `body` ein, das YT fest auf `#030303` setzt.
- **Windows/Linux:** Die Fenster-Buttons zeichnet Pegel selbst (siehe 4.5), sie folgen dem Theme automatisch.
- **Theme-Effekte** (`shared/effects/`, Einstellung `effects.theme`, Standard an, ein Schalter für das jeweils aktive Theme; ersetzt `effects.petals` aus 1.1.0, alte Einstellung wird übernommen): reine CSS-Animationen auf `transform`/`opacity`, `pointer-events: none`, Farben aus den Theme-Tokens (`--fx-accent`, `--fx-text`, `--fx-bg`, Nebenfarben per `oklch(from …)` abgeleitet), live beim Theme-Wechsel ausgetauscht. In der Pegel-UI und über der YT-Seite (dort etwas mehr Partikel). Ein Effekt besteht aus Teilen für die hintere und/oder vordere Ebene (`#pegel-fx` mit `display: contents`, darin `.fx-back` und `.fx-front`).
  - **Vorne** (wie die Blütenblätter, bei „Bewegung reduzieren“ aus): Sakura fallende Blütenblätter in zwei Rosatönen (8/14), Glut aufsteigende Funken (ein Hitzeflimmern am unteren Rand war kurz drin und ist auf Johanns Wunsch wieder raus), Bernstein schwebender Lichtstaub, Lagune aufsteigende Luftblasen (große steigen schneller, kleine wackeln schneller, alle werden nach oben etwas größer und blenden aus, Rand von oben beleuchtet, Glanzpunkt und zweite Spiegelung, manche ziehen zwei winzige hinter sich her), Wald Glühwürmchen und ein paar fallende Blätter. (Ein Mond mit Phasen bei Mitternacht und angedeutete Tannen bei Wald waren kurz drin und sind auf Johanns Wunsch wieder raus.) Ohne Animation bleiben bei Sakura die statischen Blätter aus dem Mockup in der Titelleiste.
  - **Hinten** (hinter dem Inhalt, bei „Bewegung reduzieren“ stehend): Nordlicht echtes Polarlicht auf einem Canvas, hoch oben im Bild (Unterkanten zwischen 13 und 42 % der Höhe, zur Fenstermitte hin ausgeblendet; diagonal über den Himmel laufende, sich faltende Vorhänge mit feinen senkrechten Strahlen, hell-scharfe Unterkante, nach oben ausblendend, grün mit violetten Spitzen, ruhig wogend und flimmernd, darüber feine Sterne; auf Johanns Wunsch gedämpft: zwei Vorhänge, Deckkraft 0,38; gezeichnet in einem Drittel der Auflösung und hochskaliert, etwa 20 Bilder pro Sekunde, nur solange die Seite sichtbar ist, bei „Bewegung reduzieren“ ein Standbild); Lagune Licht, das durch die Wasseroberfläche fällt (türkise, gestreifte Lichtbänder oben, früher das Nordlicht); Mitternacht funkelnder Sternenhimmel (dreht sich langsam, helle Sterne mit Lichtkreuz, drei Sternschnuppen mit eigenen Takten). Bernstein Lichtstrahlen von links oben; Wald ein schwacher Lichtschein oben und treibender Nebel bis an den unteren Rand (Bodennebel ab der Fensterkante, das untere Nebelband reicht unter den Rand, so bleibt unten kein dunkler Streifen); Neon ein ruhiger Cyberpunk-Hintergrund (magenta Schein über einer dünnen Neon-Horizontlinie, darunter ein Perspektiv-Gitter, wenig feiner Regen, schwache Scanlines; die Häuser-Skyline wurde auf Johanns Wunsch wieder entfernt).
  - Auf der YT-Seite liegt die hintere Ebene bei `z-index: -1`; `body` wird dafür durchsichtig (die Farbe bleibt auf `html`), und der Pegel-Verlauf oben auf Übersichtsseiten blendet nach transparent statt nach `bg` aus. In der Pegel-UI scheint sie durch Titelleiste und Pegel-Seiten. Der Einstellungs-Hinweis sagt, was „Bewegung reduzieren“ mit dem Effekt macht (`reducedMotionHint`).
  - **Neon** ist insgesamt mehr Cyberpunk: tieferes Violett, magentafarbene Linien, leuchtende Akzente in der Pegel-UI (Schalter, aktive Chips, EQ-Kurve, Play im Mini-Player) und ein leuchtender Fortschrittsbalken auf der YT-Seite (`buildYtGlowCss`). **Sakura** hat stärkere Kontraste: fast schwarzer Hintergrund, helleres Rosa.
  - Standard und Mono bleiben schlicht.
- **Visualizer** hinter der Player-Leiste (`effects.visualizer`, Standard an): Frequenzbalken mit Spitzen-Kappen in der Akzentfarbe, Daten aus einem `AnalyserNode` am Ende der EQ-Kette, logarithmische Bänder 40 Hz bis 16 kHz, 30 fps, nur während der Wiedergabe. YTs Lautstärke wird über das dB-Fenster des Analysers ausgeglichen. Canvas mit `z-index: -1` in YTs Player-Leiste (eigener Stapelkontext): über deren Hintergrund, unter den Bedienelementen.
  - Hinweis zum Testen: Liegt das Fenster komplett verdeckt hinter anderen, rendert Chromium unter Windows keine Frames (native Verdeckungsberechnung). Für Tests mit verdecktem Fenster `npm run dev -- -- --disable-features=CalculateNativeWinOcclusion`.
- **Themes:** Standard, Sakura, Nordlicht, Bernstein sowie (nach M5 ergänzt, kontrastreicher) Mitternacht, Lagune, Glut, Wald, Neon und Mono. Ein neues Theme braucht nur Tokens in `shared/themes.ts`; die Kontrast-Tests prüfen es automatisch. Auswahl in den Einstellungen als kompakte Chips.

### 4.5 Fenster und Titelleiste

- **Windows/Linux:** `titleBarStyle: 'hidden'` ohne Overlay. Minimieren, Maximieren/Wiederherstellen und Schließen sind eigene Buttons in der Titelleiste (Hover wie die übrigen Titelleisten-Buttons). Größe ändern, an den Bildschirmrand ziehen und Win+Pfeiltasten funktionieren weiter; nur das Snap-Layout-Menü beim Überfahren von „Maximieren“ entfällt (bewusst, Wunsch von Johann).
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
  | F5, Strg/⌘ + R | YT Music neu laden (z. B. wenn die Seitenleiste eine neue Playlist nicht zeigt) |

### 4.6 Tray, Medientasten, Hintergrund

- **Tray-Menü:** aktueller Titel (deaktiviert, nur Anzeige), Play/Pause, Weiter, Zurück, EQ-Preset (Untermenü), Mini-Player, Fenster anzeigen, Beenden.
- **Windows:** Ein Linksklick auf das Tray-Symbol zeigt das Fenster. „Schließen“ minimiert in den Infobereich, wenn die Einstellung an ist (Standard: an). Beim ersten Mal erscheint ein Hinweis: „Pegel läuft im Hintergrund weiter“.
- **macOS:** Menüleisten-Symbol als Template-Image (schwarz/transparent, `…Template.png`). Schließen versteckt das Fenster, die App bleibt im Dock (macOS-Konvention). Ein Klick aufs Dock-Symbol zeigt das Fenster wieder.
- **Medientasten:** Chromium bindet die MediaSession der YT-Seite automatisch an die Systemsteuerung (Windows-Medienüberlagerung, macOS „Now Playing“). Zuerst prüfen, ob das ohne Zusatzcode reicht. **Ergebnis Windows (M4):** reicht. Pegel erscheint als Mediensitzung (SMTC) mit Titel, Interpret und Weiter/Zurück; Steuerung von außen funktioniert. Fallback (nur falls macOS es braucht): `globalShortcut` für `MediaPlayPause`, `MediaNextTrack` und `MediaPreviousTrack`. Unter macOS braucht das ggf. die Bedienungshilfen-Berechtigung, deshalb nur als Fallback.
- **Single Instance:** Ein zweiter Start fokussiert das bestehende Fenster.

### 4.7 Mini-Player

- Eigenes rahmenloses `BrowserWindow` (360 × 150), Route `/mini`, verschiebbar über die ganze Fläche außer den Buttons.
- **Inhalt:** Cover, Titel, Interpret, EQ-Badge (aktives Preset), Fortschritt, Like, Zurück, Play/Pause, Weiter, Lautstärke, Pin (immer im Vordergrund) und Vergrößern (zurück zum Hauptfenster).
- Position merken. Beim Öffnen wird das Hauptfenster minimiert bzw. versteckt (einstellbar).
- Daten kommen ausschließlich über den `PlayerState` vom Main-Prozess. Der Mini-Player hat keinen eigenen Zugriff auf YT.
- **Umsetzung (M5):** Lautstärke-Button schaltet stumm, beim Überfahren erscheint ein kleiner Regler (Mausrad: ±5 %). Der Fortschritt wird zwischen den Updates flüssig interpoliert, ein Klick spult. Öffnen über Titelleiste, Strg+M (macOS: ⌘M über das Fenster-Menü, „Im Dock ablegen“ liegt dort auf ⌥⌘M) und Tray.
- `PlayerState` enthält dafür zusätzlich `volume` (0…1) und `muted`.

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
- **Geschenk-Build** (z. B. für den Kumpel oder die Freundin): Eine Datei `build-profiles/<name>.json` legt nur das Theme für den allerersten Start fest. Eine persönliche Nachricht gibt es bewusst nicht, die Willkommensseite ist für alle gleich.

  ```json
  { "defaultTheme": "sakura" }
  ```

  Gebaut wird per `npm run dist -- --profile=<name>` (oder `PEGEL_PROFILE=<name>`). `scripts/dist.mjs` prüft das Profil, legt es als `resources/profile.json` neben die App und hängt den Namen an den Installer an. In der Entwicklung reicht `PEGEL_PROFILE=<name> npm run dev`.
- **Willkommensseite:** erscheint nur beim ersten Start und nur, wenn niemand angemeldet ist („Mit Google-Konto anmelden“ öffnet Googles Anmeldung, „Ohne Anmeldung weiter“ geht direkt zur Musik).
- **Medientasten** sind ein Chromium-Schalter (`HardwareMediaKeyHandling`) und wirken deshalb erst nach einem Neustart; die Einstellungen sagen das an.

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
    playlistPresets: { playlistId: string; title: string; preset: string }[];
    autoPreset?: { from: string };   // gesetzt, solange ein Playlist-Preset automatisch aktiv ist
  };
  closeToTray: boolean;
  startAtLogin: boolean;
  mediaKeys: boolean;              // Medientasten / System-Medienanzeige, wirkt nach Neustart
  mini: { alwaysOnTop: boolean; bounds?: Rect; hideMainOnOpen: boolean };
  discord: { enabled: boolean; hideWhenPaused: boolean };
  window: { bounds?: Rect; maximized: boolean };
  welcomeShown: boolean;
  trayHintShown: boolean;          // einmaliger Hinweis „läuft im Hintergrund weiter“ (Windows)
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
├─ server/  ← Cloudflare Worker für Freunde und Party (M10), eigenes package.json
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

- [x] `PlayerState` und Befehle, `yt/selectors.ts` mit Selbsttest
- [x] Tray mit Menü, Schließen in den Tray, macOS-Menüleiste (macOS noch ungetestet)
- [x] Medientasten verifizieren (ggf. Fallback): Windows über SMTC ohne Zusatzcode, kein Fallback nötig; macOS noch prüfen
- [x] Autostart mit `--hidden` (versteckter Start geprüft; die Registrierung als Login-Item greift nur im Installer-Build, Test in M8)
- **Fertig, wenn:** Pegel minimiert weiterspielt und per Tray und Tastatur steuerbar ist.

### M5 – Mini-Player

- [x] Fenster, Layout wie im Mockup, Pin, Position merken
- **Fertig, wenn:** Der Mini-Player den Titel live anzeigt und alle Buttons funktionieren.

### M6 – Discord-Status (zurückgestellt)

> Auf Wunsch von Johann vorerst nicht umgesetzt, bleibt als offenes Thema. Braucht eine Discord-Application-ID (siehe 4.9).

- [ ] RPC mit Reconnect, Einstellungen
- **Fertig, wenn:** Discord „Hört Pegel“ mit Titel, Interpret und Cover anzeigt.

### M7 – Einstellungen und Willkommensseite

- [x] Einstellungsseite komplett, Abmelden
- [x] Willkommensseite und Build-Profile
- **Fertig, wenn:** Der erste Start mit dem Kumpel-Profil Sakura zeigt (geprüft; die persönliche Nachricht wurde auf Wunsch gestrichen).

### M8 – Paketierung und Weitergabe

- [x] App-Icon (Pegel-Balken) als `.ico`, `.icns` und Tray-Varianten. Erzeugt mit `scripts/make-icons.mts`. Die Tray-Icons rendert `src/main/tray-icon.ts` zur Laufzeit.
- [x] Windows-NSIS-Installer (x64), Startmenü-Eintrag, Deinstallation. Normaler Build und Kumpel-Build sind gebaut. Die entpackte App startet mit dem Profil-Theme. Offen: Installieren, Deinstallieren und Autostart am echten Installer testet Johann.
- [ ] macOS-DMG (arm64 und x64), ad-hoc signiert (auf Apple Silicon Pflicht). Die Konfiguration und `scripts/after-pack.cjs` stehen, aber unter Windows lässt sich das nicht bauen. Build über den Workflow oder auf dem MacBook, Test auf dem MacBook ist offen.
- [x] Optional: GitHub-Actions-Workflow, der beide Plattformen baut (`.github/workflows/build.yml`, manuell startbar, optional mit Profil)
- [x] README für Nutzer: Installation, SmartScreen-Hinweis („Weitere Informationen → Trotzdem ausführen“), macOS-Gatekeeper (Rechtsklick → Öffnen bzw. „Trotzdem öffnen“ in den Systemeinstellungen)
- **Fertig, wenn:** Der Installer auf einem frischen Windows-PC funktioniert und das DMG auf Johanns MacBook.

### M9 – Release 1.0 (auf Wunsch von Johann vorgezogen)

- [x] **Links in Pegel öffnen.** Unsignierte Apps dürfen unter Windows und macOS keine einzelne Website übernehmen. Ein Klick in Discord öffnet also weiterhin den Browser. Stattdessen:
  - Beim Wechsel ins Fenster erkennt Pegel einen kopierten YT-Link (Titel, Playlist, Album, Künstler, auch `youtu.be` und `youtube.com/watch`). In der Titelleiste erscheint dann „Kopierter Link: … · Öffnen“.
  - Links lassen sich aufs Fenster ziehen.
  - Was beim letzten Fokusverlust schon in der Zwischenablage lag (also in Pegel selbst kopiert wurde), wird nicht angeboten.
  - Abschaltbar über die Einstellung „Kopierte Links erkennen“ (`src/shared/links.ts`, `src/shared/link-drop.ts`).
- [x] **Updates über GitHub Releases** (`M0dds/Pegel`):
  - Windows: `electron-updater` lädt im Hintergrund und zeigt „Update auf … bereit · Neu starten“. Das Update installiert sich auch beim Beenden.
  - macOS: Nur ein Hinweis mit Download-Link, weil Squirrel.Mac eine Apple-Signatur braucht. Pegel fragt dazu die GitHub-API.
  - Einstellungen → Über → „Nach Updates suchen“.
  - Release-Workflow `.github/workflows/release.yml`: Tag `v*` → Draft-Release → Builds für Windows und macOS → Veröffentlichung.
- [x] **Lautstärke angleichen** (Schalter im EQ-Panel, standardmäßig an):
  - YT liefert pro Titel `playerConfig.audioConfig.loudnessDb` (Abstand zum YT-Referenzpegel) und senkt laute Titel selbst ab.
  - Pegel hebt leise Titel um bis zu 6 dB an. Dafür hat die Kette eine Gain-Stufe vor dem Preamp und einen Limiter am Ende, der transparent bleibt, solange nichts angehoben wird.
  - Geprüft: Ein Titel mit −9 dB wird um 6 dB angehoben.
- [x] Windows-Icon füllt das Quadrat (wie andere Apps in der Taskleiste), macOS behält Apples Rand
- [x] **Visualizer im Mini-Player** (Einstellung, standardmäßig an):
  - Die YT-Ansicht schickt rund 30-mal pro Sekunde Balkenwerte (Bytes) über den Main-Prozess an den Mini-Player. Das läuft per Timer, weil das Hauptfenster dabei meist versteckt ist.
  - Fallen und Kappen rechnet der Mini-Player selbst (`src/shared/spectrum.ts`, gemeinsam mit dem YT-Visualizer).
  - Die Balken reichen von unten bis 10 px unter das Cover.
- [x] **Lücke rechts neben der Player-Leiste geschlossen.**
  - YT hält die Leiste `--ytmusic-scrollbar-width` (12 px) vom Rand fern, auch ohne Scrollleiste. Pegel setzt die Variable auf die eigene Scrollleiste (10 px) und auf 0, solange keine da ist.
  - Die Seiten-Scrollleiste lief bis ganz unten neben der Leiste vorbei. Jetzt endet die Spur über der Leiste (`margin-bottom` = gemessene Leistenhöhe), daneben trägt die Scrollleiste die Leistenfarbe (`src/yt/decor/scrollbar.ts`).
  - Stolperfalle: Selektoren mit `html` oder `body` vor `::-webkit-scrollbar` treffen die Seiten-Scrollleiste nie. Nur die globalen Pseudo-Elemente wirken, und die erben ihre Variablen von `<body>`. Daran ist der erste Versuch gescheitert.
- [ ] Test durch Johann: Installer 1.0.0, Update von 1.0.0 auf 1.0.1 (erst mit dem zweiten Release prüfbar), Link aus Discord
- **Risiko macOS:** Neuere macOS-Versionen können beim Lesen der Zwischenablage nachfragen. Dann hilft der Schalter, oder Pegel liest nur noch auf Knopfdruck.

### M10 – Freunde und Hör-Party (Release 1.1)

> Konzept vom 19.10.2026. Johanns Entscheidungen: Server auf **Cloudflare Workers + Durable Objects**, Daten auf dem Server **nur flüchtig**, Oberfläche als **Seitenpanel** wie der EQ, bei Werbung **kurz warten** (höchstens 30 s). Feste Anforderungen: **so wenig Verzögerung wie möglich** und **mehrere Gäste** pro Party.
>
> Release zusammen mit dem noch nicht gepushten Commit aus M9 (Visualizer im Mini-Player, Lücke an der Player-Leiste) als Version 1.1.0. Mit dem Code geht es erst los, wenn Johann das Konzept freigegeben hat.

**Grundsatz.** Jeder hört über sein eigenes YT-Konto in seinem eigenen Pegel, also über die offizielle Seite. Pegel überträgt kein Audio. Synchronisiert werden nur:

- welcher Titel läuft (`videoId`, optional `playlistId`),
- die Position,
- Play/Pause und Titelwechsel.

Pegel überspringt keine Werbung, die Party wartet höchstens darauf.

#### 10.1 Architektur

```
 Pegel (Host)                       Cloudflare (jurisdiction "eu")                 Pegel (Gast ×N)
┌───────────────────────┐   WSS   ┌────────────────────────────────┐   WSS   ┌───────────────────────┐
│ YT-Preload            │         │ Worker (Router, /hub, /party)  │         │ YT-Preload            │
│  bridge + party/sync  │         │  ├─ Hub-DO (eins)              │         │  bridge + party/sync  │
│        ▲ IPC          │◄───────►│  │   Presence, Freundescodes,  │◄───────►│        ▲ IPC          │
│ main/social/*         │         │  │   Einladungen               │         │ main/social/*         │
│  connection, friends, │◄───────►│  └─ Party-DO (je Party eins)   │◄───────►│  connection, friends, │
│  party, identity      │         │      Zustand, Uhr, Verteiler   │         │  party, identity      │
└───────────────────────┘         └────────────────────────────────┘         └───────────────────────┘
```

- **Zwei WebSocket-Verbindungen pro App:**
  - Zum **Hub** (dauerhaft, solange „Freunde“ an ist): Online-Status, „Hört gerade“, Freundescodes, Einladungen. Ein einziges Hub-DO reicht für einen Freundeskreis, es schläft per WebSocket-Hibernation.
  - Zur **Party** (nur während einer Party): Pro Party gibt es ein eigenes Durable Object. Es verteilt den Host-Zustand an alle Gäste und liefert die Server-Uhr.
- **Verzögerung:**
  - Beide DOs entstehen mit `jurisdiction: 'eu'`, also in einem EU-Rechenzentrum nahe den Nutzern.
  - Eine Nachricht braucht typisch 15–60 ms von Pegel zu Pegel.
  - Gäste warten nicht auf Befehle, sondern rechnen die Host-Position über die gemeinsame Uhr hoch (siehe 10.3). Deshalb fällt die Netzlaufzeit beim Abspielen kaum ins Gewicht.
- **Mehrere Gäste:** Bis zu 20 Teilnehmer pro Party (Konstante `PARTY_MAX_MEMBERS`). Das DO schickt jede Host-Nachricht einmal an alle Sockets. Der Aufwand wächst linear und bleibt bei 20 Leuten winzig.
- **Server-Code** liegt im Repo unter `server/`, als eigenes Paket mit `wrangler.toml`. Er verwendet die Protokoll-Typen aus `src/shared/social-protocol.ts` mit, damit Client und Server nie auseinanderlaufen. Deploy per `npm run deploy` in `server/`. Den Cloudflare-Account legt Johann an. Ein Deploy passiert nur nach Rückfrage.
- **Kosten:** Der Free-Plan reicht. Eingehende WebSocket-Nachrichten zählen bei DOs im Verhältnis 20:1 als Anfrage. Eine 3-stündige Party mit 5 Leuten macht etwa 3 000 von 100 000 Anfragen pro Tag. Pings beantwortet `setWebSocketAutoResponse`, ohne das DO zu wecken.

**Neue Module**

| Modul | Aufgabe |
| --- | --- |
| `shared/social-protocol.ts` | Nachrichtentypen Client ↔ Server (10.2), Versionsnummer `PROTOCOL_VERSION`, Grenzen (Namenslänge, `PARTY_MAX_MEMBERS`) |
| `shared/social.ts` | `SocialState` für die UI (Verbindung, ich, Freunde mit Presence, Einladungen, Party-Ansicht), Freundescode-Format und -Prüfung |
| `shared/party-sync.ts` | Reine, getestete Sync-Mathematik: Uhr-Offset aus Ping-Proben, Soll-Position hochrechnen, Korrekturentscheidung (nichts / Tempo / Sprung) |
| `main/social/identity.ts` | Ed25519-Schlüsselpaar (`crypto.generateKeyPairSync('ed25519')`). Der private Schlüssel liegt per `safeStorage` verschlüsselt in `userData/identity.json`. Dazu Signieren der Server-Challenge |
| `main/social/connection.ts` | WebSocket-Client mit Anmeldung, Wiederverbinden (0,5 s → 15 s Backoff, Zufallsstreuung) und Uhrabgleich. Wird für Hub und Party je einmal verwendet |
| `main/social/friends.ts` | Freundesliste (lokal, `userData/friends.json`), Codes erzeugen und einlösen, Presence, „Hört gerade“ aus dem `PlayerState` (nur bei Titelwechsel bzw. Pause) |
| `main/social/party.ts` | Party-Zustandsautomat (keine / Host / Gast): Einladungen, Werbe-Wartezeit, Host-Wechsel, Vorschläge. Leitet Soll-Zustände an die YT-Ansicht weiter |
| `yt/party/sync.ts` | Läuft im YT-Preload, direkt am Media-Element: misst die Position auf die Millisekunde genau, korrigiert die Abweichung alle 250 ms, lädt Titel und meldet Werbung bzw. Sperren |
| `yt/selectors.ts` | Neu: `adShowing` (`#movie_player.ad-showing`), `ytmusicApp` (für die Navigation innerhalb der Seite) |
| `renderer/components/social/` | `SocialPanel`, `PartyCard`, `FriendRow`, `AddFriendDialog`, `SuggestionList` sowie Party-Pille und Einladungshinweis in der Titelleiste |
| `server/src/` | `index.ts` (Router, Upgrade, Signaturprüfung per WebCrypto Ed25519), `hub.ts` (Hub-DO), `party.ts` (Party-DO) |

**Erweiterungen der Player-Bridge**

- `PlayerState` bekommt `videoId` (aus `getPlayerResponse().videoDetails`, das liest `readLoudness` heute schon) und `adPlaying`. Während einer Werbung meldet die Bridge keinen Titelwechsel, auch wenn sich die MediaSession-Metadaten ändern.
- **Titel laden ohne Neuladen der Seite:** Pegel löst YTs eigene Navigation mit einem `watchEndpoint` (`videoId`, `playlistId`) am `ytmusic-app`-Element aus, per `executeInMainWorld` wie bei `playerApi`. Die EQ-Kette bleibt dabei hängen, und es entsteht kein Neuladen mit 2–3 s Pause. Rückfallebene ist `loadURL(/watch?v=…&list=…)`.
- **Sperren erkennen:** Liefert `getPlayerResponse().playabilityStatus.status` etwas anderes als `OK` (z. B. `UNPLAYABLE` oder `LOGIN_REQUIRED`), gilt der Titel als „für dich nicht verfügbar“.
- **Neue Befehle** nur für `yt/party/sync.ts`: Tempo setzen (`media.playbackRate`, `preservesPitch` bleibt an) und Sprung auf eine genaue Position.

**IPC (`shared/ipc.ts`)**

```ts
// InvokeChannels
'social:get': { args: []; result: SocialState };

// UiToMainChannels
'social:enable': { displayName: string };        // legt beim ersten Mal die Identität an
'social:disable': void;
'social:set-name': string;
'social:create-code': void;                      // Ergebnis kommt mit 'social:state'
'social:redeem-code': string;
'social:remove-friend': string;                  // friendId
'party:start': void;
'party:invite': string;                          // friendId
'party:respond': { inviteId: string; accept: boolean };
'party:join': string;                            // offene Party eines Freundes, friendId
'party:leave': void;
'party:end': void;                               // nur Host
'party:kick': string;                            // nur Host
'party:transfer': string;                        // Host abgeben
'party:suggestion': { id: string; accept: boolean }; // nur Host
'party:set-options': { open: boolean; allowSuggestions: boolean };

// MainToUiChannels
'social:state': SocialState;

// MainToYtChannels
'yt:party-target': PartyTarget | null;           // null: keine Party oder Host
// YtToMainChannels
'yt:party-report': PartyReport;
```

```ts
interface PartyTarget {
  videoId: string;
  playlistId?: string;
  playing: boolean;
  positionMs: number;   // Host-Position …
  atMs: number;         // … zu diesem lokalen Zeitpunkt (Date.now()-Basis, schon mit Uhr-Offset umgerechnet)
  waitingFor?: string[]; // Namen, auf deren Werbung gerade gewartet wird
}
interface PartyReport {
  videoId: string | null;
  positionMs: number;   // inkl. Ausgabelatenz-Ausgleich
  atMs: number;
  playing: boolean;
  buffering: boolean;
  ad: boolean;
  unplayable?: string;  // YTs playabilityStatus.status
  localAction?: 'pause' | 'play' | 'seek' | 'track'; // Gast hat selbst bedient (10.4)
}
```

Main ist wie bisher die einzige Quelle für den Zustand. Die UI bekommt nur `SocialState`. Die YT-Ansicht bekommt nur `PartyTarget` und hat keinen Zugriff aufs Netz.

#### 10.2 Protokoll

Alle Nachrichten sind JSON mit dem Feld `t` (Typ). Zeiten sind Server-Millisekunden (`Date.now()` im Worker), außer bei Uhr-Pings. Kennungen:

- `userId` = öffentlicher Ed25519-Schlüssel, base64url, 43 Zeichen.
- `partyId` = 128 Bit zufällig.

**Anmeldung** (Hub und Party gleich):

| Richtung | Nachricht | Inhalt |
| --- | --- | --- |
| S→C | `challenge` | `nonce`, `serverTime`, `v` (Protokollversion) |
| C→S | `auth` | `userId`, `sig` (Signatur über `nonce` + Ziel `hub`/`partyId`), `name`, `v` |
| S→C | `ready` / `error` | `error.code`: `bad-sig`, `old-client` (UI: „Bitte Pegel aktualisieren“), `full`, `not-invited`, `ended` |

**Hub**

| Richtung | Nachricht | Inhalt |
| --- | --- | --- |
| C→S | `hello` | `friends: userId[]` (lokale Liste), `share: { nowPlaying: boolean }` |
| C→S | `presence` | `nowPlaying: { title, artist, videoId } \| null`, `party: { partyId, open } \| null` |
| S→C | `presence` | `userId`, `name`, `online`, `nowPlaying`, `party`. Geht nur an **gegenseitige** Freunde: Y sieht X nur, wenn X in Ys Liste steht und Y in X' Liste |
| C→S | `code.create` | – → S→C `code` mit `code` (z. B. `K7Q2-M9XD`, 8 Zeichen Crockford-Base32) und `expiresAt` (+24 h). Einmal gültig |
| C→S | `code.redeem` | `code` → S→C `friend.added` mit `userId` und `name` des Code-Erstellers |
| S→C | `friend.added` | An den Code-Ersteller: Wer den Code eingelöst hat. Ist der Ersteller offline, wartet die Nachricht höchstens 30 Tage |
| C→S | `invite` | `to`, `partyId`, `ticket` (vom Host signiert: `partyId`, Gast-`userId`, `exp` +10 min) |
| S→C | `invite` | `inviteId`, `from`, `name`, `partyId`, `ticket`, `nowPlaying`. Nur an Online-Freunde, wird nicht gespeichert |
| C→S | `invite.decline` | `inviteId` |

**Party**

| Richtung | Nachricht | Inhalt |
| --- | --- | --- |
| C→S | `auth` + `ticket` | Gäste brauchen ein gültiges Ticket. Den Host-Schlüssel kennt das DO aus `create`, prüfen kann es also selbst, ohne beim Hub nachzufragen. Freunde treten offenen Partys über ein Ticket bei, das der Hub vom Host anfordert |
| C→S | `create` | nur Host, legt `hostId` und Optionen fest |
| C→S | `ping` | `c0` (Client-Zeit) → S→C `pong` mit `c0` und `s` (Server-Zeit). Beim Beitritt 8 Proben in 100-ms-Abstand, danach alle 5 s |
| S→C | `welcome` | `hostId`, `members[]`, `state`, `options`, `suggestions[]` |
| C→S | `state` | nur Host: `seq`, `videoId`, `playlistId?`, `playing`, `positionMs`, `at` (Server-Zeit der Messung), `title`, `artist`. Wird bei jeder Änderung sofort geschickt, beim Abspielen zusätzlich jede Sekunde |
| S→C | `state` | an alle weitergereicht. Das DO verwirft Nachrichten mit veralteter `seq` |
| C→S | `status` | Gäste: `videoId`, `driftMs`, `ad`, `buffering`, `unplayable?`. Jede Sekunde, solange sich etwas ändert, sonst alle 5 s |
| S→C | `member` | `userId`, `name`, `role`, `conn` (`ok`/`reconnecting`), `ad`, `unplayable`, `driftMs`. Die Abweichung zeigt die UI als „sync“-Punkt |
| C→S / S→C | `suggest` | Gast: `videoId`, `title`, `artist` → an den Host. Höchstens 5 offene Vorschläge pro Gast |
| C→S | `suggest.answer` | Host: `id`, `accept`. Angenommen heißt: Der Host spielt den Titel sofort ab („Abspielen“). „Als Nächstes“ in YTs Warteschlange bräuchte das Kontextmenü (DOM) und ist zurückgestellt |
| C→S | `kick`, `transfer`, `end`, `options` | nur Host |
| S→C | `host` | `hostId` (nach Abgabe oder Ausfall) |
| S→C | `ended` | `reason`: `host-ended`, `empty`, `host-lost` |

Unbekannte Typen werden ignoriert, damit ältere Clients beim Erweitern nicht abstürzen. Ändert sich das Protokoll inkompatibel, steigt `PROTOCOL_VERSION`.

#### 10.3 Synchronisation (möglichst wenig Verzögerung)

1. **Gemeinsame Uhr:** Aus jeder Ping-Probe folgt `offset = s − (c0 + rtt/2)`. Pegel nimmt den Offset der Probe mit der kürzesten RTT aus den letzten 8 Proben, das filtert ausreißende Netzspitzen. Erreichbar sind so ±5–10 ms.
2. **Host misst, statt zu befehlen:**
   - Bedient der Host YT direkt (Play, Pause, Spulen, Titel), passiert das bei ihm sofort und ohne künstliche Verzögerung.
   - `yt/party/sync.ts` beim Host meldet die neue Lage (`positionMs` zum Zeitpunkt `at`) per IPC an Main, Main schickt sie als `state` weiter.
3. **Gäste rechnen hoch:**
   - Die Soll-Position ist `positionMs + (jetzt − at)`, solange `playing`. Ein Play beim Host startet bei den Gästen also gleich an der richtigen Stelle, die Netzlaufzeit ist herausgerechnet.
   - Nur Pause und Sprung kommen um eine Laufzeit (ca. 20–50 ms) später an. Bei Pause springt der Gast danach auf die genaue Pausenstelle zurück.
4. **Ausgabelatenz:**
   - Beide Seiten rechnen `AudioContext.baseLatency + outputLatency` der EQ-Kette heraus (bei `latencyHint: 'playback'` und Bluetooth leicht 100–250 ms). Gemeldet und verglichen wird damit, was tatsächlich aus dem Lautsprecher kommt.
   - Für Restfehler gibt es in den Einstellungen „Audio-Versatz“ (±300 ms, Standard 0).
5. **Korrektur** alle 250 ms beim Gast, Abweichung `d = Ist − Soll`:
   - `|d| < 30 ms`: nichts tun, Tempo 1.
   - `30 ms ≤ |d| < 800 ms`: Tempo anpassen, `rate = 1 − clamp(d / 2000 ms, ±0,04)`. Die Abweichung schließt sich so in rund 2 s, ohne Sprung und ohne Tonhöhenänderung (`preservesPitch`).
   - `|d| ≥ 800 ms` (Beitritt, Titelwechsel, nach Werbung oder Puffern): Sprung auf `Soll + seekLead`. `seekLead` lernt Pegel als gleitenden Mittelwert, wie lange ein Sprung bis zum nächsten `playing` braucht (Start 150 ms). Danach übernimmt die Tempo-Korrektur.
   - Ziel: Alle Teilnehmer liegen innerhalb von **±40 ms** zueinander, sobald die Wiedergabe läuft.
6. **Titelwechsel:**
   - Neue `videoId` vom Host → Gäste laden per `watchEndpoint` (mit `playlistId`, damit bei Playlists auch die Warteschlange gleich ist) → bei `canplay` Sprung auf die hochgerechnete Position.
   - Spielt YT beim Gast am Titelende von selbst etwas anderes ab (eigene Radio-Warteschlange), ersetzt Pegel es sofort durch den Titel des Hosts.
   - Der Host schickt den Wechsel, sobald sein YT den neuen Titel lädt. Gäste laden also fast gleichzeitig.
7. **Beitritt mitten im Lied:** `welcome.state` hochrechnen, Titel laden, Sprung, fertig. Dafür muss nichts beim Host passieren.

#### 10.4 Sonderfälle

- **Werbung (Gäste ohne Premium):**
  - Meldet ein Gast `ad: true`, pausiert der Host-Pegel die Party für alle. Hinweis: „Warte auf Lea (Werbung) …“ mit einem Countdown.
  - Die Party wartet höchstens **30 s pro Titel**, für alle werbenden Gäste zusammen. Danach geht es ohne sie weiter.
  - Ist die Werbung vorbei, holt die Korrektur den Gast per Sprung an die richtige Stelle.
  - Hat der **Host** Werbung, steht die Party, bis sie vorbei ist. Der Host ist die Uhr, die Gäste sehen „Host hört kurz Werbung“.
- **Gesperrter Titel** (Region, Altersgrenze, nicht verfügbar):
  - Der Gast meldet `unplayable`. Er sieht „Dieser Titel ist für dich nicht verfügbar – beim nächsten bist du wieder dabei“, der Host sieht ein Hinweis-Symbol am Gast.
  - Die Party läuft weiter. Beim nächsten Titel synchronisiert sich der Gast wieder.
- **Gast bedient selbst:**
  - *Pause* ist erlaubt und gilt nur für ihn („Du hast pausiert · Weiterhören“). Beim Fortsetzen springt er an die Party-Stelle.
  - *Spulen* wird zurückgesetzt.
  - *Anderer Titel bzw. Weiter*: Pegel setzt auf den Party-Titel zurück. Sind Vorschläge erlaubt, schickt Pegel den gewählten Titel als Vorschlag an den Host („Als Vorschlag gesendet“).
  - Wer wirklich etwas anderes hören will, verlässt die Party.
- **Verbindung weg:**
  - Gast: Er spielt lokal weiter und verbindet sich mit Backoff neu (das Ticket bleibt bis zum Ende der Party gültig). Danach synchronisiert er sich wieder. Für die anderen steht er 60 s auf „verbindet neu“, dann wird er entfernt.
  - Host: Die Gäste spielen den laufenden Titel weiter und halten an dessen Ende an. Kommt der Host nicht innerhalb von 60 s zurück, wird der am längsten verbundene Gast Host. Ist niemand mehr da, endet die Party.
- **Verlassen:**
  - Gast: „Party verlassen“, die Musik läuft bei ihm einfach weiter.
  - Host: Er gibt den Host an jemanden ab oder beendet die Party für alle.
  - Beim Beenden von Pegel verlässt er die Party sauber (`before-quit`).
- **Pegel in einer älteren Version:** `old-client` mit dem Hinweis „Für Partys bitte Pegel aktualisieren“, zusammen mit dem vorhandenen Updater.
- **Nicht angemeldet bei YT:**
  - Ohne Google-Login spielt YT Music nur eingeschränkt ab. Pegel weist beim Beitritt darauf hin.
  - Titel, die ein Konto brauchen, behandelt Pegel wie gesperrte Titel.

#### 10.5 Datenschutz

| Was | Wo | Wie lange |
| --- | --- | --- |
| Schlüsselpaar, Anzeigename | lokal (`identity.json`, privater Schlüssel per `safeStorage`) | bis „Freunde zurücksetzen“ |
| Freundesliste | nur lokal (`friends.json`) | bis zum Entfernen |
| Öffentlicher Schlüssel, Name, Freundesliste, „Hört gerade“ | Hub-DO, **nur im Arbeitsspeicher** | solange die Verbindung steht |
| Freundescode → öffentlicher Schlüssel und Name | Hub-DO-Speicher (SQLite) | bis zum Einlösen, höchstens 24 h |
| Noch nicht zugestellte Benachrichtigung „X hat deinen Code eingelöst“ | Hub-DO-Speicher | bis zur Zustellung, höchstens 30 Tage |
| Party-Zustand, Mitglieder, Vorschläge | Party-DO, **nur im Arbeitsspeicher** | bis die Party endet |

- **Keine Logs** mit Inhalten (`console.log` im Worker nur für Fehlercodes). Cloudflare selbst sieht IP-Adressen, wie bei jedem Server. Das steht so in der README und in den Einstellungen.
- **Freunde sehen:** Name, online/offline, „Hört gerade: Titel – Interpret“ und ob man in einer offenen Party ist. „Hört gerade teilen“ ist abschaltbar (Standard an), dann sehen Freunde nur „online“.
- **Party-Mitglieder sehen:** Namen, wer Host ist, Sync-Status, „Werbung“ bzw. „nicht verfügbar“ und Vorschläge.
- **Keine Google-Daten:** Pegel liest weder das YT-Konto noch Profilbild oder E-Mail aus.
- **Der Schlüssel ist kein Passwort:** Er dient nur der Pegel-Freunde-Identität. Die Regel „Keine Zugangsdaten speichern“ betrifft den Google-Login und bleibt unberührt. Geht der Schlüssel verloren (neuer Rechner), legt Pegel eine neue Identität an, und man fügt sich neu hinzu. Export und Import gibt es in v1 bewusst nicht.
- **Ganz aus:** Standardmäßig ist „Freunde“ aus. Erst ein Klick auf „Freunde einrichten“ im Social-Panel baut eine Verbindung auf. „Freunde ausschalten“ trennt sie, „Freunde zurücksetzen“ löscht Identität und Liste.

#### 10.6 Oberfläche

Alles im Stil von `design/mockup.html`: Tokens, `tb-btn`, Panel-Maße und Chips wie beim EQ, keine nativen Controls.

```
┌ Titelleiste ────────── [● Party · 3] [EQ] [Social] │ [↻] [Mini] [⚙] │ ─ □ × ┐
│                                            │ Social                     [⋯] │
│   YT Music                                 │ ┌ PARTY ─────────────────────┐ │
│                                            │ │ ▶ Titel – Interpret        │ │
│                                            │ │ ● Johann (Host)            │ │
│                                            │ │ ● Lea    ● Tom ⏸ Werbung   │ │
│                                            │ │ [Freunde einladen] [Verl.] │ │
│                                            │ │ Vorschläge (2)          ›  │ │
│                                            │ └────────────────────────────┘ │
│                                            │ ONLINE                         │
│                                            │ ● Lea   hört Titel – Interpret │
│                                            │         [Einladen]             │
│                                            │ OFFLINE                        │
│                                            │ ○ Tom                          │
│                                            │ [+ Freund hinzufügen]          │
└────────────────────────────────────────────┴────────────────────────────────┘
```

- **Titelleiste neu gruppiert** (Wunsch von Johann): rechts drei Gruppen, getrennt durch dieselbe 1-px-Linie (`border` in `var(--border)`), die heute vor den Fenster-Buttons steht (`.win-controls`):
  - **Equalizer, Social** – die beiden Buttons, die ein Seitenpanel öffnen,
  - **Neu laden, Mini-Player, Einstellungen**,
  - **Fenster-Buttons** (Windows/Linux; unter macOS entfällt die letzte Gruppe samt Trenner).
  - Die Party-Pille steht links vor der ersten Gruppe, der Link- bzw. Einladungshinweis wie bisher davor.
- **Titelleisten-Button „Social“** (Personen-Symbol, Tooltip „Freunde & Party (Strg/⌘+U)“) ist der Einstieg für Freunde und Party:
  - Er öffnet das Seitenpanel (372 px, gleiche Animation wie beim EQ).
  - EQ und Social teilen sich den Platz: Öffnet man das eine, schließt sich das andere, es ist immer nur ein Button aktiv. Von einer Pegel-Seite aus führt der Button zurück zur Musik und öffnet das Panel, wie beim EQ.
  - Kurzbefehl Strg/⌘+F ist schon von YTs Suche belegt, deshalb **Strg/⌘+U**.
  - Ein kleiner Akzent-Punkt am Button zeigt eine offene Einladung.
- **Panel ohne Einrichtung:** kurzer Text, was Freunde und Partys sind, was auf dem Server landet (eine Zeile mit Link zu „Mehr erfahren“), Feld „Dein Name“ und der Button „Freunde einrichten“.
- **Party-Karte** (nur in einer Party), Fläche `surface-2`:
  - aktueller Titel,
  - Mitglieder als Zeilen mit Status-Punkt: `accent` = synchron, `text-dim` = verbindet neu, plus Hinweise „Werbung“ und „nicht verfügbar“,
  - Host-Menü pro Mitglied über „⋯“: Host übergeben, entfernen,
  - Schalter „Offen für Freunde“ und „Vorschläge erlauben“,
  - Vorschlagsliste mit „Als Nächstes“ und „Ablehnen“.
- **Ohne Party:** Button „Party starten“ oben im Panel.
- **Freundesliste:**
  - Online oben, Offline darunter, jeweils alphabetisch.
  - „Hört gerade“ zweizeilig und gekürzt.
  - Je nach Lage „Einladen“ (ich bin Host), „Beitreten“ (Freund in offener Party) oder nichts.
  - Rechtsklick bzw. „⋯“ → „Entfernen“, mit Rückfrage.
- **Freund hinzufügen** (Overlay wie der Preset-Dialog), zwei Wege:
  - „Mein Code“: großer Code mit Kopieren-Button und „gültig bis …“.
  - „Code eingeben“: Feld im Format `XXXX-XXXX`, Groß- und Kleinschreibung egal, Bindestrich optional.
- **Party-Pille in der Titelleiste:** „● Party · 3“ in `accent-soft`. Ein Klick öffnet das Panel. Bei Werbe-Wartezeit steht dort „Warte auf Lea …“.
- **Einladung:**
  - Hinweis in der Titelleiste wie beim kopierten Link: „Lea lädt dich zur Party ein · Beitreten · Ablehnen“.
  - Ist das Fenster versteckt bzw. im Tray, kommt eine System-Benachrichtigung (`Notification`), ein Klick darauf zeigt Pegel.
  - Einladungen verfallen nach 10 min.
- **Mini-Player:**
  - Party-Badge „Party · 3“ neben dem EQ-Badge.
  - Gäste haben kein Zurück und Weiter (ausgegraut, Tooltip „Steuert Johann“). Play/Pause bleibt (lokale Pause, siehe 10.4).
- **Tray-Menü:** Eintrag „Party verlassen“ bzw. „Party beenden“, solange eine läuft.
- **Einstellungen**, neuer Abschnitt „Freunde & Party“:
  - Anzeigename,
  - „Hört gerade teilen“,
  - „Audio-Versatz“,
  - „Freunde ausschalten“ und „Freunde zurücksetzen“,
  - der Satz zum Datenschutz.

**Einstellungs-Schema** (umgesetzt ohne Versionssprung: `normalizeSettings` ergänzt fehlende Felder mit Standardwerten, `version` bleibt 1):

```ts
social: {
  enabled: boolean;        // Standard false
  displayName: string;     // 1–24 Zeichen
  shareNowPlaying: boolean; // Standard true
  audioOffsetMs: number;   // -300…300
  partyOpen: boolean;      // Standard true (Freunde dürfen beitreten)
  allowSuggestions: boolean; // Standard true
  panelOpen: boolean;
}
```

#### 10.7 Umsetzung (Stand 19.10.2026)

**Abweichungen und Ergänzungen zum Konzept**

- **EQ bleibt lokal.** Er wird nicht synchronisiert, weil er zu den eigenen Kopfhörern passt.
  - Playlist-Presets gelten nur im eigenen Pegel.
  - Gäste laden den Titel mit der `playlistId` des Hosts. Hat ein Gast für diese Playlist selbst ein Preset (z. B. bei einer gemeinsamen Playlist), wird sein eigenes aktiv.
  - Eine Option „EQ des Hosts übernehmen“ wäre später möglich.
- **Hibernation:** Wacht der Hub auf, kennt er Freundeslisten erst nach dem `hello` des Clients. Damit die weckende Nachricht (z. B. eine Einladung) nicht an einer leeren Liste scheitert, liegt die Liste gekürzt im Socket-Attachment.
  - Gekürzt heißt: 66-Bit-Präfixe, höchstens 150 Einträge.
  - Das Attachment ist kein Speicher, es existiert nur, solange der Socket offen ist.
- **Navigation:** YTs `yt-navigate`-Event an `ytmusic-app` mit `watchEndpoint` funktioniert (geprüft). Der Titel wechselt ohne Neuladen, die EQ-Kette bleibt.
- **Neue Player-Befehle** `play` und `pause` (statt Umschalten), damit die Werbe-Wartezeit nicht versehentlich falsch herum schaltet.
- **Lokale Entwicklung:**
  - `server/`: `npm run dev` startet wrangler mit `JURISDICTION=none`, weil der lokale workerd keine Jurisdiktionen kennt.
  - Pegel: mit `PEGEL_SOCIAL_URL=ws://127.0.0.1:8787` starten. Für eine zweite Instanz `PEGEL_USER_DATA` auf einen eigenen Ordner setzen.
- **Server-Adresse** in `src/main/social/config.ts`: `wss://pegel-social.johann-mertens-98.workers.dev` (deployt am 19.10.2026, `jurisdiction: 'eu'` funktioniert im Free-Plan).

**Gemessen** (zwei Instanzen auf einem Rechner, lokaler Server, Abstand der beiden `currentTime` über `performance.timeOrigin`):

- Laufend: 5–26 ms. Das entspricht etwa der Auflösung von `currentTime`.
- Nach Spulen beim Host: zuerst ca. 120 ms voraus, nach 2,5 s unter 20 ms (Tempo 0,96 → 1).
- Pause/Play: Die Pausenstelle stimmt auf 30 ms. Nach Play ca. 90 ms, nach 2 s unter 10 ms.
- Titelwechsel am Liedende, angenommener Vorschlag und Beitritt einer offenen Party: alle folgen, danach unter 40 ms.
- Über den echten Server (Cloudflare, EU), zwei Instanzen auf einem Rechner: laufend unter 1 ms, nach Spulen ca. 130 ms, nach 2 s unter 25 ms.

**Schritte**

- [x] Konzept mit Johann abgestimmt (Server, Datenschutz, UI, Werbung), Freigabe zum Umsetzen
- [x] `server/` angelegt:
  - Worker, Hub-DO, Party-DO, `jurisdiction: 'eu'`, Signaturprüfung.
  - Die Kerne `hub-core.ts` und `party-core.ts` sind reines TypeScript und mit Vitest getestet (`tests/unit/social-server.test.ts`) statt mit `vitest-pool-workers`.
  - Lokal mit wrangler geprüft.
- [x] Cloudflare-Account (Johann), erster Deploy (`cd server; npm run deploy`), URL in `config.ts` eingetragen
- [x] `shared/social-protocol.ts`, `shared/social.ts`, `shared/party-sync.ts` mit Unit-Tests (Uhr-Offset, Hochrechnen, Korrekturstufen, Freundescode-Format)
- [x] Bridge: `videoId`, `adPlaying`, Sperr-Erkennung, Laden per `yt-navigate` mit `location.assign`-Rückfallebene, neue Selektoren (`adShowing`, `app`) im Selbsttest
- [x] `main/social/identity.ts` und `connection.ts` (Anmeldung, Backoff, Keep-alive mit Erkennung toter Verbindungen, Uhrabgleich), Einstellungen um `social` erweitert
- [x] Freunde: Codes erzeugen und einlösen, gegenseitige Presence, „Hört gerade“, Panel, Overlay „Freund hinzufügen“
- [x] Party Host/Gast: `yt/party/sync.ts` mit Tempo- und Sprungkorrektur (gelernter Sprungvorlauf), Ausgabelatenz, Beitritt mitten im Lied, Titelwechsel
- [x] Sonderfälle umgesetzt:
  - Geprüft: lokale Pause und „Weiterhören“, Gast wählt Titel → Vorschlag, Host-Wechsel beim Verlassen, Beitritt zu einer offenen Party.
  - Umgesetzt, aber ungetestet (in den Tests kam keine Werbung, kein gesperrter Titel und kein echter Verbindungsabbruch vor): Werbe-Wartezeit, gesperrte Titel, Verbindungsabbruch.
- [x] UI: Titelleiste neu gruppiert mit Social-Button, Party-Karte, Titelleisten-Pille, Einladungshinweis und System-Benachrichtigung, Mini-Player-Badge (Zurück/Weiter für Gäste aus), Tray-Eintrag, Einstellungsabschnitt
- [x] Messen mit zwei Instanzen auf einem Rechner (Ergebnis oben)
- [ ] Messen auf zwei Rechnern über den echten Server
- [ ] Test mit 3+ Leuten, davon einer ohne Premium (Werbung) und einer mit Bluetooth-Kopfhörer
- [x] README: Abschnitt „Freunde & Hör-Party“ und Datenschutz
- [x] Version 1.1.0 mit dem Commit aus M9 veröffentlicht (vor dem Test mit Freunden, damit alle dieselbe Version haben; Fehler werden in 1.1.x behoben)
- **Fertig, wenn:** Johann und mindestens zwei Freunde sich per Code hinzufügen, einander online mit „Hört gerade“ sehen und eine Party über mehrere Titel synchron hören, auch wenn einer mitten im Lied beitritt, Werbung bekommt oder kurz die Verbindung verliert.

### M11 – Gemeinsame Party-Warteschlange (Release 1.2)

> Wunsch nach dem ersten Test von 1.1.0: Die Kontrolle liegt zu sehr beim Host. Johanns Entscheidungen vom 19.10.2026:
> - Pause und Überspringen dürfen alle.
> - Titel kommen über einen „+“-Knopf in YT in die Warteschlange. Geht der zu oft kaputt, wird eine andere Lösung gesucht.
> - Der Host bekommt einen Schalter „Alle dürfen steuern“.

**Warum nicht YTs eigene Warteschlange?** Jeder hört über sein eigenes Konto, also hat jeder seine eigene YT-Warteschlange. An die kommt Pegel nur über DOM-Klicks im Kontextmenü heran. Deshalb führt Pegel eine eigene **Party-Warteschlange** auf dem Party-Server, nur im Arbeitsspeicher, wie der Rest der Party.

**Ablauf**

- **Hinzufügen:**
  - Während einer Party setzt Pegel neben jeden Titel in YT-Listen (Playlists, Alben, Suche, Warteschlange) einen „+“-Knopf. Ein Klick hängt den Titel an die Party-Warteschlange, die Musik läuft weiter.
  - Selektoren nur in `yt/selectors.ts`. Fehlt der Knopf, meldet der Selbsttest „Hör-Party (+ Knopf)“.
  - Klickt ein Gast trotzdem direkt auf einen Titel, wird der wie bisher erkannt und landet ebenfalls in der Warteschlange, mit kurzem Aussetzer.
- **Abspielen:**
  - Kurz vor dem Ende eines Titels (≤ 300 ms) lädt der Host-Pegel den nächsten Titel aus der Warteschlange, die Gäste folgen wie gewohnt.
  - Ist die Warteschlange leer, geht es in der Playlist des Hosts weiter, an der Stelle nach dem letzten Playlist-Titel. Die Stelle merkt sich Pegel über `getPlaylistId`/`getPlaylistIndex` von YTs Player.
- **Steuern:**
  - Mit „Alle dürfen steuern“ (Standard an) schicken Gäste Pause, Play, Überspringen und Spulen an den Party-Server. Der leitet sie an den Host-Pegel weiter, der sie auf seiner YT-Seite ausführt. Alle anderen folgen.
  - Auch YTs eigene Knöpfe beim Gast (Pause, Spulen, Weiter) werden zu Party-Befehlen.
  - Jede Aktion zeigt kurz in der Party-Pille z. B. „Lea hat übersprungen“.
- **Ohne „Alle dürfen steuern“:** Es gilt das Verhalten aus M10. Gäste pausieren nur für sich, der „+“-Knopf schickt einen Vorschlag (wenn erlaubt). Angenommene Vorschläge kommen in die Warteschlange, statt sofort zu spielen.
- **Warteschlange im Social-Panel:** Titel mit „von Lea“. Entfernen kann, wer den Titel hinzugefügt hat, und der Host. Der Host kann einen Titel nach oben holen.

**Protokoll v2** (Party; der Hub bleibt v1-kompatibel, damit 1.1.0 weiter Freunde sieht):

| Richtung | Nachricht | Inhalt |
| --- | --- | --- |
| C→S | `queue.add` | `track` (`videoId`, `title`, `artist`); mit „Alle dürfen steuern“ alle, sonst nur der Host |
| C→S | `queue.remove` | `id`; wer ihn hinzugefügt hat, oder der Host |
| C→S | `queue.move` | `id`, `index`; nur der Host |
| C→S | `queue.played` | `id`; Host, sobald der Titel läuft |
| C→S | `control` | `action` (`play`, `pause`, `skip`, `seek`), `positionMs?`; geht nur an den Host |
| S→C | `queue` | ganze Liste (`id`, Track, `by`, `byName`), höchstens 100, 20 pro Person |
| S→C | `control` | an den Host: `action`, `positionMs?`, `from` |
| S→C | `activity` | an alle: `userId`, `name`, `action` (`play`, `pause`, `skip`, `seek`, `add`), `title?` |

`PartyOptions` bekommt `everyoneControls`. `welcome` liefert die Warteschlange mit. Angenommene Vorschläge verschiebt der Server direkt in die Warteschlange.

**Schritte**

**Umsetzung (Stand 19.10.2026)**

- **Rückkehr zur Playlist:** `getPlaylistIndex` von YTs Player bleibt in YT Music immer bei 0 und taugt nicht. Stattdessen liest der Host-Pegel unmittelbar vor dem ersten Party-Titel den `watchEndpoint` des Eintrags nach dem laufenden Titel aus YTs Warteschlange (`ytmusic-player-queue-item[selected]` und `.data.navigationEndpoint`, Selektoren in `yt/selectors.ts`). Ist die Party-Warteschlange leer, navigiert er genau dorthin. Geprüft: Nach zwei Party-Titeln ging das Album beim richtigen nächsten Titel weiter.
- **„+“-Knopf:**
  - Steht vor dem ⋮-Menü jeder Listenzeile mit Watch-Link, sichtbar beim Überfahren.
  - YT erzwingt Trusted Types, daher werden die Icons per DOM-Aufruf gebaut, nicht über HTML-Strings.
  - Einen Selbsttest-Eintrag gibt es nicht: Listenzeilen fehlen auf vielen Seiten (z. B. der Player-Seite), das gäbe Fehlalarme.
  - Fehlt der Knopf nach einem YT-Umbau, können Gäste weiterhin direkt auf Titel klicken (mit kurzem Aussetzer).
- **Gefundener Fehler:** Lädt ein Gast seine YT-Seite neu, pausiert der Browser das Media-Element. Mit „Alle dürfen steuern“ wurde daraus eine Pause für alle. Pausen während `pagehide`/`beforeunload` zählen jetzt nicht als Bedienung.
- **YTs „Weiter“-Knopf** beim Gast wird am Klick erkannt (Selektor `nextButton`) und zum Überspringen für alle. „Zurück“ gibt es in der Party nicht.
- **Angenommene Vorschläge** (ohne „Alle dürfen steuern“) gehen in die Warteschlange, statt sofort zu spielen.
- **Nach dem ersten Test mit 1.2.0 (Johann und Leon):**
  - *Fehler:* Kam ein Titel aus der Warteschlange dran, landete beim Gast automatisch ein Titel aus der Playlist des Hosts in der Warteschlange, „von Leon“. Ursache: Direkt nach dem Laden meldete YT beim Host noch die alte Playlist. Der Gast lud den Titel mit dieser Playlist, sein YT sprang in die Playlist, und Pegel hielt das für eine eigene Wahl.
  - *Behebung:* Titel aus der Warteschlange gehen ohne Playlist an die Gäste. Ein anderer Titel zählt nur dann als Wahl des Gasts, wenn er kurz vorher (≤ 4 s) wirklich in YT geklickt hat.
  - *Wunsch:* Hat ein Freund eine offene Party, steht in seiner Zeile „Beitreten“. „Zu meiner Party einladen“ wandert ins ⋯-Menü.
  - Die Interpreten-Zeile aus der Suche („Song • Künstler • 3,6 Mrd. Wiedergaben“) wird auf den Künstler gekürzt.
- **Zweiter Test (1.2.1):** Bei Johann (angemeldet) lief nach dem aktuellen Titel die eigene Playlist weiter statt des Titels aus der Warteschlange. Manuelles Überspringen funktionierte.
  - *Mit Testprofilen nicht nachstellbar:* Fenster offen, im Tray, minimiert und YT-Seite verdeckt liefen alle sauber. Die YT-Ansicht wird ohnehin nicht gedrosselt (`backgroundThrottling: false`).
  - *Vermutete Ursache:* YT nutzt bei angemeldeten Konten ein zweites Media-Element (z. B. zum Vorladen). Pegel nahm immer das erste, sah „pausiert“ und falsche Zeiten und verpasste so das Titelende.
  - *Behebung:* `media()` nimmt das spielende Element. Position und Länge kommen aus YTs Player (`getCurrentTime`, `getDuration`, `getPlayerState`). Die Prüfung aufs Titelende läuft zusätzlich bei jedem `timeupdate` und `ended`.
  - Bestätigung steht aus.

**Schritte**

- [x] Protokoll v2 und Server (Warteschlange, Steuerbefehle, Aktivität), Tests. Der Hub akzeptiert weiter v1.
- [x] YT-Seite: Player-Fähigkeiten geprüft (`getPlaylistIndex` unbrauchbar, Warteschlangen-Daten nutzbar), „+“-Knopf an Listen-Titeln
- [x] Host: Warteschlange abspielen (≤ 300 ms vor Titelende), Rückkehr zur Playlist, Befehle der Gäste ausführen
- [x] Gast: YT-Knöpfe (Pause, Play, Spulen, Weiter), Mini-Player, Tray und Panel werden zu Party-Befehlen, wenn erlaubt
- [x] UI: Warteschlange mit „von …“, Entfernen, „Als Nächstes“ (Host), Play/Pause und Überspringen in der Party-Karte, Schalter „Alle dürfen steuern“, Aktivität in der Party-Pille, Mini-Player-Knöpfe
- [x] Test mit zwei Instanzen (lokaler Server): „+“ in der Suche, Überspringen durch den Gast, Pause über YTs Knopf, Rückkehr ins Album, Neuladen beim Gast ohne Party-Pause
- [x] Server deployt und Release 1.2.0 (mit den Theme-Effekten und dem Taskleisten-Icon-Fix). Pegel 1.1.0 sieht weiter Freunde, für Partys braucht es 1.2.0
- **Fertig, wenn:** Zwei Leute abwechselnd Titel per „+“ hinzufügen, beide pausieren und überspringen können und nach der Warteschlange die Playlist des Hosts an der richtigen Stelle weiterläuft.

### M12 – Wer Musik startet, legt auf (Release 1.3, ersetzt die Warteschlange aus M11)

> Johanns Entscheidung nach den Tests von 1.2.x: Die Warteschlange fliegt wieder raus. Wichtiger ist, dass die Playlist zuverlässig synchron läuft. Wer etwas anderes hören will, startet es einfach. Unter Freunden spricht man sich ab, oder man nutzt eine gemeinsame Playlist.

- **Übernehmen:** Startet ein Gast in YT selbst eine Playlist oder einen Titel (echter Klick, ≤ 4 s vorher), wird er automatisch Host (`host.claim`). Alle anderen, auch der bisherige Host, folgen ihm.
  - Das klappt auch mit privaten Playlists, weil die anderen Titel für Titel laden.
  - Bis die neue Rolle ankommt, lässt Pegel den Player des Gasts in Ruhe. Kommt nichts, springt er nach 4 s zurück.
- **Entfernt:** Warteschlange, „+“-Knopf, Rückkehr zur Playlist (`readResumeEndpoint`), die Nachrichten `queue.*` und die zugehörigen Selektoren.
- **Bleibt:**
  - „Alle dürfen steuern“: Pause, Play, Weiter und Spulen für alle, auch über YTs Knöpfe, Mini-Player und Tray.
  - Ohne den Schalter steuert der Host allein wie in M10. Wählt ein Gast dann einen Titel, wird er dem Host vorgeschlagen, „Abspielen“ spielt ihn sofort.
- **Robustheit aus 1.2.2 bleibt:** Pegel nutzt das spielende Media-Element, die Zeiten kommen aus YTs Player-API, und die Prüfungen laufen zusätzlich bei `timeupdate`.
- **Kompatibilität:** 1.2.x-Clients verbinden sich weiter. Ihre Warteschlangen-Nachrichten lehnt der Server ab, ohne dass etwas kaputtgeht.

- [x] Protokoll und Server: `host.claim` statt Warteschlange, Tests
- [x] YT-Engine: eigener Klick → Übernehmen, Warteschlangen-Logik entfernt
- [x] Main, IPC und UI: Warteschlange und „+“ entfernt, Hinweistext für Gäste
- [x] Test mit zwei Instanzen: Gast startet einen Titel per echtem Klick → wird Host, der bisherige Host folgt (25–50 ms)
- [x] Server deployt und Release 1.3.0

### M13 – Hören, was Freunde hören

> Wunsch von Johann nach 1.3.0. Noch kein Release, es kommt vielleicht mehr dazu.

- **Titel:** In der Freundesliste ist „Titel – Interpret“ klickbar und spielt denselben Titel in der eigenen YT-Ansicht ab (`yt:play-track`, Navigation innerhalb der Seite). Das geht auch ohne Party.
- **Playlist:** Darunter steht „aus „Playlistname““. Ein Klick öffnet die Playlist-Seite.
  - Öffentliche und nicht gelistete Playlists öffnen sich über ihre ID.
  - Private zeigen in YT eine leere Seite ohne Überschrift. Pegel prüft deshalb nach 7 s, ob die Playlist-Seite erschienen ist, und meldet sonst „… ist privat oder nicht verfügbar“.
  - „LM“ (Lieblingssongs) wird nicht geteilt, weil sie beim Freund seine eigene Liste öffnen würde.
- **In einer Party:** Als Gast übernimmt man damit (mit „Alle dürfen steuern“). Ohne den Schalter weist Pegel darauf hin, dass der Host steuert.
- **Datenschutz:** `NowPlaying` trägt zusätzlich `playlistId` und `playlistTitle`. Es gilt dieselbe Freigabe wie bei „Hört gerade teilen“.
- **Server:** Der Hub muss die neuen Felder durchreichen. Bis zum nächsten Deploy entfernt der laufende Server sie, dann ist nur der Titel klickbar.
- [x] Protokoll: `playlistId` und `playlistTitle` in `NowPlaying`
- [x] Klick auf Titel und Playlist, Prüfung auf private Listen, Verhalten in der Party
- [x] Getestet mit zwei Instanzen (lokaler Server): Titel startet, Album-Seite öffnet sich, unbekannte Playlist ergibt keine Überschrift
- [x] Server deployt und Release 1.4.0 (zusammen mit den überarbeiteten Theme-Effekten)

### M14 – Benachrichtigungen (nach 1.5.0)

- [x] System-Benachrichtigung, wenn jemand deiner Party beitritt (nur für den Host, sonst bekäme jeder Gast eine pro Gast). Innerhalb von Pegel sehen alle Mitglieder einen kurzen Hinweis.
- [x] Einladungen und Beitritte teilen sich `notifySystem` in `src/main/social/index.ts`: nur, solange kein Pegel-Fenster im Vordergrund ist. Ein Klick öffnet das Social-Panel.
- [x] Schalter „Benachrichtigungen“ unter Freunde & Party (`social.notifications`, standardmäßig an)
- [x] Changelog-Eintrag und Release 1.6.0
- [ ] Test mit einem Freund (Johann)

### M15 – Mini-Player: eigenes Theme und Transparenz (nach 1.6.0)

- [x] Schalter „Eigenes Theme für den Mini-Player“ mit eigener Theme-Auswahl (`mini.ownTheme`, `mini.theme`, `miniThemeId()`). Beim ersten Einschalten startet es mit dem Theme des Hauptfensters, ausgeschaltet bleibt die Wahl gespeichert.
- [x] Regler „Transparenz des Mini-Players“ (30–100 %, `mini.opacity`, `BrowserWindow.setOpacity`). Mit der Maus darüber ist er voll sichtbar. Der Main-Prozess prüft die Mausposition, weil das Fenster eine Ziehfläche ist und die Seite unter Windows dort keine Mausereignisse bekommt. Unter Linux ignoriert Electron die Deckkraft.
- [x] Visualizer: keine Kappen am Boden, solange nichts spielt (vorher eine gestrichelte Linie)
- [x] Changelog-Eintrag und Release 1.7.0

### M16 – Mediensteuerung in der Taskleisten-Vorschau (Windows)

- [x] Zurück, Abspielen/Pause und Weiter unter dem Vorschaubild in der Taskleiste (`setThumbarButtons`, `src/main/thumbar.ts`). Ohne Titel sind die Tasten ausgegraut, das Symbol folgt dem Wiedergabestatus.
- [x] Symbole im Code gezeichnet (`src/main/media-icons.ts`, 16/24/32 px), hell oder dunkel passend zur Taskleiste (`nativeTheme.shouldUseDarkColorsForSystemIntegratedUI`)
- [x] Nach dem Verstecken im Tray setzt Pegel die Tasten neu (Windows verwirft sie)
- [ ] Prüfung in der echten Taskleiste durch Johann, Changelog-Eintrag beim nächsten Release
- macOS hat keine Vorschau-Leiste. Dort decken „Jetzt läuft“ und das Menüleisten-Menü das ab.

### Später (optional)

- Liedtexte im Seitenpanel, Last.fm-Scrobbling, weitere Themes
- Echter Link-Handler (Klick im Browser bzw. in Discord öffnet Pegel). Braucht Signierung bzw. eine Browser-Erweiterung.

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
| YT ändert die interne Navigation (`watchEndpoint`) | mittel | Rückfallebene `loadURL` (langsamer, Party bleibt nutzbar), Selbsttest meldet es |
| Party driftet trotz Korrektur (Bluetooth, langsames Laden) | mittel | Ausgabelatenz der EQ-Kette herausrechnen, „Audio-Versatz“ von Hand, Sprungvorlauf lernen |
| Cloudflare-Free-Plan reicht nicht oder ändert sich | niedrig | Nachrichtenraten drosseln (Status nur bei Änderung), DO-Code läuft auch im Paid-Plan (5 $/Monat) unverändert |

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
