#!/usr/bin/env node
/**
 * Emit electron/dist/build-config.json with a server URL for the Electron
 * main process to load. Read at startup by resolveCentralServer() in
 * electron/main.ts; overrides the hard-coded production default.
 *
 * Usage:
 *   DHVANI_BUILD_SERVER_URL=http://localhost:3000 node scripts/write-electron-build-config.mjs
 *   node scripts/write-electron-build-config.mjs  # no file written — falls back to prod
 *
 * Called from npm scripts `package:mac:localhost` / `package:win:localhost`,
 * which chain together tsc + this writer + electron-builder.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "electron", "dist");
const outFile = path.join(outDir, "build-config.json");

const url = process.env.DHVANI_BUILD_SERVER_URL;

if (!url) {
  // Remove any stale config from a previous dev build so we don't
  // accidentally ship a production DMG pointing at localhost.
  try {
    fs.unlinkSync(outFile);
    console.log("[build-config] no DHVANI_BUILD_SERVER_URL — removed stale", outFile);
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
    console.log("[build-config] no DHVANI_BUILD_SERVER_URL — nothing to write");
  }
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify({ serverUrl: url }, null, 2) + "\n",
  "utf8"
);
console.log("[build-config] wrote", outFile, "serverUrl=" + url);
