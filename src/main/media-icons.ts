// Media control glyphs (previous, play, pause, next) for the Windows taskbar
// preview, drawn in code like the tray icon. Shapes on a 20×20 grid.
import { encodePng, type Rgb } from './tray-icon';

export type MediaGlyph = 'previous' | 'play' | 'pause' | 'next';

type Point = readonly [number, number];
type Shape = { poly: readonly Point[] } | { rect: readonly [number, number, number, number] };

const GRID = 20;
const SUPERSAMPLE = 4;

const SHAPES: Record<MediaGlyph, readonly Shape[]> = {
  play: [
    {
      poly: [
        [6, 3.5],
        [16.5, 10],
        [6, 16.5],
      ],
    },
  ],
  pause: [{ rect: [5, 4, 8.6, 16] }, { rect: [11.4, 4, 15, 16] }],
  next: [
    {
      poly: [
        [3.5, 4],
        [12.5, 10],
        [3.5, 16],
      ],
    },
    { rect: [13.4, 4, 16, 16] },
  ],
  previous: [
    {
      poly: [
        [16.5, 4],
        [7.5, 10],
        [16.5, 16],
      ],
    },
    { rect: [4, 4, 6.6, 16] },
  ],
};

function insidePolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inside(x: number, y: number, shape: Shape): boolean {
  if ('rect' in shape) {
    const [x0, y0, x1, y1] = shape.rect;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }
  return insidePolygon(x, y, shape.poly);
}

/** RGBA pixels of a glyph at `size` px, anti-aliased by supersampling. */
export function renderMediaGlyph(glyph: MediaGlyph, size: number, color: Rgb): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const scale = GRID / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) * scale;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) * scale;
          if (SHAPES[glyph].some((s) => inside(x, y, s))) cover++;
        }
      }
      const i = (py * size + px) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = Math.round((cover / SUPERSAMPLE ** 2) * 255);
    }
  }
  return out;
}

export function mediaGlyphPng(glyph: MediaGlyph, size: number, color: Rgb): Buffer {
  return encodePng(size, size, renderMediaGlyph(glyph, size, color));
}
