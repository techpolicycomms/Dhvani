// Dhvani Electron main process.
//
// The window points at the central server (https://dhvani.itu.int by
// default, or DHVANI_SERVER_URL / the bundled build-config.json for
// internal-beta overrides). No local server, no bundled credentials,
// installer is ~50 MB.
//
// Dev is always local: loads http://localhost:3000.

import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  Menu,
  session,
  Tray,
  nativeImage,
} from "electron";
import path from "node:path";
import fs from "node:fs";

const IS_DEV = !app.isPackaged;

/**
 * Resolve the URL the Electron window should load. Priority order:
 *   1. Runtime env `DHVANI_SERVER_URL` — useful for ad-hoc overrides
 *      (`DHVANI_SERVER_URL=... open -a Dhvani`).
 *   2. Build-time `build-config.json` bundled into the asar/resources —
 *      lets an internal-beta DMG point at a staging or localhost URL
 *      without requiring the user to launch via a wrapper script.
 *   3. Hard default: the central production server.
 *
 * The build config is produced by electron-builder's `files` glob when
 * present alongside the compiled main.js; absence is fine, we just
 * fall through. See scripts/write-electron-build-config.mjs.
 */
function resolveCentralServer(): string {
  if (process.env.DHVANI_SERVER_URL) return process.env.DHVANI_SERVER_URL;
  try {
    const configPath = path.join(__dirname, "build-config.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { serverUrl?: string };
      if (parsed.serverUrl && typeof parsed.serverUrl === "string") {
        console.log(
          "[dhvani] using server URL from build-config.json:",
          parsed.serverUrl
        );
        return parsed.serverUrl;
      }
    }
  } catch (err) {
    console.warn("[dhvani] build-config.json read failed", err);
  }
  return "https://dhvani.itu.int";
}

const CENTRAL_SERVER = resolveCentralServer();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function offlineHtml(targetUrl: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Dhvani</title></head>
<body style="font-family:'Noto Sans','Helvetica Neue',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff;color:#003366">
  <div style="text-align:center;max-width:320px">
    <div style="font-size:24px;font-weight:700;color:#009CD6;margin-bottom:10px">Dhvani</div>
    <div style="font-size:14px;color:#6B7280;margin-bottom:14px">Unable to connect to the server.</div>
    <div style="font-size:12px;color:#9CA3AF;margin-bottom:16px">Check your connection, then retry.</div>
    <button onclick="location.href='${targetUrl}'" style="padding:8px 24px;background:#009CD6;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">Retry</button>
  </div>
</body></html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function targetUrl(): string {
  if (IS_DEV) return "http://localhost:3000";
  return CENTRAL_SERVER;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 480,
    minHeight: 520,
    backgroundColor: "#FFFFFF",
    title: "Dhvani",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for desktopCapturer audio capture.
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Surface a polite retry screen on transient network failure rather
  // than Chromium's raw ERR_INTERNET_DISCONNECTED page.
  const url = targetUrl();
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, failingUrl) => {
    if (!mainWindow) return;
    if (failingUrl === url && code !== -3) {
      console.warn("[dhvani] did-fail-load", { code, desc, failingUrl });
      mainWindow.loadURL(dataUrl(offlineHtml(url)));
    }
  });

  // Lock navigation to our target origin. Any attempt to navigate to an
  // external site (malicious link in transcript text, phishing tab
  // handoff, etc.) opens in the user's default browser instead of
  // taking over the BrowserWindow.
  // Entra OAuth hops must stay inside this window so the PKCE cookie
  // set at sign-in start is visible at callback time. Anything outside
  // this allowlist and our own origin gets kicked to the system browser.
  const AUTH_HOST_ALLOWLIST = new Set<string>([
    "login.microsoftonline.com",
    "login.microsoft.com",
    "login.windows.net",
    "graph.microsoft.com",
  ]);
  mainWindow.webContents.on("will-navigate", (event, nextUrl) => {
    try {
      const dest = new URL(nextUrl);
      const allowed = new URL(url);
      const isData = dest.protocol === "data:";
      const sameOrigin = dest.origin === allowed.origin;
      const isAuthHop =
        (dest.protocol === "https:" || dest.protocol === "http:") &&
        AUTH_HOST_ALLOWLIST.has(dest.hostname);
      if (!isData && !sameOrigin && !isAuthHop) {
        event.preventDefault();
        console.warn("[dhvani] blocked will-navigate to", nextUrl);
        // Open externally so users can still follow legitimate links.
        void import("electron").then(({ shell }) => shell.openExternal(nextUrl));
      }
    } catch {
      event.preventDefault();
    }
  });

  // New-window requests go to the user's default browser — never a
  // second BrowserWindow inside Dhvani.
  mainWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    void import("electron").then(({ shell }) => shell.openExternal(nextUrl));
    return { action: "deny" };
  });

  console.log("[dhvani] loading central server:", url);
  mainWindow.loadURL(url).catch((err) => {
    console.error("Dhvani: failed to load central server", err);
    mainWindow?.loadURL(dataUrl(offlineHtml(url)));
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "../public/icons/icon-192.png");
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    tray = new Tray(icon);
    const menu = Menu.buildFromTemplate([
      {
        label: "Show Dhvani",
        click: () => {
          if (!mainWindow) createWindow();
          else mainWindow.show();
        },
      },
      {
        label: "Start / Stop Capture",
        accelerator: process.platform === "darwin" ? "Cmd+Shift+T" : "Ctrl+Shift+T",
        click: () => {
          mainWindow?.webContents.send("toggle-capture");
        },
      },
      { type: "separator" },
      { label: "Quit Dhvani", click: () => app.quit() },
    ]);
    tray.setToolTip("Dhvani — meeting transcription");
    tray.setContextMenu(menu);
  } catch (err) {
    console.warn("Dhvani: tray creation failed (icon missing?)", err);
  }
}

app.whenReady().then(() => {
  // System-audio loopback handler. When the renderer calls
  // navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }),
  // Electron routes the permission callback here. We return a screen
  // source (required for API completeness on all platforms) plus
  // audio: "loopback", which Electron 30+ maps to:
  //   - macOS 13+  : ScreenCaptureKit system-audio tap (no driver install)
  //   - Windows 10+: WASAPI loopback
  //   - macOS <13  : loopback not supported — callback({}) fires, the
  //                  getDisplayMedia promise rejects in the renderer, and
  //                  useAudioCapture surfaces a clean error.
  try {
    // Note: newer Electron versions accept a second options arg
    // `{ useSystemPicker: false }`. The installed Electron 30.x typings
    // don't expose it yet, and the default behaviour (no system picker)
    // is what we want for a frictionless "start recording" flow anyway.
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer
          .getSources({ types: ["screen"] })
          .then((sources) => {
            if (sources.length === 0) {
              callback({});
              return;
            }
            callback({ video: sources[0], audio: "loopback" });
          })
          .catch((err) => {
            console.warn("[dhvani] desktopCapturer.getSources failed", err);
            callback({});
          });
      }
    );
  } catch (err) {
    console.warn(
      "[dhvani] setDisplayMediaRequestHandler unavailable; system-audio capture will not work on this build",
      err
    );
  }

  createWindow();
  createTray();

  try {
    const shortcut = process.platform === "darwin" ? "Cmd+Shift+T" : "Ctrl+Shift+T";
    globalShortcut.register(shortcut, () => {
      mainWindow?.webContents.send("toggle-capture");
    });
  } catch (err) {
    console.warn("Dhvani: global shortcut registration failed", err);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
