/**
 * Mic recording smoke: fake media stream + timed stop.
 * Exits non-zero if a "chunk lost" toast surfaces (Test 2.4 regression guard).
 * Usage: DHVANI_URL=http://127.0.0.1:3001 RECORD_MS=25000 npm run qa:smoke
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DHVANI_URL || "http://127.0.0.1:3001";
const OUT = path.join(process.cwd(), "qa-report-screenshots");
const RECORD_MS = Number(process.env.RECORD_MS || 25000);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["microphone"],
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page]", msg.text());
  });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("dhvani-mode", "personal");
    localStorage.setItem("dhvani-theme", "light");
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const startBtn = page.getByRole("button", { name: "Start", exact: true });
  await startBtn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "record-smoke-pre-start.png"), fullPage: true });
  await startBtn.click();

  const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
  let started = false;
  try {
    await stopBtn.waitFor({ state: "visible", timeout: 15000 });
    started = true;
  } catch {
    // Start never flipped to Stop within 15s — record a diagnostic but
    // keep going so we still capture any toast that surfaced.
  }

  const observeMs = started ? RECORD_MS : Math.min(RECORD_MS, 10000);
  let lostChunkSeenDuringRecord = false;
  const endAt = Date.now() + observeMs;
  while (Date.now() < endAt) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (/chunk \d+ was lost|chunks failed|\(\d+ failed\)/i.test(body)) {
      lostChunkSeenDuringRecord = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (started) {
    await stopBtn.click().catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));
  }

  const bodyText = await page.locator("main").innerText().catch(() => "");
  const fullBody = await page.locator("body").innerText().catch(() => "");
  const lostChunkFinal =
    lostChunkSeenDuringRecord ||
    /chunk \d+ was lost|chunks failed|\(\d+ failed\)/i.test(fullBody);

  await page.screenshot({
    path: path.join(OUT, "record-smoke-after-stop.png"),
    fullPage: true,
  });
  await browser.close();

  console.log(
    JSON.stringify(
      {
        recordMs: RECORD_MS,
        started,
        lostChunkToast: lostChunkFinal,
        transcriptSnippet: bodyText.slice(0, 1200),
      },
      null,
      2
    )
  );
  // The "chunk lost" toast is the real regression guard. Not-starting in
  // headless (fake media) is a known env limitation — we report it but
  // don't fail the script on it.
  if (lostChunkFinal) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
