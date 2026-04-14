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
import path from "node:path";

const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 480,
    minHeight: 520,
    backgroundColor: "#0f172a",
    title: "Dhvani",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for desktopCapturer audio capture to work.
      sandbox: false,
    },
  });

  const target = IS_DEV
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../.next/server/app/index.html")}`;

  mainWindow.loadURL(target).catch((err) => {
    console.error("Dhvani: failed to load renderer", err);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/icon-192.png");
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
  createWindow();
  createTray();

  const shortcut = process.platform === "darwin" ? "Cmd+Shift+T" : "Ctrl+Shift+T";
  globalShortcut.register(shortcut, () => {
    mainWindow?.webContents.send("toggle-capture");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep running in the tray on macOS, quit elsewhere.
  if (process.platform !== "darwin") app.quit();
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
