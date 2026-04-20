#!/usr/bin/env node
/**
 * Generate PWA + favicon + Electron build icons for Dhvani.
 *
 * Composites the official ITU microphone pictogram (from the ITU 2023
 * visual-identity PowerPoint, extracted to assets/icons/itu-microphone-
 * source.png) onto an ITU-Blue rounded-square app-icon plate. The
 * microphone is colour-swapped to white so the result reads cleanly
 * at 16×16 favicon size all the way up to 512×512 PWA install art.
 *
 * Previously this script drew a procedural 5-bar waveform; that was a
 * stand-in until we had a sanctioned ITU asset. The microphone is the
 * canonical Dhvani brand promise ("tap to record") and is on-brand for
 * ITU, so it replaces the waveform.
 *
 * Run:
 *   node scripts/generate-icons.js
 *
 * Outputs:
 *   public/icons/icon-{72,96,128,144,152,192,384,512}.png
 *   public/icon-192.png   (root alias used by manifest + layout)
 *   public/icon-512.png
 *   public/favicon.ico    (16/32/48 multi-res ICO)
 *   build/icon.png        (1024 master for electron-builder → .icns/.ico)
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ITU_BLUE = { r: 0x00, g: 0x9c, b: 0xd6 };
const SOURCE_PNG = path.join(
  __dirname,
  "..",
  "assets",
  "icons",
  "itu-microphone-source.png"
);

// PWA manifest sizes + the Electron-builder 1024 master + the favicon
// pipeline. Favicon is handled separately (multi-res .ico).
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ROOT_ALIAS_SIZES = [192, 512];
const ELECTRON_MASTER = 1024;
const FAVICON_SIZES = [16, 32, 48];

const OUT_ICONS_DIR = path.join(__dirname, "..", "public", "icons");
const OUT_PUBLIC = path.join(__dirname, "..", "public");
const OUT_BUILD = path.join(__dirname, "..", "build");

fs.mkdirSync(OUT_ICONS_DIR, { recursive: true });
fs.mkdirSync(OUT_BUILD, { recursive: true });

/**
 * Turn the source (blue line-art mic on light-blue background) into a
 * transparent-background white mic. We use luminance as a proxy for
 * "is this a line pixel": the mic strokes are saturated and dark-ish
 * ITU cyan, while the plate is near-white pale blue. Anything below
 * the luminance threshold becomes opaque white; everything else
 * becomes transparent.
 *
 * Keeping the alpha continuous (via 0-255 interpolation around the
 * threshold) preserves the anti-aliased edges so the result stays
 * crisp when downscaled to 16×16.
 */
async function makeWhiteMicMask() {
  const src = sharp(SOURCE_PNG).ensureAlpha();
  const { data, info } = await src
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  const LUM_LO = 160;
  const LUM_HI = 240;
  for (let i = 0, o = 0; i < data.length; i += channels, o += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let alpha;
    if (lum <= LUM_LO) alpha = 255;
    else if (lum >= LUM_HI) alpha = 0;
    else alpha = Math.round(((LUM_HI - lum) / (LUM_HI - LUM_LO)) * 255);
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = alpha;
  }
  return sharp(out, { raw: { width, height, channels: 4 } });
}

function roundedSquareSvg(size) {
  const r = Math.round(size * 0.18);
  const hex = `#${ITU_BLUE.r.toString(16).padStart(2, "0")}${ITU_BLUE.g
    .toString(16)
    .padStart(2, "0")}${ITU_BLUE.b.toString(16).padStart(2, "0")}`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${hex}"/>` +
      `</svg>`
  );
}

async function renderIcon(size, trimmedMicPng) {
  const plate = sharp(roundedSquareSvg(size), {
    density: 300,
  });
  // 72% of plate looks balanced: iOS/Android mask safe-area is ~80%
  // of the icon, so keeping the mic at 72% stays well inside the
  // inscribed circle. The ITU mic is line-art (no fill), so it needs
  // more bounding-box real estate than a solid glyph to read at
  // favicon size.
  const micSize = Math.round(size * 0.72);
  const micPngBuffer = await sharp(trimmedMicPng)
    .resize(micSize, micSize, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return plate
    .composite([{ input: micPngBuffer, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE_PNG)) {
    throw new Error(`missing source icon: ${SOURCE_PNG}`);
  }
  const whiteMic = await makeWhiteMicMask();
  // Trim the transparent padding around the mic so .resize(micSize)
  // actually fills the target box. Without this, sharp treats the
  // source's own whitespace as part of the image and the mic ends up
  // tiny (~10% of the plate). `trim()` with a low threshold keeps the
  // anti-aliased edge.
  const trimmedMicPng = await whiteMic
    .clone()
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).trim({ threshold: 10 }).png().toBuffer());

  for (const size of PWA_SIZES) {
    const png = await renderIcon(size, trimmedMicPng);
    const dest = path.join(OUT_ICONS_DIR, `icon-${size}.png`);
    fs.writeFileSync(dest, png);
    console.log(`wrote ${dest} (${png.length} bytes)`);
  }

  for (const size of ROOT_ALIAS_SIZES) {
    const png = await renderIcon(size, trimmedMicPng);
    const dest = path.join(OUT_PUBLIC, `icon-${size}.png`);
    fs.writeFileSync(dest, png);
    console.log(`wrote ${dest}`);
  }

  // Electron-builder master — it derives .icns and .ico from build/icon.png.
  const masterPng = await renderIcon(ELECTRON_MASTER, trimmedMicPng);
  const masterDest = path.join(OUT_BUILD, "icon.png");
  fs.writeFileSync(masterDest, masterPng);
  console.log(`wrote ${masterDest} (electron-builder master)`);

  // Favicon: multi-res PNGs packed into a single .ico. sharp doesn't emit
  // .ico natively, so we pack manually — each directory entry references
  // a single embedded PNG image.
  const faviconPngs = await Promise.all(
    FAVICON_SIZES.map((s) => renderIcon(s, trimmedMicPng))
  );
  const icoBuf = packIco(faviconPngs, FAVICON_SIZES);
  const favDest = path.join(OUT_PUBLIC, "favicon.ico");
  fs.writeFileSync(favDest, icoBuf);
  console.log(`wrote ${favDest} (multi-res)`);
}

function packIco(pngBuffers, sizes) {
  // ICONDIR: 6 bytes reserved + count
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(pngBuffers.length, 4);

  const entries = [];
  const images = [];
  let offset = 6 + 16 * pngBuffers.length;
  for (let i = 0; i < pngBuffers.length; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
