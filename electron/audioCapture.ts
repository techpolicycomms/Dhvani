// Dhvani native audio capture helper (runs in the renderer).
//
// In Electron, we can capture system audio without any virtual cable by
// using desktopCapturer with the `chromeMediaSource: 'desktop'` constraint
// on getUserMedia. The resulting MediaStream is piped through a
// MediaRecorder in 5-second chunks, exactly like the browser capture hook.
//
// Chunks are forwarded to the main process as ArrayBuffers via the
// electronAPI bridge exposed in preload.ts.
//
// NOTE: This file is written to be imported dynamically by the renderer
// when window.electronAPI is present. It relies on Electron-specific
// navigator.mediaDevices.getUserMedia constraints that non-Electron
// browsers will reject with OverconstrainedError.

import { ipcRenderer, desktopCapturer } from "electron";

// Keep this helper local to the electron/ tree so `tsc -p electron/tsconfig.json`
// can compile without pulling files from ../lib outside rootDir.
function pickSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "audio/webm", extension: "webm" };
  }
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", extension: "webm" };
}

let recorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;

export async function startNativeCapture(chunkDuration = 5000) {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  const source = sources[0];
  if (!source) throw new Error("No screen source available for audio capture.");

  const stream = await (navigator.mediaDevices.getUserMedia as any)({
    audio: {
      mandatory: {
        chromeMediaSource: "desktop",
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.id,
      },
    },
  } as unknown as MediaStreamConstraints);

  // We only want audio — drop the video tracks.
  stream.getVideoTracks().forEach((t: MediaStreamTrack) => {
    t.stop();
    stream.removeTrack(t);
  });
  activeStream = stream;

  const { mimeType } = pickSupportedMimeType();
  recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  recorder.ondataavailable = async (e) => {
    if (!e.data || e.data.size === 0) return;
    const buf = await e.data.arrayBuffer();
    ipcRenderer.send("electron:audio-chunk", buf);
  };
  recorder.onerror = (e) => {
    const err = (e as unknown as { error?: Error }).error;
    ipcRenderer.send("electron:capture-error", err?.message || "recorder error");
  };
  recorder.start(chunkDuration);
}

export function stopNativeCapture() {
  try {
    recorder?.stop();
  } catch {
    /* ignore */
  }
  recorder = null;
  activeStream?.getTracks().forEach((t) => t.stop());
  activeStream = null;
}
