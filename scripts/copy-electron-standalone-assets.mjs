#!/usr/bin/env node
// Copies .next/static and public/ into .next/standalone (where Next's
// standalone server expects them at runtime), and verifies that the
// standalone bundle has its own node_modules so the packaged Electron
// app can resolve `require('next')` without walking up to a missing
// repo-level node_modules.
//
// Run after `next build`, before `electron-builder`.

import { existsSync, statSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");
const nodeModulesDir = join(standaloneDir, "node_modules");
const nextModule = join(nodeModulesDir, "next");

if (!existsSync(standaloneDir)) {
  console.error(
    "ERROR: .next/standalone not found. Make sure next.config has output: \"standalone\" and you've run `next build`."
  );
  process.exit(1);
}

if (!existsSync(nextModule)) {
  console.error(
    "ERROR: .next/standalone/node_modules/next not found. The standalone build is incomplete — Electron will fail to start with `Cannot find module 'next'`."
  );
  process.exit(1);
}

console.log("✓ Standalone node_modules verified");
console.log("  next:", existsSync(nextModule));
console.log("  react:", existsSync(join(nodeModulesDir, "react")));
console.log(
  "  react-dom:",
  existsSync(join(nodeModulesDir, "react-dom"))
);

// Standalone server expects .next/static and public/ alongside it.
const staticSrc = join(root, ".next", "static");
const staticDst = join(standaloneDir, ".next", "static");
const publicSrc = join(root, "public");
const publicDst = join(standaloneDir, "public");

await mkdir(join(standaloneDir, ".next"), { recursive: true });

if (existsSync(staticSrc)) {
  await cp(staticSrc, staticDst, { recursive: true, force: true });
  console.log("✓ Copied .next/static →", staticDst);
} else {
  console.warn("WARN: .next/static missing");
}

if (existsSync(publicSrc)) {
  await cp(publicSrc, publicDst, { recursive: true, force: true });
  console.log("✓ Copied public/ →", publicDst);
} else {
  console.warn("WARN: public/ missing");
}

const sz = statSync(nextModule).isDirectory() ? "dir" : "?";
console.log(`Done. Standalone is ready for packaging (next module: ${sz}).`);
