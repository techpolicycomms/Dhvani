// electron-builder afterPack hook.
//
// Some electron-builder versions strip nested node_modules even when the
// glob explicitly asks for `.next/standalone/**/*`. This hook runs after
// the app has been packaged but before the .dmg is sealed, and copies
// .next/standalone/node_modules into the packaged app if it's missing.
//
// Without this, the packaged app fails on first launch with
// `Cannot find module 'next'`.

import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const productName = packager.appInfo.productFilename;

  let appResources;
  if (electronPlatformName === "darwin" || electronPlatformName === "mas") {
    appResources = join(
      appOutDir,
      `${productName}.app`,
      "Contents",
      "Resources",
      "app"
    );
  } else if (electronPlatformName === "win32") {
    appResources = join(appOutDir, "resources", "app");
  } else {
    appResources = join(appOutDir, "resources", "app");
  }

  const target = join(appResources, ".next", "standalone", "node_modules");
  const source = join(process.cwd(), ".next", "standalone", "node_modules");

  if (!existsSync(target) && existsSync(source)) {
    console.log("[afterPack] Copying standalone node_modules →", target);
    await cp(source, target, { recursive: true, force: true });
    console.log("[afterPack] Done.");
  } else if (existsSync(target)) {
    console.log("[afterPack] standalone node_modules already present.");
  } else {
    console.warn(
      "[afterPack] Source standalone node_modules missing — packaged app will likely fail to start."
    );
  }
}
