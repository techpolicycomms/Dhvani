"use client";

import { useEffect } from "react";

/**
 * Global keyboard shortcuts (Week 7).
 *
 *   Cmd/Ctrl + R   record / stop
 *   Cmd/Ctrl + E   open export menu
 *   Cmd/Ctrl + ,   open settings
 *   Cmd/Ctrl + /   focus the in-page search input (if any)
 *   Cmd/Ctrl + N   start a new session
 *   Esc            close any open modal/drawer (broadcast event)
 *
 * Each shortcut is an optional callback. The hook ignores key events
 * fired inside form fields so users can still type the literal letters.
 * Browser-reserved shortcuts (Cmd+R = page reload) are intercepted via
 * preventDefault so the in-app handler wins.
 */

export type ShortcutHandlers = {
  onRecord?: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  onSearch?: () => void;
  onNew?: () => void;
  onEscape?: () => void;
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;

      // Esc fires regardless of focus.
      if (e.key === "Escape") {
        handlers.onEscape?.();
        return;
      }

      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;

      // Don't hijack typing inside a field unless the shortcut is one
      // we explicitly want everywhere (Settings).
      if (e.key === ",") {
        e.preventDefault();
        handlers.onSettings?.();
        return;
      }
      if (isField) return;

      switch (e.key.toLowerCase()) {
        case "r":
          if (handlers.onRecord) {
            e.preventDefault();
            handlers.onRecord();
          }
          break;
        case "e":
          if (handlers.onExport) {
            e.preventDefault();
            handlers.onExport();
          }
          break;
        case "n":
          if (handlers.onNew) {
            e.preventDefault();
            handlers.onNew();
          }
          break;
        case "/":
          if (handlers.onSearch) {
            e.preventDefault();
            handlers.onSearch();
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
