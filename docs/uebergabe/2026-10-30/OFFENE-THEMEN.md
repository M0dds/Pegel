# Übergabe Pegel – Stand 30. Oktober 2026

Anlass: Johanns Claude-Konto wird geschlossen, es geht mit einem neuen Konto weiter. Diese Datei hält fest, was steht, was offen ist und was eine neue Claude-Session wissen sollte.

## 1. Stand

- **Version 1.9.0** ist veröffentlicht: <https://github.com/M0dds/Pegel/releases/latest> (Windows-Installer, macOS-DMGs für arm64 und x64).
- **Der Code ist vollständig auf GitHub** (`M0dds/Pegel`, Zweig `main`, alle 17 Versions-Tags von `v1.0.0` bis `v1.9.0`). Lokal gab es beim Erstellen dieser Datei nichts Ungesichertes: keine offenen Änderungen, keine ungepushten Commits, kein Stash. Der einzige Neben-Zweig `claude/exciting-pike-c6d10e` ist vollständig in `main` enthalten.
- **Der Server** für Freunde & Party liegt im Repo unter `server/` (Cloudflare Worker `pegel-social` mit Durable Objects `HUB` und `PARTY`). Geheimnisse liegen keine im Repo.
- **Nicht in Git** (hängt am Claude-Konto bzw. an diesem Rechner):
  - die Gesprächsverläufe der Claude-Sessions. Alle Entscheidungen daraus stehen aber in `docs/PLAN.md` (Meilensteine M0–M18) und in `CLAUDE.md` (feste Regeln, Stolperfallen).
  - zwei Notizen aus Claudes Gedächtnis. Ihr Inhalt steht unten in Abschnitt 5.

## 2. Konten und Dienste

Das Claude-Konto betrifft nur die Sessions selbst. Diese Dienste laufen unabhängig davon weiter:

| Dienst | Wofür | Wer hat Zugriff |
| --- | --- | --- |
| GitHub `M0dds/Pegel` | Code, Releases, Update-Dateien, Build-Workflows (`.github/workflows/`) | Johann (`M0dds`) |
| Cloudflare | Worker `pegel-social` (Freunde & Party). Deploy: `cd server`, dann `npm run deploy` (fragt die Cloudflare-Anmeldung ab) | Johann |
| Google/YouTube | Johanns YT-Music-Konto, darin die private Test-Playlist „Pegel Test“ | Johann |

Eine neue Claude-Session braucht für Releases die GitHub-Anmeldung im Terminal (`gh auth status`) und für Server-Deploys die Cloudflare-Anmeldung (`npx wrangler login`). Beides gehört zu Johann, nicht zum Claude-Konto.

## 3. Offene Themen

Nach Wichtigkeit sortiert.

1. **Voller Name in der Server-Adresse.** In `src/main/social/config.ts` steht die Worker-Adresse, und ihre Subdomain enthält Johanns vollen Namen. Das ist öffentlich (Repo und alle Versionen ab 1.1.0). Lösung: in Cloudflare die workers.dev-Subdomain umbenennen oder eine eigene Domain nutzen, die neue Adresse in `config.ts` eintragen, releasen. Da installierte Versionen die alte Adresse fest eingebaut haben, sollte die alte Adresse eine Übergangszeit lang weiterlaufen.
2. **macOS ist ungetestet.** Die DMGs werden gebaut, wurden aber nie auf einem Mac gestartet (M8). Zu prüfen: Start trotz Gatekeeper, Tray als Template-Icon, Medientasten, Update-Hinweis mit Download-Link. Risiko: Neuere macOS-Versionen fragen eventuell nach, wenn Pegel die Zwischenablage liest („Kopierte Links erkennen“).
3. **Tests, die nur Johann machen kann:**
   - M9: Link aus Discord kopieren und in Pegel öffnen
   - M10: Party über zwei echte Rechner messen, Test mit 3+ Leuten (einer ohne Premium wegen Werbung, einer mit Bluetooth)
   - M14: Party-Benachrichtigungen mit einem Freund, während Pegel im Hintergrund ist
   - Abschnitt 8 in `docs/PLAN.md`: Test-Checkliste vor jeder Weitergabe. Sie spricht noch von „4 Themes“, inzwischen sind es 10.
4. **Discord-Status (M6)** ist zurückgestellt. Braucht eine Discord-Application-ID (siehe Abschnitt 4.9 in `docs/PLAN.md`).
5. **Kontrast im Standard-Theme:** Text auf Akzentflächen hat nur 3,8 : 1 (empfohlen sind 4,5 : 1). Noch nicht entschieden, ob das so bleibt.
6. **Taskleisten-Buttons nach einem Wechsel des Windows-Designs** (hell/dunkel): Die Icons wechseln vermutlich nicht sofort mit. Windows zeigt ein geändertes Icon an derselben Stelle nicht an, siehe Stolperfallen in `CLAUDE.md`. Ungetestet, eher kosmetisch.
7. **Ideen für später:** Liedtexte im Seitenpanel, Last.fm-Scrobbling, weitere Themes, ein echter Link-Handler (Klick auf einen YT-Link öffnet Pegel; braucht Signierung oder eine Browser-Erweiterung).

## 4. Aufräumen (optional)

- Die private Playlist „Pegel Test“ in Johanns YT-Music-Konto (Drag-&-Drop-Tests) kann gelöscht werden.
- Der zusammengeführte Zweig `claude/exciting-pike-c6d10e` und sein Worktree unter `.claude/worktrees/` können weg.
- Test-Profile der Claude-Sessions liegen unter `%TEMP%\claude\D--Projects-ytmusic\…` und können gelöscht werden.

## 5. Für neue Claude-Sessions

- Vor jeder Arbeit `CLAUDE.md` und `docs/PLAN.md` lesen.
- **Johanns Vorlieben** (bisher in Claudes Gedächtnis):
  - Optische Details sind ihm sehr wichtig. Keine nativ aussehenden Bedienelemente (Auswahllisten, Regler, Checkboxen im Betriebssystem-Stil). Abstände und Ausrichtung in Screenshots genau prüfen, bevor etwas als fertig gilt.
  - Test-Wiedergabe ist in Ordnung, aber mit einem neutralen Titel, nie mit einem Meme-Song. Test-Instanzen danach schließen.
- **Release-Ablauf:** Version in `package.json` erhöhen, Eintrag oben in `src/shared/changelog.ts` (sonst schlägt ein Test fehl), `npm run typecheck`, `npm test`, `npm run lint`, committen, Tag `v<Version>` pushen. Der Workflow `.github/workflows/release.yml` baut und veröffentlicht. Hat GitHub gerade keinen freien Mac, bricht der macOS-Build ab: dann die fehlgeschlagenen Jobs neu starten (`gh run rerun <id> --failed`). Releasen nur, wenn Johann es sagt.
- **Testen:** eigenes Profil per Umgebungsvariable `PEGEL_USER_DATA`, Start mit `--remote-debugging-port=9222` und `--inspect=9229`, Ton stumm schalten (`webContents.setAudioMuted(true)`). Nie die echte Maus des Nutzers bewegen. Hover-Zustände lassen sich per DevTools erzwingen (`CSS.forcePseudoState`).
