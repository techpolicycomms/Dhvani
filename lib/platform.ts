/**
 * Client-side platform detection for graceful mobile degradation.
 *
 * iOS Safari (and all browsers on iOS, which share WebKit) cannot
 * capture tab audio or system audio — `getDisplayMedia` on iOS only
 * exposes video, not audio. Attempts to start those modes throw a
 * generic NotSupportedError the user can't act on. Detecting iOS up
 * front lets us:
 *
 *   1. Disable or relabel the Tab / Meeting audio pickers on iOS.
 *   2. Show a one-tap "use your microphone instead" path.
 *   3. Explain the limit without the user hitting a dead-end first.
 *
 * All helpers are SSR-safe (return conservative defaults on the server).
 */

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as "Macintosh" in its UA string; the usual
  // fingerprint is maxTouchPoints > 1 on a desktop-shaped platform.
  const msStream = (window as { MSStream?: unknown }).MSStream;
  if (msStream) return false;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent || "");
}

export function isMobile(): boolean {
  return isIOS() || isAndroid();
}

/**
 * True when the platform cannot capture tab audio or system audio via
 * `getDisplayMedia`. Currently iOS (all browsers share WebKit there).
 * Desktop Safari CAN capture tab audio as of 16.4, so we don't treat
 * "is Safari" as a limit on its own.
 */
export function cannotCaptureTabOrSystemAudio(): boolean {
  return isIOS();
}

export type StorageGrant =
  | { state: "granted" }
  | { state: "denied" }
  | { state: "unknown" };

/**
 * Ask the browser to flag OPFS/IndexedDB storage as "persistent" so it
 * survives eviction. Safari in particular aggressively evicts data
 * from PWAs after ~7 days of non-use. Returns what the browser decided
 * so the caller can warn the user when denied.
 */
export async function requestPersistentStorageState(): Promise<StorageGrant> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return { state: "unknown" };
  }
  try {
    if (await navigator.storage.persisted()) return { state: "granted" };
    const ok = await navigator.storage.persist();
    return { state: ok ? "granted" : "denied" };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * Fire a short haptic pulse on Android (and rare Android browsers on
 * ChromeOS). No-op on iOS, which doesn't expose `navigator.vibrate`.
 * Pattern is a duration or array of on/off durations in milliseconds.
 */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
