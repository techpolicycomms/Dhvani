"use client";

import { useState } from "react";

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      style={{
        background: "#FEF3C7",
        borderBottom: "1px solid #F59E0B",
        padding: "6px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 12,
        color: "#92400E",
        fontFamily: "Noto Sans, sans-serif",
      }}
    >
      <span>Demo Mode — authentication disabled, mock calendar data</span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          color: "#92400E",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        ✕
      </button>
    </div>
  );
}
