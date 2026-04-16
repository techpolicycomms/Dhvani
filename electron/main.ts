// Dhvani Electron main process.
//
// Hosts the Next.js UI in a BrowserWindow and exposes native system-audio
// capture via IPC. The renderer receives 5-second WebM chunks as
// ArrayBuffers, which it feeds through the same Whisper pipeline that the
// web app uses.
//
// Production model: fork `.next/standalone/server.js` as a child Node
// process (cwd set to .next/standalone so its `require('next')` resolves
// against standalone's own node_modules), wait for the port to respond,
// then point the BrowserWindow at http://localhost:<PORT>.
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
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";

const IS_DEV = !app.isPackaged;
const PORT = Number(process.env.DHVANI_PORT) || 3737;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nextProcess: ChildProcess | null = null;

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    const standaloneDir = path.join(appPath, ".next", "standalone");
    const serverPath = path.join(standaloneDir, "server.js");

    if (!existsSync(serverPath)) {
      console.error("FATAL: server.js not found at", serverPath);
      if (existsSync(standaloneDir)) {
        console.error(
          "Contents of standalone:",
          readdirSync(standaloneDir)
        );
      } else {
        const nextDir = path.join(appPath, ".next");
        console.error(
          ".next/standalone missing. Contents of .next:",
          existsSync(nextDir) ? readdirSync(nextDir) : "NOT FOUND"
        );
      }
      reject(new Error(`server.js not found at ${serverPath}`));
      return;
    }

    const standaloneNodeModules = path.join(standaloneDir, "node_modules");

    nextProcess = fork(serverPath, [], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        NODE_PATH: standaloneNodeModules,
      },
      silent: true,
    });

    nextProcess.stdout?.on("data", (d) => {
      process.stdout.write(`[next] ${d}`);
    });
    nextProcess.stderr?.on("data", (d) => {
      process.stderr.write(`[next] ${d}`);
    });

    nextProcess.on("error", (err) => {
      console.error("Dhvani: next server process error", err);
      reject(err);
    });
    nextProcess.on("exit", (code) => {
      console.error("Dhvani: next server exited with code", code);
      nextProcess = null;
    });

    waitForPort(PORT, 20_000)
      .then(() => resolve())
      .catch(reject);
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

function createWindow(target: string) {
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

  mainWindow.loadURL(target).catch((err) => {
    console.error("Dhvani: failed to load renderer", err);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
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
          if (!mainWindow) void bootWindow();
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

async function bootWindow() {
  try {
    if (IS_DEV) {
      createWindow("http://localhost:3000");
      return;
    }
    if (!nextProcess) {
      await startNextServer();
    }
    createWindow(`http://127.0.0.1:${PORT}`);
  } catch (err) {
    console.error("Dhvani: failed to boot", err);
    app.quit();
  }
}

app.whenReady().then(async () => {
  await bootWindow();
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
    if (BrowserWindow.getAllWindows().length === 0) void bootWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep running in the tray on macOS, quit elsewhere.
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
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
