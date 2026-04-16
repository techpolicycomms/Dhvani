"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHUNK_DURATION_MS,
  type CaptureMode,
} from "@/lib/constants";
import { pickSupportedMimeType } from "@/lib/audioUtils";

export type CapturedChunk = {
  index: number;
  blob: Blob;
  mimeType: string;
  extension: string;
  // Elapsed time in ms when this chunk finished capturing.
  capturedAtMs: number;
  durationMs: number;
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
};

// Detect if we're running inside the Electron wrapper.
function isElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electronAPI;
}

/**
 * Core audio capture hook. Supports three browser capture modes plus a
 * transparent Electron fallback that uses native desktopCapturer.
 *
 * - "tab-audio"      : getDisplayMedia, discard video. Best for meetings
 *                      that run in a browser tab (Meet, Zoom web, Teams web).
 * - "microphone"     : getUserMedia. Works everywhere including mobile.
 * - "virtual-cable"  : getUserMedia with a specific input device id. Used
 *                      when the user has installed BlackHole (Mac) or
 *                      VB-Cable (Windows) to route system audio in.
 * - "electron"       : handled by window.electronAPI; chunks arrive via IPC.
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
  const [elapsedTime, setElapsedTime] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // For Electron mode we don't have a MediaRecorder; we just keep a
  // cleanup callback that unsubscribes from IPC events and tells main to
  // stop native capture.
  const electronCleanupRef = useRef<(() => void) | null>(null);
  const chunkIndexRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const lastChunkAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  // Preserve the last-used mode for reconnect().
  const lastModeRef = useRef<CaptureMode | null>(null);

  // Tear down all capture resources. Idempotent.
  const teardown = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (electronCleanupRef.current) {
      try {
        electronCleanupRef.current();
      } catch {
        /* ignore */
      }
      electronCleanupRef.current = null;
    }
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
  }, []);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  const acquireStream = useCallback(
    async (mode: CaptureMode): Promise<MediaStream> => {
      if (mode === "tab-audio") {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error(
            "Your browser doesn't support tab audio capture. Try Microphone mode instead."
          );
        }
        // video:true is required by Chrome to expose the "share tab audio"
        // checkbox. We drop the video tracks immediately.
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        stream.getVideoTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error(
            "No audio detected. Did you check 'Share audio' when selecting the tab?"
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
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        setError(
          "Failed to start audio recording. Your browser may not support the required audio format."
        );
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      recorderRef.current = recorder;
      chunkIndexRef.current = 0;
      startedAtRef.current = Date.now();
      lastChunkAtRef.current = Date.now();

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
        };
        setAudioChunks((prev) => [...prev, chunk]);
      };

      recorder.onerror = (event) => {
        const err = (event as unknown as { error?: Error }).error;
        setError(err?.message || "MediaRecorder error");
      };

      recorder.onstop = () => {
        // If this stop wasn't user-initiated, surface a reconnect hint.
        if (isCapturingRef.current) {
          setError(
            "Recording was interrupted (tab may have been backgrounded or permission revoked). Press Reconnect to resume."
          );
          setIsCapturing(false);
          isCapturingRef.current = false;
        }
      };

      // The timeslice parameter gives us a chunk every `chunkDuration` ms.
      recorder.start(chunkDuration);

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
      setError(null);
      try {
        // Electron mode: delegate to the preload bridge.
        if (mode === "electron" || isElectron()) {
          const api = (window as any).electronAPI;
          if (!api?.startCapture) {
            throw new Error(
              "Electron bridge is not available. Try another capture mode."
            );
          }
          lastModeRef.current = "electron";
          setCaptureMode("electron");
          startedAtRef.current = Date.now();
          lastChunkAtRef.current = Date.now();
          chunkIndexRef.current = 0;
          const unsubscribe = api.onAudioChunk((payload: ArrayBuffer) => {
            const now = Date.now();
            const elapsed = now - startedAtRef.current;
            const duration = now - lastChunkAtRef.current;
            lastChunkAtRef.current = now;
            const blob = new Blob([payload], { type: "audio/webm" });
            setAudioChunks((prev) => [
              ...prev,
              {
                index: chunkIndexRef.current++,
                blob,
                mimeType: "audio/webm",
                extension: "webm",
                capturedAtMs: elapsed,
                durationMs: duration,
              },
            ]);
          });
          electronCleanupRef.current = () => {
            try {
              unsubscribe?.();
            } catch {
              /* ignore */
            }
            api.stopCapture?.();
          };
          await api.startCapture({ chunkDuration });
          setIsCapturing(true);
          isCapturingRef.current = true;
          tickRef.current = window.setInterval(() => {
            setElapsedTime(Date.now() - startedAtRef.current);
          }, 250);
          return;
        }

        lastModeRef.current = mode;
        const stream = await acquireStream(mode);
        mediaStreamRef.current = stream;
        setCaptureMode(mode);
        beginRecording(stream);
        setIsCapturing(true);
        isCapturingRef.current = true;
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
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
    [acquireStream, beginRecording, chunkDuration, teardown]
  );

  const stopCapture = useCallback(() => {
    isCapturingRef.current = false;
    setIsCapturing(false);
    if (lastModeRef.current === "electron") {
      const api = (window as any).electronAPI;
      api?.stopCapture?.();
    }
    teardown();
  }, [teardown]);

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
  };
}
