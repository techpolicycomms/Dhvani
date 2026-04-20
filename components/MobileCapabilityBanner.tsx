"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Info, X } from "lucide-react";
import {
  cannotCaptureTabOrSystemAudio,
  isIOS,
  isMobile,
  type StorageGrant,
} from "@/lib/platform";

type Props = {
  storageGrant: StorageGrant;
  /**
   * Currently selected capture mode. We only surface the iOS tab/system
   * warning when the user has picked a mode that can't work there —
   * don't nag people who are already on microphone.
   */
  chosenMode?: string;
};

const DISMISS_KEY_IOS_AUDIO = "dhvani-mobile-ios-audio-dismissed";
const DISMISS_KEY_STORAGE = "dhvani-mobile-storage-dismissed";

/**
 * Mobile capability hints.
 *
 * Two dismissable banners, stacked:
 *
 *   1. iOS tab/system-audio limit. Shown when the user is on iOS and
 *      has picked a tab / meeting mode the platform can't honour. The
 *      capture hook pre-fails cleanly for them; this banner explains
 *      the *why* and points to Microphone mode as the supported path.
 *
 *   2. Storage persistence denial. Shown when `navigator.storage.persist()`
 *      came back false — iOS Safari in particular aggressively evicts
 *      data after ~7 days of non-use, so recordings can vanish between
 *      sessions. The fix is "use this app regularly" or "install to
 *      home screen" (handled separately by InstallPrompt).
 *
 * Both banners remember dismissal in localStorage so we stop nagging
 * after the user has read them once.
 */
export default function MobileCapabilityBanner({
  storageGrant,
  chosenMode,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [showIosAudio, setShowIosAudio] = useState(false);
  const [showStorage, setShowStorage] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const iosDismissed =
        localStorage.getItem(DISMISS_KEY_IOS_AUDIO) === "1";
      const storageDismissed =
        localStorage.getItem(DISMISS_KEY_STORAGE) === "1";

      const needsIosAudioHint =
        !iosDismissed &&
        cannotCaptureTabOrSystemAudio() &&
        (chosenMode === "tab-audio" || chosenMode === "electron");
      setShowIosAudio(needsIosAudioHint);

      const needsStorageHint =
        !storageDismissed && isMobile() && storageGrant.state === "denied";
      setShowStorage(needsStorageHint);
    } catch {
      /* localStorage unavailable — show both once, no persistence */
    }
  }, [storageGrant, chosenMode]);

  const dismiss = (key: string, setter: (v: boolean) => void) => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setter(false);
  };

  if (!mounted || (!showIosAudio && !showStorage)) return null;

  return (
    <div className="space-y-2">
      {showIosAudio && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-[13px] text-amber-900"
        >
          <AlertCircle
            size={16}
            className="shrink-0 mt-0.5 text-amber-600"
            aria-hidden
          />
          <div className="flex-1 leading-snug">
            <div className="font-semibold mb-0.5">
              iOS can&apos;t capture tab or system audio
            </div>
            <div>
              Safari on {isIOS() ? "this iPhone/iPad" : "iOS"} only gives
              Dhvani access to the microphone. For a meeting, hold your
              phone near the speaker or pair a Bluetooth capture device —
              or record the meeting from a laptop.
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismiss(DISMISS_KEY_IOS_AUDIO, setShowIosAudio)}
            className="shrink-0 p-1 -m-1 rounded text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {showStorage && (
        <div
          role="note"
          className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border-gray bg-off-white text-[13px] text-dark-navy"
        >
          <Info
            size={16}
            className="shrink-0 mt-0.5 text-itu-blue"
            aria-hidden
          />
          <div className="flex-1 leading-snug">
            <div className="font-semibold mb-0.5">
              Your browser may evict recordings between visits
            </div>
            <div>
              {isIOS()
                ? "Safari removes unused site data after about 7 days. "
                : "This browser didn't grant persistent storage. "}
              Install Dhvani to your home screen, or export important
              recordings to .docx or .md after each meeting.
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismiss(DISMISS_KEY_STORAGE, setShowStorage)}
            className="shrink-0 p-1 -m-1 rounded text-mid-gray hover:bg-light-gray"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
