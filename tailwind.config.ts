import type { Config } from "tailwindcss";

/**
 * Tailwind tokens mirror lib/theme.ts. Keep these in sync — the JS object is
 * the source of truth for inline SVG fills + recharts series, and the Tailwind
 * map is the source of truth for utility classes.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  // Dark mode is driven by `html[data-theme="dark"]` (set by lib/themeMode.ts);
  // Tailwind's own `dark:` variant is disabled — we re-tint via CSS variables
  // declared in app/globals.css instead, which means *every* utility that
  // references one of these tokens flips automatically.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Override Tailwind's built-in white so `bg-white` / `text-white`
        // honor the dark-mode CSS-variable swap. Same for black.
        white: "var(--white)",

        // ITU brand
        "itu-blue": {
          DEFAULT: "var(--itu-blue)",
          dark: "var(--itu-blue-dark)",
          light: "var(--itu-blue-light)",
          pale: "var(--itu-blue-pale)",
        },
        "un-blue": "var(--un-blue)",

        // Neutrals — all sourced from CSS variables so the dark-mode
        // override in app/globals.css flips them in one place.
        "off-white": "var(--off-white)",
        "light-gray": "var(--light-gray)",
        "border-gray": "var(--border-gray)",
        "mid-gray": "var(--mid-gray)",
        "dark-gray": "var(--dark-gray)",
        "dark-navy": "var(--dark-navy)",

        // Status
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        "itu-red": "var(--itu-red)",
      },
      fontFamily: {
        sans: [
          "var(--font-noto-sans)",
          "Noto Sans",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-noto-mono)",
          "Noto Sans Mono",
          "ui-monospace",
          "monospace",
        ],
      },
      keyframes: {
        "transcript-in": {
          "0%": { opacity: "0", transform: "translateY(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "transcript-in": "transcript-in 180ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
