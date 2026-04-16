/**
 * After `next build`, mirror Docker layout: static assets live under `.next/standalone`
 * so `node server.js` from that folder serves the app (used by the packaged Electron app).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error("copy-electron-standalone-assets: missing", serverJs, "— run `npm run build` first.");
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");

fs.mkdirSync(path.dirname(staticDest), { recursive: true });
fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
console.log("copy-electron-standalone-assets: synced .next/static and public/ into .next/standalone");
