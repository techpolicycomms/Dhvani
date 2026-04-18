"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  type ThemeChoice,
} from "@/lib/themeMode";

export function useTheme(): {
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Initial mount + listen for cross-tab changes.
  useEffect(() => {
    const initial = getStoredTheme();
    setChoiceState(initial);
    const r = resolveTheme(initial);
    setResolved(r);
    applyTheme(r);

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemeChoice>).detail;
      if (detail === "light" || detail === "dark" || detail === "system") {
        setChoiceState(detail);
        const r2 = resolveTheme(detail);
        setResolved(r2);
        applyTheme(r2);
      }
    };
    window.addEventListener("dhvani-theme-change", onChange);

    // Track system changes when user picks "system".
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (getStoredTheme() === "system") {
        const r3 = resolveTheme("system");
        setResolved(r3);
        applyTheme(r3);
      }
    };
    mql.addEventListener("change", onSystem);

    return () => {
      window.removeEventListener("dhvani-theme-change", onChange);
      mql.removeEventListener("change", onSystem);
    };
  }, []);

  const setChoice = useCallback((c: ThemeChoice) => {
    setStoredTheme(c);
  }, []);

  return { choice, resolved, setChoice };
}
