// node --experimental-strip-types scripts/make-icons.mts
//
// Renders the app icon from the Pegel logo (four level bars, design/mockup.html)
// on a dark rounded tile and writes resources/icon.png (1024 px), icon.ico
// (Windows, 16–256 px) and icon.icns (macOS, 16–1024 px). The tray icons are
// rendered at runtime by src/main/tray-icon.ts with the same drawing code.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, renderLogoRgba } from '../src/main/tray-icon.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = [0x14, 0x13, 0x15] as const; // near-black, a touch warmer than #121212
const ACCENT = [0xff, 0x1f, 0x4b] as const; // Standard theme accent
/** macOS-style margin around the tile and corner radius, relative to the size. */
const MARGIN = 0.08;
const RADIUS = 0.225;
/** Logo size on the tile. */
const LOGO = 0.6;
const SS = 4;

function insideRoundedSquare(x: number, y: number, size: number): boolean {
  const m = size * MARGIN;
  const r = size * RADIUS;
  const lo = m;
  const hi = size - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function renderAppIcon(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const logoSize = Math.round(size * LOGO);
  const logo = renderLogoRgba(logoSize, ACCENT);
  const offset = Math.round((size - logoSize) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (insideRoundedSquare(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size)) cover++;
        }
      }
      const tileAlpha = cover / SS ** 2;
      const i = (y * size + x) * 4;
      let [r, g, b] = TILE as readonly number[];
      const lx = x - offset;
      const ly = y - offset;
      if (lx >= 0 && ly >= 0 && lx < logoSize && ly < logoSize) {
        const j = (ly * logoSize + lx) * 4;
        const a = logo[j + 3]! / 255;
        r = r! * (1 - a) + ACCENT[0] * a;
        g = g! * (1 - a) + ACCENT[1] * a;
        b = b! * (1 - a) + ACCENT[2] * a;
      }
      out[i] = Math.round(r!);
      out[i + 1] = Math.round(g!);
      out[i + 2] = Math.round(b!);
      out[i + 3] = Math.round(tileAlpha * 255);
    }
  }
  return out;
}

const png = (size: number) => encodePng(size, size, renderAppIcon(size));

/** ICO with PNG-compressed entries (supported since Windows Vista). */
function ico(sizes: number[]): Buffer {
  const images = sizes.map(png);
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const e = 6 + i * 16;
    header[e] = size >= 256 ? 0 : size; // 0 means 256
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(images[i]!.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += images[i]!.length;
  });
  return Buffer.concat([header, ...images]);
}

/** ICNS with PNG entries. */
function icns(): Buffer {
  const entries: [string, number][] = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic11', 32], // 16@2x
    ['icp6', 64],
    ['ic12', 64], // 32@2x
    ['ic07', 128],
    ['ic08', 256],
    ['ic13', 256], // 128@2x
    ['ic09', 512],
    ['ic14', 512], // 256@2x
    ['ic10', 1024], // 512@2x
  ];
  const chunks = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const resources = join(root, 'resources');
writeFileSync(join(resources, 'icon.png'), png(1024));
writeFileSync(join(resources, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
writeFileSync(join(resources, 'icon.icns'), icns());
console.log('resources/icon.png, icon.ico, icon.icns written');
