// Dhvani Electron main process.
//
// Dev: loads the running `next dev` server on http://localhost:3000.
// Prod: forks the Next.js standalone server bundled inside the app and
//       points the BrowserWindow at http://127.0.0.1:PROD_PORT once the
//       server's /api/health probe returns 200. A file:// load will NOT
//       work because Dhvani relies on API routes (/api/transcribe,
//       /api/summarize, …) that only exist inside a Node server.

import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Menu,
  Tray,
  nativeImage,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fork, type ChildProcess } from "node:child_process";

const IS_DEV = !app.isPackaged;
const PROD_PORT = 38447;
const PROD_HOST = "127.0.0.1";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nextProcess: ChildProcess | null = null;

const LOADING_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Dhvani</title></head>
<body style="font-family:'Noto Sans','Helvetica Neue',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff;color:#003366">
  <div style="text-align:center">
    <div style="font-size:28px;font-weight:700;color:#1DA0DB;margin-bottom:10px">Dhvani</div>
    <div style="font-size:13px;color:#6B7280">Starting transcription service…</div>
  </div>
</body></html>`;

function errorHtml(message: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Dhvani</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff;color:#DC2626">
  <div style="text-align:center;max-width:420px;padding:0 24px">
    <div style="font-size:18px;font-weight:600">Server failed to start</div>
    <div style="font-size:13px;color:#6B7280;margin-top:8px">${message}</div>
    <div style="font-size:11px;color:#9CA3AF;margin-top:12px">Check logs: /Applications/Dhvani.app/Contents/MacOS/Dhvani</div>
  </div>
</body></html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * Launch `.next/standalone/server.js` in a forked child process using the
 * bundled Electron runtime as plain Node (ELECTRON_RUN_AS_NODE=1). Polls
 * /api/health every 500 ms; resolves on first 200 or rejects after 30 s.
 */
function startProdServer(): Promise<void> {
  const appPath = app.getAppPath();
  const standaloneDir = path.join(appPath, ".next", "standalone");
  const serverPath = path.join(standaloneDir, "server.js");

  console.log("[dhvani] appPath:", appPath);
  console.log("[dhvani] serverPath:", serverPath);
  console.log("[dhvani] server.js exists:", fs.existsSync(serverPath));

  if (!fs.existsSync(serverPath)) {
    return Promise.reject(new Error(`server.js not found at ${serverPath}`));
  }

  if (!process.env.AZURE_OPENAI_API_KEY) {
    console.warn(
      "[dhvani] AZURE_OPENAI_API_KEY not set — transcription will fail. " +
        "Set it in ~/.zshrc (export AZURE_OPENAI_API_KEY=…) and launch Dhvani " +
        "from a terminal, or move secrets into a config file the app can read."
    );
  }

  nextProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      // Tell Electron's bundled binary to behave as a plain Node runtime
      // for the child — otherwise fork() would spawn a second Electron UI.
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PROD_PORT),
      HOSTNAME: PROD_HOST,
      NODE_ENV: "production",
      // Default to demo mode in the packaged app so the UI is usable
      // without SSO. Users who want real auth can override in a config
      // file or shell env before launching.
      DEMO_MODE: process.env.DEMO_MODE ?? "true",
      NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE ?? "true",
      // NextAuth v5 refuses to start without NEXTAUTH_SECRET, even in
      // demo mode where auth() returns early. Provide a deterministic
      // placeholder so the middleware loads; real SSO deployments
      // override this via the shell env before launching.
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET ?? "dhvani-demo-packaged-placeholder-secret",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? `http://${PROD_HOST}:${PROD_PORT}`,
    },
    cwd: standaloneDir,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  nextProcess.stdout?.on("data", (d: Buffer) => {
    console.log("[next]", d.toString().trimEnd());
  });
  nextProcess.stderr?.on("data", (d: Buffer) => {
    console.error("[next!]", d.toString().trimEnd());
  });
  nextProcess.on("exit", (code, signal) => {
    console.log("[next] exited", { code, signal });
    nextProcess = null;
  });

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 30_000) {
        clearInterval(timer);
        reject(new Error("server did not become ready within 30 seconds"));
        return;
      }
      // Probe `/` rather than `/api/health`: health tries to reach Azure
      // OpenAI and returns 500 if credentials are absent, which would
      // pin the splash forever in a demo-only launch. Root always
      // returns 200 as long as the Next server is handling requests.
      const req = http.get(
        { host: PROD_HOST, port: PROD_PORT, path: "/" },
        (res) => {
          if (res.statusCode && res.statusCode < 500) {
            clearInterval(timer);
            resolve();
          }
          res.resume();
        }
      );
      req.on("error", () => {
        /* not ready yet */
      });
      req.end();
    }, 500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 480,
    minHeight: 520,
    backgroundColor: "#FFFFFF",
    title: "Dhvani",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for desktopCapturer audio capture to work.
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:3000").catch((err) => {
      console.error("Dhvani: failed to load dev renderer", err);
    });
    return;
  }

  // Prod: paint the loading splash immediately, boot the server, swap
  // to the real URL on ready.
  mainWindow.loadURL(dataUrl(LOADING_HTML));
  startProdServer().then(
    () => {
      console.log("[dhvani] server ready, loading UI");
      mainWindow?.loadURL(`http://${PROD_HOST}:${PROD_PORT}`);
    },
    (err: Error) => {
      console.error("[dhvani] server failed to start:", err.message);
      mainWindow?.loadURL(dataUrl(errorHtml(err.message)));
    }
  );
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
  // Keep running in the tray on macOS, quit elsewhere.
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) {
    console.log("[dhvani] killing next server on quit");
    nextProcess.kill();
    nextProcess = null;
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Bridge IPC events. The actual desktopCapturer logic lives in the renderer
// (audioCapture.ts) because MediaRecorder needs a MediaStream obtained from
// the renderer's DOM-land APIs. We just forward the start/stop events.
ipcMain.handle("start-capture", async (_event, opts) => {
  mainWindow?.webContents.send("electron:start-capture", opts);
  return { ok: true };
});

ipcMain.handle("stop-capture", async () => {
  mainWindow?.webContents.send("electron:stop-capture");
  return { ok: true };
});
