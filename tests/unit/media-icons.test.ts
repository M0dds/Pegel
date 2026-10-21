import { describe, expect, it } from 'vitest';
import { renderMediaGlyph, type MediaGlyph } from '../../src/main/media-icons';

const alphaAt = (px: Uint8Array, size: number, x: number, y: number) => px[(y * size + x) * 4 + 3]!;

describe('media glyphs', () => {
  it('draws something for every glyph and keeps the corners empty', () => {
    for (const glyph of ['previous', 'play', 'pause', 'next'] as MediaGlyph[]) {
      const px = renderMediaGlyph(glyph, 32, [255, 255, 255]);
      const covered = Array.from({ length: 32 * 32 }, (_, i) => px[i * 4 + 3]!).filter(
        (a) => a > 0,
      );
      expect(covered.length, glyph).toBeGreaterThan(100);
      expect(alphaAt(px, 32, 0, 0), glyph).toBe(0);
      expect(alphaAt(px, 32, 31, 31), glyph).toBe(0);
    }
  });

  it('leaves the gap between the pause bars empty', () => {
    const px = renderMediaGlyph('pause', 20, [0, 0, 0]);
    expect(alphaAt(px, 20, 10, 10)).toBe(0);
    expect(alphaAt(px, 20, 6, 10)).toBe(255);
  });
});
