"use client";

import { useCallback, useEffect, useState } from "react";
import { COPY, getStoredMode, setStoredMode, type Mode } from "@/lib/mode";

/**
 * React subscription to the Personal/Power mode primitive.
 * Listens to a custom window event so cross-component updates propagate
 * without a global context.
 */
export function useMode(): {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
  copy: (typeof COPY)[Mode];
} {
  const [mode, setModeState] = useState<Mode>("personal");

  useEffect(() => {
    setModeState(getStoredMode());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Mode>).detail;
      if (detail === "personal" || detail === "power") setModeState(detail);
    };
    window.addEventListener("dhvani-mode-change", onChange);
    return () => window.removeEventListener("dhvani-mode-change", onChange);
  }, []);

  const setMode = useCallback((m: Mode) => {
    setStoredMode(m);
    setModeState(m);
  }, []);

  const toggle = useCallback(() => {
    const next: Mode = mode === "personal" ? "power" : "personal";
    setMode(next);
  }, [mode, setMode]);

  return { mode, setMode, toggle, copy: COPY[mode] };
}
