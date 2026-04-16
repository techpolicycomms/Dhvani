#!/usr/bin/env node
/**
 * Generate PWA icons for Dhvani at all sizes required by manifest.json.
 *
 * Renders an ITU-Blue (#1DA0DB) rounded square with a white 5-bar audio
 * waveform. Pure Node — no sharp / canvas / ImageMagick dependency.
 *
 * Run:
 *   node scripts/generate-icons.js
 *
 * Outputs:
 *   public/icons/icon-{72,96,128,144,152,192,384,512}.png
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG = [0x1d, 0xa0, 0xdb]; // ITU Blue
const FG = [0xff, 0xff, 0xff]; // White

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, c]);
}

function encodePng(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const rows = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    rows[y * (1 + stride)] = 0; // filter none
    pixels.copy(rows, y * (1 + stride) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(rows, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = Math.floor(size * 0.18);
  const barCount = 5;
  const barWidth = Math.max(2, Math.round(size * 0.09));
  const barGap = Math.max(1, Math.round(size * 0.055));
  const totalW = barCount * barWidth + (barCount - 1) * barGap;
  const firstX = Math.round((size - totalW) / 2);
  const barHeights = [0.30, 0.55, 0.82, 0.50, 0.35];

  function inRoundedSquare(x, y) {
    const r = radius;
    if (x >= r && x < size - r) return true;
    if (y >= r && y < size - r) return true;
    const cx = x < r ? r : size - 1 - r;
    const cy = y < r ? r : size - 1 - r;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }

  function inBar(x, y) {
    for (let i = 0; i < barCount; i++) {
      const bx = firstX + i * (barWidth + barGap);
      if (x >= bx && x < bx + barWidth) {
        const h = Math.round(size * barHeights[i]);
        const y0 = Math.round((size - h) / 2);
        // Rounded ends
        const capR = barWidth / 2;
        if (y >= y0 + capR && y < y0 + h - capR) return true;
        // Top cap
        if (y >= y0 && y < y0 + capR) {
          const dx = x - (bx + capR);
          const dy = y - (y0 + capR);
          if (dx * dx + dy * dy <= capR * capR) return true;
        }
        // Bottom cap
        if (y >= y0 + h - capR && y < y0 + h) {
          const dx = x - (bx + capR);
          const dy = y - (y0 + h - capR);
          if (dx * dx + dy * dy <= capR * capR) return true;
        }
      }
    }
    return false;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (inRoundedSquare(x, y)) {
        if (inBar(x, y)) {
          px[i] = FG[0]; px[i + 1] = FG[1]; px[i + 2] = FG[2]; px[i + 3] = 0xff;
        } else {
          px[i] = BG[0]; px[i + 1] = BG[1]; px[i + 2] = BG[2]; px[i + 3] = 0xff;
        }
      } else {
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
      }
    }
  }
  return encodePng(size, size, px);
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const size of sizes) {
  const png = drawIcon(size);
  const dest = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes)`);
}
