import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const resources = join(__dirname, '..', '..', 'resources');

interface Entry {
  size: number;
  format: 'png' | 'bmp';
  /** RGBA, top-down. */
  rgba: Uint8Array;
}

function decodePng(png: Buffer): { width: number; rgba: Uint8Array } {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = png.readUInt32BE(pos + 8);
      height = png.readUInt32BE(pos + 12);
      expect(png[pos + 16]).toBe(8); // bit depth
      expect(png[pos + 17]).toBe(6); // RGBA
    }
    if (type === 'IDAT') idat.push(png.subarray(pos + 8, pos + 8 + length));
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0); // filter: none (our encoder)
    rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  }
  return { width, rgba };
}

function decodeBmp(dib: Buffer, size: number): Uint8Array {
  expect(dib.readUInt32LE(0)).toBe(40);
  expect(dib.readInt32LE(4)).toBe(size);
  expect(dib.readInt32LE(8)).toBe(size * 2);
  expect(dib.readUInt16LE(14)).toBe(32);
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = 40 + ((size - 1 - y) * size + x) * 4;
      const i = (y * size + x) * 4;
      rgba[i] = dib[o + 2]!;
      rgba[i + 1] = dib[o + 1]!;
      rgba[i + 2] = dib[o]!;
      rgba[i + 3] = dib[o + 3]!;
    }
  }
  return rgba;
}

function readIco(file: string): Entry[] {
  const ico = readFileSync(file);
  expect(ico.readUInt16LE(2)).toBe(1);
  const entries: Entry[] = [];
  for (let n = 0; n < ico.readUInt16LE(4); n++) {
    const e = 6 + n * 16;
    const size = ico[e] || 256;
    const data = ico.subarray(
      ico.readUInt32LE(e + 12),
      ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8),
    );
    if (data.readUInt32BE(0) === 0x89504e47) {
      const png = decodePng(data);
      expect(png.width).toBe(size);
      entries.push({ size, format: 'png', rgba: png.rgba });
    } else {
      entries.push({ size, format: 'bmp', rgba: decodeBmp(data, size) });
    }
  }
  return entries;
}

/** Share of opaque tile pixels and of accent-coloured (logo) pixels. */
function coverage(rgba: Uint8Array): { opaque: number; accent: number } {
  let opaque = 0;
  let accent = 0;
  const pixels = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    opaque++;
    if (rgba[i]! > 150 && rgba[i + 1]! < 120) accent++;
  }
  return { opaque: opaque / pixels, accent: accent / pixels };
}

describe('Windows app icon (resources/icon.ico)', () => {
  const entries = readIco(join(resources, 'icon.ico'));

  it('has every size the shell asks for', () => {
    expect(entries.map((e) => e.size)).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });

  it('stores small sizes as bitmaps and only 256 px as PNG', () => {
    for (const entry of entries) expect(entry.format).toBe(entry.size >= 256 ? 'png' : 'bmp');
  });

  // Regression: 1.1.0 shipped entries ≥ 24 px fully transparent, Windows showed
  // a black/blank taskbar icon.
  it.each([16, 24, 32, 48, 64, 128, 256])('shows the tile and the logo at %i px', (size) => {
    const entry = entries.find((e) => e.size === size)!;
    const { opaque, accent } = coverage(entry.rgba);
    expect(opaque).toBeGreaterThan(0.85);
    expect(accent).toBeGreaterThan(0.04);
  });
});
