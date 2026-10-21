import { isNewerVersion } from './update';

/**
 * What changed in each version, for the "Was ist neu" dialog (click on the
 * version in the settings). Newest first; the first entry must match the
 * version in package.json (checked by a test), so add it before a release.
 */
export interface ChangelogEntry {
  version: string;
  /** ISO date of the release. */
  date: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '1.8.4',
    date: '2026-10-21',
    items: ['Der Punkt auf der Zeitleiste hat jetzt die Farbe des Themes statt YouTube-Rot.'],
  },
  {
    version: '1.8.3',
    date: '2026-10-21',
    items: [
      'Auch der Mini-Player hat in der Taskleisten-Vorschau Zurück, Abspielen/Pause und Weiter.',
    ],
  },
  {
    version: '1.8.2',
    date: '2026-10-21',
    items: [
      'Der mittlere Knopf in der Taskleisten-Vorschau wechselt jetzt richtig zwischen Abspielen und Pause.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-10-21',
    items: [
      'Die Tasten Zurück, Abspielen/Pause und Weiter in der Taskleisten-Vorschau erscheinen jetzt auch während der Wiedergabe und nachdem Pegel im Infobereich war.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10-21',
    items: [
      'Windows: Fährst du in der Taskleiste über Pegel, gibt es unter dem Vorschaubild Zurück, Abspielen/Pause und Weiter.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-10-20',
    items: [
      '„Was ist neu“ zeigt die aktuelle Version und ihre Korrekturen ausgeklappt, ältere Versionen sind eingeklappt und lassen sich per Klick öffnen.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-20',
    items: [
      'Eigenes Theme für den Mini-Player: Unter Einstellungen → Darstellung kann der Mini-Player anders aussehen als das Hauptfenster.',
      'Transparenz des Mini-Players: Ein Regler macht ihn bis zu 30 % durchsichtig. Mit der Maus darüber ist er wieder voll sichtbar.',
      'Der Visualizer im Mini-Player zeigt keine gestrichelte Linie mehr, solange nichts spielt.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-20',
    items: [
      'Benachrichtigung, wenn jemand deiner Party beitritt, solange Pegel im Hintergrund ist. In Pegel selbst sehen alle in der Party einen kurzen Hinweis.',
      'Neuer Schalter „Benachrichtigungen“ unter Einstellungen → Freunde & Party, für Einladungen und Beitritte.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-20',
    items: [
      '„Was ist neu“: Ein Klick auf die Versionsnummer unter Einstellungen → Über zeigt, was sich in jeder Version geändert hat.',
      'Nach einem Update öffnet sich „Was ist neu“ einmal von selbst.',
      'Esc schließt in den Einstellungen zuerst offene Dialoge und Auswahllisten, erst dann die Seite.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-20',
    items: [
      'Mithören: Ein Klick auf den Titel, den ein Freund gerade hört, spielt ihn bei dir ab. „aus …“ öffnet seine Playlist, wenn sie öffentlich oder per Link geteilt ist.',
      'Die Freundesliste zeigt nur noch den Titel oder online/offline.',
      'Überarbeitete Theme-Effekte: echtes Polarlicht bei Nordlicht, Unterwasserlicht und Luftblasen bei Lagune, Neon-Raster bei Neon, Glühwürmchen und Nebel bei Wald, Lichtstrahlen bei Bernstein und ein funkelnder Sternenhimmel bei Mitternacht.',
      'Sakura hat stärkere Kontraste.',
      '„Visualizer im Mini-Player“ steht jetzt unter Darstellung.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-19',
    items: [
      'Party: Wer Musik startet, legt auf. Startet ein Gast einen Titel, übernimmt er die Party, und alle anderen hören mit. Das ersetzt die gemeinsame Warteschlange.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-10-19',
    items: ['Party: Die Warteschlange spielt am Ende eines Titels zuverlässig weiter.'],
  },
  {
    version: '1.2.1',
    date: '2026-10-19',
    items: [
      'Party: Keine doppelten Einträge mehr in der Warteschlange.',
      'Offenen Partys von Freunden kannst du direkt beitreten.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-19',
    items: [
      'Gemeinsame Party-Warteschlange: Titel per „+“ hinzufügen, Pause und Überspringen für alle, Schalter „Alle dürfen steuern“.',
      'Animierte Effekte für die meisten Themes, in den Einstellungen abschaltbar.',
      'Das Taskleisten-Symbol unter Windows ist nicht mehr schwarz.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-19',
    items: [
      'Freunde & Hör-Party: Freunde per Code hinzufügen, sehen, was sie hören, und gemeinsam in einer Party hören.',
      'Visualizer im Mini-Player.',
      'Neu gruppierte Titelleiste mit dem Social-Button.',
      'Keine Lücke mehr rechts neben der Player-Leiste.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-19',
    items: [
      'Erste Version: Equalizer mit Presets und Presets pro Playlist, Lautstärke angleichen, 10 Themes, Visualizer, Mini-Player, Tray und Medientasten, kopierte Links öffnen und automatische Updates.',
    ],
  },
];

/** "20. Oktober 2026". */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * After an update: the version whose changelog opens once by itself, or null.
 * A fresh install (welcome page not seen yet) and a downgrade show nothing.
 * Settings from before 1.5.0 have no `lastSeenVersion`; a seen welcome page
 * means Pegel was used before, so that counts as an update.
 */
export function changelogToShow(
  current: string,
  lastSeen: string | undefined,
  welcomeShown: boolean,
): string | null {
  const updated = lastSeen ? isNewerVersion(current, lastSeen) : welcomeShown;
  return updated && CHANGELOG.some((e) => e.version === current) ? current : null;
}

/** "1.7.1" → "1.7". */
function minorOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/**
 * Open in the dialog: the newest minor version (X.Y) and its patches (X.Y.Z);
 * everything older starts collapsed. E.g. with 1.7.1 on top: 1.7.1 and 1.7.0.
 */
export function isExpandedByDefault(
  version: string,
  entries: readonly ChangelogEntry[] = CHANGELOG,
): boolean {
  const latest = entries[0]?.version;
  return !!latest && minorOf(version) === minorOf(latest);
}
