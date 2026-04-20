/**
 * Route screenshot sweep (light + dark). Covers Test 10 of E2E_TESTING_PROMPT.md.
 * Usage: DHVANI_URL=http://127.0.0.1:3001 npm run qa:sweep
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DHVANI_URL || "http://127.0.0.1:3001";
const OUT = path.join(process.cwd(), "qa-report-screenshots");
const routes = [
  "/",
  "/transcripts",
  "/tasks",
  "/mission",
  "/admin",
  "/download",
  "/offline",
  "/desktop-setup",
  "/url-transcribe",
  "/upload",
  "/auth/signin",
];
const failures = [];

async function shot(page, name) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  for (const theme of ["light", "dark"]) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.evaluate(
      ([t]) => {
        localStorage.setItem("dhvani-theme", t);
        localStorage.setItem("dhvani-mode", "power");
      },
      [theme]
    );
    await page.reload({ waitUntil: "networkidle" });

    for (const r of routes) {
      const safe = `${theme}-${r.replace(/\//g, "_") || "root"}`;
      try {
        await page.goto(BASE + r, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await new Promise((r) => setTimeout(r, 800));
        await shot(page, safe);
      } catch (e) {
        failures.push({ route: safe, error: e.message });
        console.error("FAIL", safe, e.message);
      }
    }
  }

  await browser.close();
  console.log(
    JSON.stringify(
      { out: OUT, routes: routes.length * 2, failed: failures.length, failures },
      null,
      2
    )
  );
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
