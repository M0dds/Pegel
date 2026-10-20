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
