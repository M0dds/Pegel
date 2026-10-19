import { crc32, deflateSync } from 'node:zlib';

/**
 * The Pegel logo (four level bars, from design/mockup.html) rendered as PNG
 * in code, so the tray needs no image files. M8 replaces this with designed
 * icon files where the platform needs them.
 */

/** Bars in the logo's 24×24 coordinate space: x, top, opacity (all end at y = 20). */
const BARS = [
  { x: 2, top: 10, opacity: 1 },
  { x: 7.6, top: 4, opacity: 1 },
  { x: 13.2, top: 8, opacity: 0.75 },
  { x: 18.8, top: 13, opacity: 0.5 },
] as const;
const BAR_WIDTH = 3.2;
const BAR_BOTTOM = 20;
const RADIUS = 1.6;
const SUPERSAMPLE = 4;

export type Rgb = readonly [number, number, number];

function insideRoundedRect(px: number, py: number, x: number, top: number): boolean {
  const right = x + BAR_WIDTH;
  if (px < x || px > right || py < top || py > BAR_BOTTOM) return false;
  const cx = Math.min(Math.max(px, x + RADIUS), right - RADIUS);
  const cy = Math.min(Math.max(py, top + RADIUS), BAR_BOTTOM - RADIUS);
  return (px - cx) ** 2 + (py - cy) ** 2 <= RADIUS ** 2;
}

/** RGBA pixels (row-major) of the logo at `size`×`size`, antialiased. */
export function renderLogoRgba(size: number, color: Rgb): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const scale = 24 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alpha = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (x + (sx + 0.5) / SUPERSAMPLE) * scale;
          const py = (y + (sy + 0.5) / SUPERSAMPLE) * scale;
          const bar = BARS.find((b) => insideRoundedRect(px, py, b.x, b.top));
          if (bar) alpha += bar.opacity;
        }
      }
      const i = (y * size + x) * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = Math.round((alpha / SUPERSAMPLE ** 2) * 255);
    }
  }
  return pixels;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Minimal PNG encoder (8-bit RGBA, no interlace). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

export function logoPng(size: number, color: Rgb): Buffer {
  return encodePng(size, size, renderLogoRgba(size, color));
}
