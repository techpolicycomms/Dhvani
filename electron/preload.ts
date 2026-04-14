// Dhvani Electron preload — exposes a narrow, typed API to the renderer
// through contextBridge. The renderer uses window.electronAPI to:
//   - request a capture start/stop
//   - subscribe to audio chunks produced by audioCapture.ts
//   - subscribe to errors
//
// IMPORTANT: never expose raw ipcRenderer or fs — this is the security
// boundary between the renderer (browser) and the Electron main process.

import { contextBridge, ipcRenderer } from "electron";

export type AudioChunkListener = (buf: ArrayBuffer) => void;
export type ErrorListener = (msg: string) => void;

// Keep track of live listeners so we can detach them on stop().
const audioChunkListeners = new Set<AudioChunkListener>();
const errorListeners = new Set<ErrorListener>();

ipcRenderer.on("electron:audio-chunk", (_event, payload: ArrayBuffer) => {
  audioChunkListeners.forEach((l) => l(payload));
});
ipcRenderer.on("electron:capture-error", (_event, msg: string) => {
  errorListeners.forEach((l) => l(msg));
});

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  startCapture: (opts: { chunkDuration?: number } = {}) =>
    ipcRenderer.invoke("start-capture", opts),

  stopCapture: () => ipcRenderer.invoke("stop-capture"),

  onAudioChunk: (listener: AudioChunkListener) => {
    audioChunkListeners.add(listener);
    return () => {
      audioChunkListeners.delete(listener);
    };
  },

  onError: (listener: ErrorListener) => {
    errorListeners.add(listener);
    return () => {
      errorListeners.delete(listener);
    };
  },

  onToggleCapture: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("toggle-capture", handler);
    return () => ipcRenderer.removeListener("toggle-capture", handler);
  },
});
