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
  theme: {
    extend: {
      colors: {
        // ITU brand
        "itu-blue": {
          DEFAULT: "#1DA0DB",
          dark: "#0B7AB0",
          light: "#5BBEE8",
          pale: "#E5F4FB",
        },
        "un-blue": "#009EDB",

        // Neutrals
        "off-white": "#FAFAFA",
        "light-gray": "#F3F4F6",
        "border-gray": "#E5E7EB",
        "mid-gray": "#6B7280",
        "dark-gray": "#374151",
        "dark-navy": "#003366",

        // Status
        success: "#059669",
        warning: "#D97706",
        error: "#DC2626",
        "itu-red": "#E4002B",
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
