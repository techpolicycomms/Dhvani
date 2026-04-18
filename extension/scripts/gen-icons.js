#!/usr/bin/env node
/**
 * Generate PNG icons for the Dhvani Chrome Extension.
 *
 * Writes extension/icons/icon-{16,48,128}.png as ITU-Blue (#009CD6)
 * rounded squares with a simple stylised waveform in white.
 *
 * Pure Node — no sharp / canvas / ImageMagick dependency, so this runs
 * anywhere Node is available. Uses PNG's "filter 0" scanlines + zlib
 * deflate.
 *
 * Run:
 *   node extension/scripts/gen-icons.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Brand palette.
const BG = [0x1d, 0xa0, 0xdb]; // ITU Blue
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, pixels) {
  // pixels: width*height*4 RGBA bytes.
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Filter 0 per scanline.
  const stride = width * 4;
  const rows = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    rows[y * (1 + stride)] = 0;
    pixels.copy(rows, y * (1 + stride) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(rows);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blend(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = Math.floor(size * 0.22); // rounded square corner radius
  const cx = size / 2;

  // Vertical bar centers for a 5-bar waveform, heights scaled per bar.
  const barCount = 5;
  const barWidth = Math.max(1, Math.round(size * 0.08));
  const barGap = Math.max(1, Math.round(size * 0.06));
  const totalWidth = barCount * barWidth + (barCount - 1) * barGap;
  const firstX = Math.round((size - totalWidth) / 2);
  // Per-bar heights (fraction of icon height). Shaped like an audio waveform.
  const barHeights = [0.35, 0.6, 0.85, 0.55, 0.4];

  function inRoundedSquare(x, y) {
    const r = radius;
    if (x >= r && x < size - r) return y >= 0 && y < size;
    if (y >= r && y < size - r) return x >= 0 && x < size;
    // corners
    const px2 = x < r ? r : size - 1 - r;
    const py2 = y < r ? r : size - 1 - r;
    const dx = x - px2;
    const dy = y - py2;
    return dx * dx + dy * dy <= r * r;
  }

  function inBar(x, y) {
    for (let i = 0; i < barCount; i++) {
      const bx = firstX + i * (barWidth + barGap);
      if (x >= bx && x < bx + barWidth) {
        const h = Math.round(size * barHeights[i]);
        const y0 = Math.round((size - h) / 2);
        if (y >= y0 && y < y0 + h) return true;
      }
    }
    return false;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (inRoundedSquare(x, y)) {
        if (inBar(x, y)) {
          px[i] = FG[0];
          px[i + 1] = FG[1];
          px[i + 2] = FG[2];
          px[i + 3] = 0xff;
        } else {
          px[i] = BG[0];
          px[i + 1] = BG[1];
          px[i + 2] = BG[2];
          px[i + 3] = 0xff;
        }
      } else {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
      }
    }
  }

  // Void reference to silence unused helper (not used but kept for future
  // anti-aliased corners).
  void blend;

  return encodePng(size, size, px);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const dest = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes)`);
}
