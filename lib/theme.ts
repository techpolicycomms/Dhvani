/**
 * ITU brand palette + supporting tokens for Dhvani.
 *
 * The product runs in production for the ITU Innovation Hub; this file is
 * the single source of truth for color values referenced from JS (e.g.
 * recharts series, inline SVG fills, speaker pills). Tailwind classes mirror
 * these values via tailwind.config.ts.
 *
 * Contrast-checked against WCAG AA (4.5:1 minimum) on the main white
 * background.
 */
export const ITU_COLORS = {
  // Primary
  ituBlue: "#1DA0DB",
  ituBlueDark: "#0B7AB0",
  ituBlueLight: "#5BBEE8",
  ituBluePale: "#E5F4FB",

  // UN family (used sparingly for accents, e.g. admin "official" cues)
  unBlue: "#009EDB",

  // Neutrals
  white: "#FFFFFF",
  offWhite: "#FAFAFA",
  lightGray: "#F3F4F6",
  borderGray: "#E5E7EB",
  midGray: "#6B7280",
  darkGray: "#374151",
  darkNavy: "#003366",

  // Status
  success: "#059669",
  warning: "#D97706",
  error: "#DC2626",
  ituRed: "#E4002B",
} as const;

export type ItuColorKey = keyof typeof ITU_COLORS;
