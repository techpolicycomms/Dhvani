"use client";

/**
 * Compact speaker identity pill — initials avatar + name, single tap
 * target for rename.
 *
 * Design note: the previous UI showed a 2×2 coloured dot next to a
 * small text label. That reads as "a dot that is somebody's name" on
 * desktop and becomes a fat-finger hazard on mobile when you try to
 * rename. The pill:
 *
 *   - doubles as an avatar (initials) so speakers are visually
 *     distinguishable at a glance even without reading the label;
 *   - is a single rectangle the user can tap, not a dot + text
 *     each with their own hit-test;
 *   - scales cleanly whether the display is "Speaker 3" (initials
 *     become "3") or "Alice Chen" ("AC").
 */

import type { ReactNode } from "react";

type Props = {
  name: string;
  color: string;
  onClick?: () => void;
  size?: "xs" | "sm";
  suffix?: ReactNode;
  title?: string;
};

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // "Speaker 3" / "S3" → "3". Makes default labels visually compact.
  const sn = /^S(?:peaker\s*)?(\d+)/i.exec(trimmed);
  if (sn) return sn[1];
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + (words[words.length - 1][0] || "")).toUpperCase();
}

/**
 * Convert a hex like `#009CD6` → `rgba(0, 156, 214, 0.14)` for the
 * pill background. The text/ring still uses the full-strength colour.
 */
function softBg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "rgba(0,0,0,0.06)";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}

export default function SpeakerPill({
  name,
  color,
  onClick,
  size = "xs",
  suffix,
  title,
}: Props) {
  const initials = initialsFor(name);
  const isButton = typeof onClick === "function";
  const base =
    size === "sm"
      ? "h-7 pr-2 pl-1 text-[12px] gap-1.5"
      : "h-6 pr-1.5 pl-1 text-[11px] gap-1";
  const avatar =
    size === "sm"
      ? "w-5 h-5 text-[10px]"
      : "w-4 h-4 text-[9px]";
  const classes = [
    "inline-flex items-center rounded-full font-semibold leading-none align-baseline",
    base,
    isButton ? "hover:ring-1 hover:ring-inset transition-shadow" : "",
    "tap-tight",
  ].join(" ");
  const content = (
    <>
      <span
        className={`${avatar} inline-flex items-center justify-center rounded-full text-white tabular-nums`}
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {initials}
      </span>
      <span className="truncate max-w-[10rem]">{name}</span>
      {suffix}
    </>
  );
  if (isButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classes}
        style={{ backgroundColor: softBg(color), color }}
        title={title}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className={classes}
      style={{ backgroundColor: softBg(color), color }}
      title={title}
    >
      {content}
    </span>
  );
}
