"use client";

import { useCallback, useEffect, useState } from "react";

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

export type UseAudioDevicesReturn = {
  devices: AudioInputDevice[];
  refresh: () => Promise<void>;
  error: string | null;
  isLoading: boolean;
};

/**
 * Enumerate audio input devices (microphones + virtual cables).
 *
 * Note: browsers will only reveal non-empty device labels *after* the user
 * has granted mic permission at least once. We call getUserMedia just to
 * prime that permission, then immediately release the stream.
 */
export function useAudioDevices(): UseAudioDevicesReturn {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("This browser doesn't expose media devices.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Prime permission so device labels are populated.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        // If the user refuses we can still enumerate, just without labels.
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const audio = all
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Audio input (${d.deviceId.slice(0, 6)})`,
        }));
      setDevices(audio);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to enumerate audio devices.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-enumerate when devices are plugged/unplugged.
    const handler = () => void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, [refresh]);

  return { devices, refresh, error, isLoading };
}
