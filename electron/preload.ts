// Dhvani Electron preload — exposes a narrow, typed API to the renderer
// through contextBridge. System-audio capture itself uses the standard
// getDisplayMedia API directly from the renderer; the main process
// substitutes loopback audio via setDisplayMediaRequestHandler. This
// bridge therefore only needs to:
//   - flag the renderer that it's running inside Electron
//     (so useAudioCapture can offer system-audio as a mode)
//   - deliver the global-shortcut / tray "toggle-capture" signal
//
// IMPORTANT: never expose raw ipcRenderer or fs — this is the security
// boundary between the renderer (browser) and the Electron main process.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  onToggleCapture: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("toggle-capture", handler);
    return () => ipcRenderer.removeListener("toggle-capture", handler);
  },
});
