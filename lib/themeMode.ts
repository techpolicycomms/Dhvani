/**
 * Light / dark / system theme switcher (Week 7).
 *
 * Persisted to localStorage so the choice survives reloads. Applied
 * by toggling `document.documentElement.dataset.theme = "light" | "dark"`,
 * which CSS picks up via `html[data-theme="dark"] { ... }` overrides
 * in app/globals.css. Tailwind utility classes that read CSS custom
 * properties (bg-white, text-dark-navy, border-border-gray, etc.)
 * automatically pick up the swap — no component refactor needed for
 * the bulk of the surface.
 *
 * `system` is the default and follows `prefers-color-scheme`.
 *
 * Note: this is the THEME (light/dark) primitive — distinct from the
 * Personal/Power MODE primitive in lib/mode.ts. Mode controls product
 * personality and copy; theme controls colors only.
 */

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "dhvani-theme";

export function getStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function setStoredTheme(theme: ThemeChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, theme);
  applyTheme(resolveTheme(theme));
  window.dispatchEvent(new CustomEvent("dhvani-theme-change", { detail: theme }));
}

/** Resolve `system` → the actual `light`/`dark` it currently maps to. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
