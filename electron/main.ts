// Dhvani Electron main process.
//
// Hosts the Next.js UI in a BrowserWindow and exposes native system-audio
// capture via IPC. The renderer receives 5-second WebM chunks as
// ArrayBuffers, which it feeds through the same Whisper pipeline that the
// web app uses.
//
// NOTE: This file is written in TypeScript but distributed as JS. Compile
// with `tsc -p electron/tsconfig.json` or use `ts-node` during `electron:dev`.

import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Menu,
  Tray,
  nativeImage,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const IS_DEV = !app.isPackaged;

/** Packaged app serves Next standalone here (avoid clashing with `npm run dev` on 3000). */
const EMBEDDED_NEXT_PORT = 38447;
const EMBEDDED_NEXT_ORIGIN = `http://127.0.0.1:${EMBEDDED_NEXT_PORT}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nextChild: ChildProcess | null = null;

function standaloneDir(): string {
  if (IS_DEV) {
    return path.join(__dirname, "..", "..", ".next", "standalone");
  }
  return path.join(process.resourcesPath, "standalone");
}

function trayIconPath(): string {
  if (IS_DEV) {
    return path.join(__dirname, "..", "..", "public", "icon-192.png");
  }
  return path.join(standaloneDir(), "public", "icon-192.png");
}

function startEmbeddedNext(): Promise<void> {
  return new Promise((resolve, reject) => {
    const root = standaloneDir();
    const serverJs = path.join(root, "server.js");
    nextChild = spawn(process.execPath, [serverJs], {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(EMBEDDED_NEXT_PORT),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        // OAuth redirect base must match the embedded server (see Azure redirect URI).
        NEXTAUTH_URL: EMBEDDED_NEXT_ORIGIN,
      },
      stdio: "pipe",
    });
    nextChild.on("error", reject);
    nextChild.on("exit", (code, signal) => {
      if (code && code !== 0) {
        console.error("Dhvani: Next standalone exited", { code, signal });
      }
    });

    const deadline = Date.now() + 60_000;
    const poll = setInterval(() => {
      void (async () => {
        try {
          // Startup probe: any HTTP response means Next is listening.
          // Do not depend on /api/health being "ok" because that route
          // checks Azure OpenAI connectivity and can be non-200 even when
          // the UI is perfectly runnable.
          await fetch(`${EMBEDDED_NEXT_ORIGIN}/api/health`);
          {
            clearInterval(poll);
            resolve();
          }
        } catch {
          /* not listening yet */
        }
        if (Date.now() > deadline) {
          clearInterval(poll);
          reject(new Error("Timed out waiting for embedded Next server (/api/health)."));
        }
      })();
    }, 250);
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

  const target = IS_DEV ? "http://localhost:3000" : EMBEDDED_NEXT_ORIGIN;

  mainWindow.loadURL(target).catch((err) => {
    console.error("Dhvani: failed to load renderer", err);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = trayIconPath();
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
}

app.whenReady().then(() => {
  void (async () => {
    try {
      if (!IS_DEV) {
        await startEmbeddedNext();
      }
    } catch (err) {
      console.error("Dhvani: could not start embedded app", err);
      app.quit();
      return;
    }

    createWindow();
    createTray();

    const shortcut = process.platform === "darwin" ? "Cmd+Shift+T" : "Ctrl+Shift+T";
    globalShortcut.register(shortcut, () => {
      mainWindow?.webContents.send("toggle-capture");
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })();
});

app.on("window-all-closed", () => {
  // Keep running in the tray on macOS, quit elsewhere.
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (nextChild && !nextChild.killed) {
    nextChild.kill("SIGTERM");
    nextChild = null;
  }
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
