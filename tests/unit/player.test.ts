import { describe, expect, it } from 'vitest';
import { isPlayerCommand, largestArtwork, toPlayerState, trackLabel } from '@shared/player';
import { encodePng, logoPng, renderLogoRgba } from '../../src/main/tray-icon';
import { runSelfTest, SELECTORS } from '../../src/yt/selectors';

const valid = {
  title: 'Coconut Cloud',
  artist: 'Vanessa Zinner',
  album: 'Coconut Cloud',
  artworkUrl: 'https://lh3.googleusercontent.com/x=w544-h544',
  isPlaying: true,
  positionSec: 12,
  durationSec: 180,
  liked: false,
};

describe('toPlayerState', () => {
  it('accepts a valid state', () => {
    expect(toPlayerState(valid)).toEqual(valid);
  });

  it('rejects incomplete states', () => {
    expect(toPlayerState(null)).toBeNull();
    expect(toPlayerState({ ...valid, title: 3 })).toBeNull();
    expect(toPlayerState({ ...valid, positionSec: Number.NaN })).toBeNull();
  });

  it('drops non-https artwork and unknown fields', () => {
    const state = toPlayerState({ ...valid, artworkUrl: 'file:///etc/passwd', extra: 1 });
    expect(state).not.toHaveProperty('artworkUrl');
    expect(state).not.toHaveProperty('extra');
  });
});

describe('isPlayerCommand', () => {
  it('validates commands', () => {
    expect(isPlayerCommand({ type: 'next' })).toBe(true);
    expect(isPlayerCommand({ type: 'seek', sec: 30 })).toBe(true);
    expect(isPlayerCommand({ type: 'seek' })).toBe(false);
    expect(isPlayerCommand({ type: 'setVolume', volume: '1' })).toBe(false);
    expect(isPlayerCommand({ type: 'rm -rf' })).toBe(false);
  });
});

describe('largestArtwork', () => {
  it('picks the biggest image', () => {
    const art = [
      { src: 'a', sizes: '60x60' },
      { src: 'c', sizes: '544x544' },
      { src: 'b', sizes: '226x226' },
    ];
    expect(largestArtwork(art)).toBe('c');
    expect(largestArtwork([])).toBeUndefined();
  });
});

describe('trackLabel', () => {
  it('formats and shortens', () => {
    expect(trackLabel(null)).toBe('Nichts wird abgespielt');
    expect(trackLabel(toPlayerState(valid))).toBe('Coconut Cloud – Vanessa Zinner');
    expect(trackLabel(toPlayerState(valid), 10)).toBe('Coconut C…');
  });
});

describe('selector self-test', () => {
  it('reports the features whose selectors are missing', () => {
    const present = new Set<string>([SELECTORS.nextButton, SELECTORS.previousButton]);
    const root = { querySelector: (s: string) => (present.has(s) ? {} : null) } as ParentNode;
    expect(runSelfTest(root)).toEqual(['Gefällt mir', 'Lautstärke']);
  });
});

describe('tray icon', () => {
  it('draws the bars with gaps between them', () => {
    const size = 24; // 1:1 with the logo's coordinate space
    const px = renderLogoRgba(size, [255, 0, 0]);
    const alpha = (x: number, y: number) => px[(y * size + x) * 4 + 3]!;
    expect(alpha(9, 12)).toBe(255); // inside the tall second bar
    expect(alpha(6, 12)).toBe(0); // gap between bar 1 and 2
    expect(alpha(9, 2)).toBe(0); // above all bars
    expect(alpha(20, 18)).toBeGreaterThan(100); // faded last bar (opacity .5)
    expect(alpha(20, 18)).toBeLessThan(140);
  });

  it('produces a PNG', () => {
    const png = logoPng(16, [0, 0, 0]);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(16); // IHDR width
    expect(encodePng(1, 1, new Uint8Array(4)).length).toBeGreaterThan(50);
  });
});
