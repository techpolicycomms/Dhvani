"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hold a screen wake lock for the lifetime of a recording so the OS
 * doesn't sleep mid-meeting. Re-acquires automatically after the tab
 * becomes visible again (the browser releases the lock on backgrounding).
 *
 * No-op on browsers without the Wake Lock API (Safari < 16.4, older
 * Firefox). Callers don't need to check support — just call
 * `acquire()` on record start and `release()` on stop.
 */
export function useWakeLock(): {
  acquire: () => Promise<void>;
  release: () => Promise<void>;
} {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const wantedRef = useRef(false);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl?.request) return;
    try {
      lockRef.current = await wl.request("screen");
      lockRef.current.addEventListener("release", () => {
        // OS released the lock (tab hidden, low battery). We'll try to
        // re-acquire on visibilitychange if the caller still wants it.
        lockRef.current = null;
      });
    } catch (err) {
      console.warn("[useWakeLock] request failed", err);
    }
  }, []);

  const acquire = useCallback(async () => {
    wantedRef.current = true;
    await request();
  }, [request]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    const lock = lockRef.current;
    lockRef.current = null;
    if (lock) {
      try {
        await lock.release();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        wantedRef.current &&
        !lockRef.current
      ) {
        void request();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [request]);

  return { acquire, release };
}
