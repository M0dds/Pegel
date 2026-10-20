import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANGELOG, formatReleaseDate } from '@shared/changelog';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('changelog', () => {
  it('has an entry for the current version, newest first', () => {
    // Fails a release whose changes were not written down.
    expect(CHANGELOG[0]?.version).toBe(pkg.version);
  });

  it('has unique versions with dates and at least one item', () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it('formats dates in German', () => {
    expect(formatReleaseDate('2026-10-20')).toBe('20. Oktober 2026');
  });
});
