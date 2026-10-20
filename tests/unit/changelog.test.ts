import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  changelogToShow,
  formatReleaseDate,
  isExpandedByDefault,
} from '@shared/changelog';

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

describe('changelogToShow', () => {
  const current = CHANGELOG[0]!.version;

  it('opens once after an update', () => {
    expect(changelogToShow(current, '0.9.0', true)).toBe(current);
  });

  it('counts settings from before the feature as an update, a fresh install not', () => {
    expect(changelogToShow(current, undefined, true)).toBe(current);
    expect(changelogToShow(current, undefined, false)).toBeNull();
  });

  it('shows nothing for the same version, a downgrade or a version without entry', () => {
    expect(changelogToShow(current, current, true)).toBeNull();
    expect(changelogToShow('1.0.0', '1.4.0', true)).toBeNull();
    expect(changelogToShow('9.9.9', '1.0.0', true)).toBeNull();
  });
});

describe('isExpandedByDefault', () => {
  const entry = (version: string) => ({ version, date: '2026-10-20', items: ['x'] });
  const list = ['1.7.1', '1.7.0', '1.6.0', '1.5.0', '1.2.2', '1.2.1'].map(entry);

  it('opens the newest minor version and its patches only', () => {
    expect(list.filter((e) => isExpandedByDefault(e.version, list)).map((e) => e.version)).toEqual([
      '1.7.1',
      '1.7.0',
    ]);
  });

  it('opens just the release when it has no patches yet', () => {
    const fresh = list.slice(1);
    expect(
      fresh.filter((e) => isExpandedByDefault(e.version, fresh)).map((e) => e.version),
    ).toEqual(['1.7.0']);
  });
});
