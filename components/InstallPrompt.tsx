"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISSED_KEY = "dhvani-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed as PWA — don't show.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Already dismissed this session.
    try {
      if (sessionStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* ignore */
    }

    // Already dismissed permanently.
    try {
      const ts = localStorage.getItem(DISMISSED_KEY);
      if (ts) {
        const ago = Date.now() - Number(ts);
        // Don't re-ask for 7 days.
        if (ago < 7 * 24 * 60 * 60 * 1000) return;
      }
    } catch {
      /* ignore */
    }

    // iOS detection — no beforeinstallprompt, show manual instructions.
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const result = await deferredPrompt.current.userChoice;
    if (result.outcome === "accepted") {
      setShow(false);
    }
    deferredPrompt.current = null;
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 flex justify-center animate-transcript-in">
      <div className="max-w-md w-full bg-white border border-border-gray rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
        {isIOS ? (
          <>
            <Share size={20} className="shrink-0 text-itu-blue" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-navy">
                Install Dhvani
              </p>
              <p className="text-xs text-mid-gray leading-snug">
                Tap{" "}
                <Share size={12} className="inline -mt-0.5" /> Share, then
                &ldquo;Add to Home Screen&rdquo;
              </p>
            </div>
          </>
        ) : (
          <>
            <Download size={20} className="shrink-0 text-itu-blue" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-navy">
                Install Dhvani for quick access
              </p>
            </div>
            <button
              onClick={install}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark transition-colors"
            >
              Install
            </button>
          </>
        )}
        <button
          onClick={dismiss}
          className="shrink-0 p-1 text-mid-gray hover:text-dark-navy rounded"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
