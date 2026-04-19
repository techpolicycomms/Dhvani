"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_BITS_PER_SECOND,
  DEFAULT_CHUNK_DURATION_MS,
  MIN_FREE_STORAGE_BYTES,
  type CaptureMode,
} from "@/lib/constants";
import { pickSupportedMimeType } from "@/lib/audioUtils";
import {
  checkStorageQuota,
  finalizeSession,
  newSessionId,
  persistChunk,
  requestPersistentStorage,
  startRecordingSession,
} from "@/lib/audioPersistence";
import { useWakeLock } from "@/hooks/useWakeLock";

export type CapturedChunk = {
  index: number;
  blob: Blob;
  mimeType: string;
  extension: string;
  // Elapsed time in ms when this chunk finished capturing.
  capturedAtMs: number;
  durationMs: number;
  // Session id — used by the transcription pipeline to delete the
  // persisted copy after a successful upload. Recovered orphan chunks
  // reuse their original session id so the same cleanup path applies.
  // Empty string means persistence is unsupported on this browser.
  sessionId: string;
};

export type UseAudioCaptureOptions = {
  chunkDuration?: number;
  preferredDeviceId?: string;
};

export type UseAudioCaptureReturn = {
  startCapture: (mode: CaptureMode) => Promise<void>;
  stopCapture: () => void;
  reconnect: () => Promise<void>;
  isCapturing: boolean;
  captureMode: CaptureMode | null;
  audioChunks: CapturedChunk[];
  error: string | null;
  elapsedTime: number; // milliseconds
  chunkCount: number;
  /**
   * Live MediaStream while capture is active. Consumers (e.g. the audio
   * waveform visualizer) can tap this with an AnalyserNode. Null before
   * start, after stop, and in Electron mode (no browser stream exists).
   */
  mediaStream: MediaStream | null;
};

// Detect if we're running inside the Electron wrapper. The preload
// script sets `isElectron: true` on window.electronAPI; any other value
// (e.g. window.electronAPI undefined in the browser build) returns false.
function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  const api = (window as { electronAPI?: { isElectron?: boolean } }).electronAPI;
  return !!api?.isElectron;
}

/**
 * Core audio capture hook. Supports three browser capture modes plus a
 * transparent Electron fallback that uses native system-audio loopback.
 *
 * - "tab-audio"      : getDisplayMedia, discard video. Best for meetings
 *                      that run in a browser tab (Meet, Zoom web, Teams web).
 * - "microphone"     : getUserMedia. Works everywhere including mobile.
 * - "virtual-cable"  : getUserMedia with a specific input device id. Used
 *                      when the user has installed BlackHole (Mac) or
 *                      VB-Cable (Windows) to route system audio in.
 * - "electron"       : getDisplayMedia as above, but the Electron main
 *                      process substitutes the full system-audio tap
 *                      (ScreenCaptureKit on macOS 13+, WASAPI loopback on
 *                      Windows 10+) via setDisplayMediaRequestHandler.
 *                      No driver install required.
 */
