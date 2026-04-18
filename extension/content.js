/**
 * Dhvani — content script for meeting platform detection.
 *
 * Runs on every Teams / Zoom / Meet page load. Reports which platform
 * we're on + the meeting's human-readable title to the service worker
 * so the side panel can surface "Detected Teams: Weekly Sync" without
 * the user having to type anything.
 *
 * Also injects a small floating badge in the corner when transcription
 * is active, so there's a visible indicator in the meeting tab itself —
 * useful for consent transparency ("this meeting is being transcribed
 * by Dhvani").
 */

(() => {
  const host = window.location.hostname;
  let platform = "";
  if (host.endsWith("teams.microsoft.com")) platform = "teams";
  else if (host.endsWith("zoom.us") || host.includes(".zoom.us")) {
    platform = "zoom";
  } else if (host.endsWith("meet.google.com")) platform = "meet";
  if (!platform) return;

  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => undefined);
    } catch {
      /* context invalidated during extension reload — ignore */
    }
  }

  // Initial ping. The title on first paint is usually the domain;
  // we'll refine it via MutationObserver below.
  safeSend({
    type: "meeting-detected",
    platform,
    url: window.location.href,
  });

  // ---------- Meeting title extraction ----------

  function extractTitle() {
    // Platform-specific DOM hooks where the meeting title shows up
    // earlier than document.title does. Fall back to document.title.
    try {
      if (platform === "teams") {
        const el = document.querySelector(
          '[data-tid="call-header-title"], [data-tid="meeting-title"]'
        );
        if (el && el.textContent) return el.textContent.trim();
      } else if (platform === "zoom") {
        const el = document.querySelector(
          ".meeting-info-icon__info-title, .meeting-title"
        );
        if (el && el.textContent) return el.textContent.trim();
      } else if (platform === "meet") {
        const el = document.querySelector('[data-meeting-title]');
        if (el && el.getAttribute("data-meeting-title")) {
          return el.getAttribute("data-meeting-title").trim();
        }
      }
    } catch {
      /* ignore */
    }
    const t = (document.title || "").trim();
    // Strip the "| Microsoft Teams" / "- Zoom" / etc. tail.
    return t.replace(/\s*[|\-–—]\s*(Microsoft Teams|Zoom|Google Meet).*$/i, "");
  }

  let lastTitle = "";
  function pushTitleIfChanged() {
    const t = extractTitle();
    if (t && t !== lastTitle) {
      lastTitle = t;
      safeSend({ type: "meeting-title", title: t });
    }
  }
  pushTitleIfChanged();

  // Watch <title> + body mutations for late-loading meeting titles.
  try {
    const titleEl = document.querySelector("title");
    if (titleEl) {
      new MutationObserver(pushTitleIfChanged).observe(titleEl, {
        childList: true,
      });
    }
    new MutationObserver(pushTitleIfChanged).observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch {
    /* ignore — fall back to the one-shot read */
  }

  // ---------- Floating recording badge ----------

  let badge = null;

  function showBadge() {
    if (badge) return;
    badge = document.createElement("div");
    badge.setAttribute("data-dhvani", "recording-badge");
    badge.textContent = "Dhvani ● Recording";
    badge.title = "Dhvani is transcribing this tab. Click to dismiss.";
    Object.assign(badge.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483647",
      padding: "6px 12px",
      borderRadius: "999px",
      background: "#009CD6",
      color: "#ffffff",
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      fontSize: "12px",
      fontWeight: "600",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      cursor: "pointer",
      userSelect: "none",
    });
    badge.addEventListener("click", () => badge && badge.remove());
    document.documentElement.appendChild(badge);
  }

  function hideBadge() {
    if (badge) {
      badge.remove();
      badge = null;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "started") showBadge();
    else if (msg.type === "stopped") hideBadge();
  });
})();
