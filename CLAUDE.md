# CLAUDE.md – Pegel

Pegel ist ein inoffizieller Desktop-Client für YouTube Music, gebaut mit Electron und TypeScript für Windows und macOS. Er lädt music.youtube.com in eine eigene `WebContentsView` und ergänzt einen 10-Band-Equalizer, Themes (u. a. Sakura), Tray und Medientasten, Mini-Player, Autostart und Discord-Status.

- **Vollständiger Plan, Architektur und Meilensteine:** `docs/PLAN.md` – vor jeder Arbeit lesen.
- **Design-Referenz:** `design/mockup.html` – Farben, Abstände, Texte und Presets von dort übernehmen.

## Arbeitsweise

- Meilensteine aus `docs/PLAN.md` **der Reihe nach** umsetzen (M0 → M8). Nach jedem Meilenstein: App starten und prüfen, Häkchen in `docs/PLAN.md` setzen, committen.
- Vor größeren Abweichungen vom Plan erst nachfragen.
- Entwicklungsrechner: Windows (Johann), später macOS. Plattformunterschiede immer mitdenken (`process.platform`), nichts nur für Windows bauen.

## Befehle

- `npm run dev`: App mit Hot Reload
- `npm run build`: Produktions-Build
- `npm test`: Vitest
- `npm run lint`: ESLint
- `npm run dist`: Installer (electron-builder). `-- --profile=<name>` für Geschenk-Builds

## Feste Regeln

- **UI-Sprache Deutsch.** Code, Bezeichner und Commit-Messages auf Englisch.
- **Keine Werbeblocker-, Download- oder Stream-Extraktions-Funktionen.** Wiedergabe ausschließlich über die offizielle YT-Music-Seite.
- **Keine Zugangsdaten speichern.** Der Login läuft nur über Google in der Session-Partition `persist:pegel`.
- **Alle YT-DOM-Selektoren nur in `src/yt/selectors.ts`.** Bevorzugt `navigator.mediaSession` und das Media-Element nutzen, das DOM nur als letzte Option.
- **YT-Seite gestalten ist erlaubt** (Farben, Formen, Scrollleisten, Hintergründe, eingefügte Deko- oder Visualizer-Elemente), aber robust: bevorzugt YTs CSS-Variablen, Selektoren nur aus `src/yt/selectors.ts`, nichts darf Klicks, Scrollen oder Bedienung von YT blockieren (`pointer-events: none` für Deko). Ändert YT etwas, darf höchstens die Optik leiden, nie die Funktion.
- Sicherheit: `contextIsolation: true`, `nodeIntegration: false`. Preload-APIs geben nur konkrete Funktionen frei. Fremde Links per `shell.openExternal`.
- Der Main-Prozess ist die einzige Quelle für Einstellungen und EQ-Werte. UI und YT-Ansicht bekommen sie per IPC (Kanäle typisiert in `src/shared/ipc.ts`).
- Theme-Token-Namen exakt wie im Mockup: `bg`, `surface`, `surface-2`, `surface-3`, `border`, `text`, `text-dim`, `accent`, `accent-soft`, `on-accent`.
- TypeScript `strict`, kein `any` ohne Begründung im Kommentar.

## Bekannte Stolperfallen

- `createMediaElementSource` darf pro Element nur einmal aufgerufen werden (WeakSet). Der AudioContext muss bei `play` per `resume()` geweckt werden.
- Google-Login: YT Music bekommt einen Chrome-UA, aber Anfragen an `accounts.google.com` müssen den **unveränderten Electron-UA** senden. Ein vorgetäuschter Chrome (auch mit passenden Client Hints) führt zu „Browser nicht sicher“. Gleiches Vorgehen wie Pear Desktop.
- `insertCSS` nach jeder Navigation bzw. jedem `dom-ready` erneut anwenden.
- YT setzt `scrollbar-color` auf allen Elementen; solange das gesetzt ist, ignoriert Chromium `::-webkit-scrollbar`.
- Während Musik läuft, registriert YT einen `beforeunload`-Handler. Electron bricht Neuladen und Navigation dann stillschweigend ab (kein Dialog). Pegel übergeht ihn per `will-prevent-unload` → `preventDefault()`. Zum Testen braucht es echte Benutzeraktion (DevTools `Input.dispatchMouseEvent`), per Skript gestartete Wiedergabe löst den Handler nicht aus.
- macOS: Tray-Icons als Template-Image. Schließen versteckt das Fenster nur. Arm64-Builds ad-hoc signieren.