export function useAudioCapture(
  options: UseAudioCaptureOptions = {}
): UseAudioCaptureReturn {
  const {
    chunkDuration = DEFAULT_CHUNK_DURATION_MS,
    preferredDeviceId,
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [audioChunks, setAudioChunks] = useState<CapturedChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  // React state mirror of `mediaStreamRef` so consumers can useEffect on it.
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const lastChunkAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  // Current recording session id for crash-safe chunk persistence.
  const sessionIdRef = useRef<string>("");
  const wakeLock = useWakeLock();
  // Cycle timer rotates the MediaRecorder every chunkDuration ms so each
  // emitted blob is a self-contained WebM container (timeslice mode emits
  // header-less fragments after the first chunk that Whisper cannot decode).
  const cycleTimerRef = useRef<number | null>(null);
  // Set before we initiate a rotation stop so onstop can distinguish a
  // planned cycle from an unexpected interruption.
  const cycleStopRef = useRef(false);
  // Preserve the last-used mode for reconnect().
  const lastModeRef = useRef<CaptureMode | null>(null);

  // Tear down all capture resources. Idempotent.
  const teardown = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (cycleTimerRef.current !== null) {
      window.clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    cycleStopRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setMediaStream(null);
  }, []);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  const acquireStream = useCallback(
    async (mode: CaptureMode): Promise<MediaStream> => {
      if (mode === "tab-audio" || mode === "electron") {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error(
            mode === "electron"
              ? "System-audio capture isn't available on this OS version. Try Microphone mode."
              : "Your browser doesn't support tab audio capture. Try Microphone mode instead."
          );
        }
        // video:true is required by Chrome to expose the "share tab audio"
        // checkbox and by Electron's DisplayMedia handler for
        // ScreenCaptureKit/WASAPI loopback. We drop the video tracks
        // immediately — no pixels are ever recorded.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
          });
        } catch (err) {
          // Give the user something they can act on, especially on macOS
          // where denying Screen Recording looks like a silent failure.
          const e = err as DOMException;
          if (mode === "electron" && e?.name === "NotAllowedError") {
            throw new Error(
              "Dhvani needs Screen Recording permission to capture system audio. " +
                "Open System Settings → Privacy & Security → Screen Recording, " +
                "enable Dhvani, then quit and reopen Dhvani. " +
                "(No video is recorded — macOS's ScreenCaptureKit covers both audio and video under one permission.)"
            );
          }
          if (e?.name === "NotAllowedError") {
            throw new Error(
              "Screen sharing was blocked. Click Record again and choose a tab, " +
                "then check the 'Share audio' box."
            );
          }
          if (e?.name === "NotFoundError" || e?.name === "NotSupportedError") {
            throw new Error(
              mode === "electron"
                ? "System-audio loopback isn't available on this OS. On macOS 12 or earlier, use a virtual cable or Microphone mode."
                : "Your browser couldn't find a source to share. Try Microphone mode."
            );
          }
          throw err;
        }
        stream.getVideoTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error(
            mode === "electron"
              ? "No system audio came through. If this is your first record, quit and reopen Dhvani after granting Screen Recording — macOS only activates the permission on app relaunch."
              : "No audio detected. Did you check 'Share audio' when selecting the tab?"
          );
        }
        return stream;
      }
      if (mode === "microphone") {
        return navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (mode === "virtual-cable") {
        const constraints: MediaStreamConstraints = {
          audio: preferredDeviceId
            ? { deviceId: { exact: preferredDeviceId } }
            : true,
        };
        return navigator.mediaDevices.getUserMedia(constraints);
      }
      throw new Error(`Unsupported capture mode: ${mode}`);
    },
    [preferredDeviceId]
  );

  const beginRecording = useCallback(
    (stream: MediaStream) => {
      if (typeof MediaRecorder === "undefined") {
        setError(
          "Your browser doesn't support audio recording. Try Chrome, Edge, or Firefox."
        );
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const { mimeType, extension } = pickSupportedMimeType();
      chunkIndexRef.current = 0;
      startedAtRef.current = Date.now();
      lastChunkAtRef.current = Date.now();

      const createRecorder = (): MediaRecorder | null => {
        let recorder: MediaRecorder;
        try {
          const opts: MediaRecorderOptions = {
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          };
          if (mimeType) opts.mimeType = mimeType;
          recorder = new MediaRecorder(stream, opts);
        } catch {
          setError(
            "Failed to start audio recording. Your browser may not support the required audio format."
          );
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }

        recorder.ondataavailable = (event: BlobEvent) => {
          if (!event.data || event.data.size === 0) return;
          const now = Date.now();
          const elapsed = now - startedAtRef.current;
          const duration = now - lastChunkAtRef.current;
          lastChunkAtRef.current = now;
          const chunk: CapturedChunk = {
            index: chunkIndexRef.current++,
            blob: event.data,
            mimeType: recorder.mimeType || mimeType,
            extension,
            capturedAtMs: elapsed,
            durationMs: duration,
            sessionId: sessionIdRef.current,
          };
          // Persist in the background; don't block the capture tick.
          if (sessionIdRef.current) {
            void persistChunk(sessionIdRef.current, chunk.index, chunk.blob, {
              capturedAtMs: chunk.capturedAtMs,
              durationMs: chunk.durationMs,
            });
          }
          setAudioChunks((prev) => [...prev, chunk]);
        };

        recorder.onerror = (event) => {
          const err = (event as unknown as { error?: Error }).error;
          setError(err?.message || "MediaRecorder error");
        };

        recorder.onstop = () => {
          // Planned cycle: we stopped this recorder to rotate to a fresh
          // container. Start a new recorder so capture continues seamlessly.
          if (cycleStopRef.current && isCapturingRef.current) {
            cycleStopRef.current = false;
            const next = createRecorder();
            if (next) {
              recorderRef.current = next;
              next.start();
            }
            return;
          }
          cycleStopRef.current = false;
          // User-initiated stop (stopCapture set isCapturingRef=false first).
          if (!isCapturingRef.current) return;
          // Unexpected stop (track ended, permission revoked, tab backgrounded).
          setError(
            "Recording was interrupted (tab may have been backgrounded or permission revoked). Press Reconnect to resume."
          );
          setIsCapturing(false);
          isCapturingRef.current = false;
        };

        return recorder;
      };

      const first = createRecorder();
      if (!first) return;
      recorderRef.current = first;
      first.start();

      // Rotate the recorder every chunkDuration ms. Each emitted blob is
      // a complete, decodable WebM file — required by Whisper.
      cycleTimerRef.current = window.setInterval(() => {
        const r = recorderRef.current;
        if (r && r.state === "recording") {
          cycleStopRef.current = true;
          try {
            r.stop();
          } catch {
            cycleStopRef.current = false;
          }
        }
      }, chunkDuration);

      // Elapsed-time ticker.
      tickRef.current = window.setInterval(() => {
        setElapsedTime(Date.now() - startedAtRef.current);
      }, 250);
    },
    [chunkDuration]
  );

  // Mirror isCapturing in a ref for the recorder.onstop closure.
  const isCapturingRef = useRef(false);
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  const startCapture = useCallback(
    async (mode: CaptureMode) => {
      console.log("[useAudioCapture] startCapture called", { mode });
      setError(null);
      try {
        // Pre-flight: make sure we have somewhere to put the chunks.
        const { available } = await checkStorageQuota();
        if (available > 0 && available < MIN_FREE_STORAGE_BYTES) {
          setError(
            `Low storage: only ${Math.floor(available / 1_048_576)} MB free. Clear space before recording.`
          );
          return;
        }
        await requestPersistentStorage();

        // New session id for this recording — all subsequent chunks
        // attach to it.
        const sessionId = newSessionId();
        sessionIdRef.current = sessionId;
        const { mimeType, extension } = pickSupportedMimeType();
        await startRecordingSession(sessionId, { mimeType, extension });
        await wakeLock.acquire();

        // "electron" is a logical mode name that means "system audio"; the
        // actual capture is standard getDisplayMedia, which Electron's
        // main-process DisplayMedia request handler transparently maps to
        // ScreenCaptureKit (macOS 13+) or WASAPI loopback (Windows 10+).
        // On macOS 12 and earlier, getDisplayMedia will reject and we
        // surface a clean error below. No IPC-based chunk stream — the
        // MediaRecorder + OPFS + transcription pipeline is shared with
        // tab-audio.
        const effectiveMode: CaptureMode =
          mode === "electron" && !isElectron() ? "tab-audio" : mode;

        lastModeRef.current = effectiveMode;
        console.log("[useAudioCapture] acquiring stream for mode", effectiveMode);
        const stream = await acquireStream(effectiveMode);
        console.log("[useAudioCapture] stream acquired, starting recorder");
        mediaStreamRef.current = stream;
        setMediaStream(stream);
        setCaptureMode(effectiveMode);
        beginRecording(stream);
        setIsCapturing(true);
        isCapturingRef.current = true;
        console.log("[useAudioCapture] startCapture complete, isCapturing=true");
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        console.log("[useAudioCapture] startCapture error:", e.name, e.message);
        if (e.name === "NotAllowedError") {
          setError(
            "Please allow audio access to start transcription."
          );
        } else if (e.name === "NotFoundError") {
          setError(
            "No matching audio input device found. Check your device settings."
          );
        } else {
          setError(e.message || "Failed to start capture.");
        }
        teardown();
        setIsCapturing(false);
        isCapturingRef.current = false;
      }
    },
    [acquireStream, beginRecording, chunkDuration, teardown, wakeLock]
  );

  const stopCapture = useCallback(() => {
    console.log("[useAudioCapture] stopCapture called", {
      mode: lastModeRef.current,
      recorderState: recorderRef.current?.state,
      trackCount: mediaStreamRef.current?.getTracks().length ?? 0,
    });
    isCapturingRef.current = false;
    setIsCapturing(false);
    teardown();
    void wakeLock.release();
    // Mark the session finalized. The transcription pipeline deletes
    // chunks as they upload successfully; once the last one lands, the
    // OPFS directory is cleaned up by markChunkTranscribed / finalize.
    const sid = sessionIdRef.current;
    if (sid) {
      void finalizeSession(sid);
      sessionIdRef.current = "";
    }
  }, [teardown, wakeLock]);

  const reconnect = useCallback(async () => {
    if (!lastModeRef.current) return;
    teardown();
    await startCapture(lastModeRef.current);
  }, [startCapture, teardown]);

  return {
    startCapture,
    stopCapture,
    reconnect,
    isCapturing,
    captureMode,
    audioChunks,
    error,
    elapsedTime,
    chunkCount: audioChunks.length,
    mediaStream,
  };
}
