/**
 * Dhvani — side-panel UI.
 *
 * Thin view over the background service worker. The worker owns all
 * capture + upload state; we only render + relay button clicks.
 */

// --------- DOM ----------
const $ = (id) => document.getElementById(id);
const toggleBtn = $("toggle-btn");
const statusDot = $("status-dot");
const statusText = $("status-text");
const elapsedEl = $("elapsed");
const meetingBar = $("meeting-bar");
const platformBadge = $("platform-badge");
const meetingTitle = $("meeting-title");
const errorBanner = $("error-banner");
const errorText = $("error-text");
const errorSignIn = $("error-signin");
const errorDismiss = $("error-dismiss");
const transcriptEl = $("transcript");
const emptyState = $("empty-state");
const copyBtn = $("copy-btn");
const downloadBtn = $("download-btn");
const clearBtn = $("clear-btn");
const chunkMeta = $("chunk-meta");
const hintEl = $("hint");

// --------- State ----------
// Palette lifted from the web app so entries look consistent across
// surfaces. Speakers are assigned colors by index, stable for the
// session (stable across chunks is a different problem — see README).
const SPEAKER_COLORS = [
  "#009CD6", // ITU Blue
  "#DC2626", // red
  "#059669", // emerald
  "#D97706", // amber
  "#7C3AED", // violet
  "#DB2777", // pink
  "#0891B2", // cyan
  "#65A30D", // lime
];
// Speaker stitcher state. The diarizer assigns raw ids like
// "speaker_0" *per chunk*, so the same voice can be speaker_0 in one
// chunk and speaker_1 in the next. We normalise to session-stable ids
// ("S1", "S2", …) using a time-adjacency heuristic: if a raw id's
// first utterance in this chunk starts within ADJ_GAP_MS of some known
// stable speaker's last-heard end, they're probably the same person.
// Greedy one-to-one assignment per chunk.
//
// This mirrors lib/speakerStitcher.ts in the main web app — keep both
// in sync if the algorithm changes.
const ADJ_STRICT_GAP_MS = 1500;
const ADJ_LOOSE_GAP_MS = 8000;
const speakerAssignments = new Map(); // stableId -> { color, label }
const known = []; // [{ stableId, lastEndMs }]
let nextStableIdN = 1;
const entries = [];
let isCapturing = false;

// --------- Helpers ----------

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function speakerLabel(stableId) {
  if (!stableId) return { color: SPEAKER_COLORS[0], label: "Speaker 1" };
  if (!speakerAssignments.has(stableId)) {
    const m = /^S(\d+)$/.exec(stableId);
    const num = m ? parseInt(m[1], 10) : speakerAssignments.size + 1;
    const idx = (num - 1) % SPEAKER_COLORS.length;
    speakerAssignments.set(stableId, {
      color: SPEAKER_COLORS[idx],
      label: `Speaker ${num}`,
    });
  }
  return speakerAssignments.get(stableId);
}

// Map a chunk's raw speaker ids to session-stable ids using three
// tiers: strict adjacency (≤1.5s), loose adjacency (≤8s), single-speaker
// carry-over (if both chunk and history have exactly one speaker, match
// regardless of gap). Keep in sync with lib/speakerStitcher.ts.
function matchWithinGap(rawsSorted, mapping, used, gapMs) {
  for (const [raw, agg] of rawsSorted) {
    if (mapping.has(raw)) continue;
    let best = null;
    let bestGap = Infinity;
    for (const k of known) {
      if (used.has(k.stableId)) continue;
      const gap = agg.firstStartMs - k.lastEndMs;
      if (gap < -500) continue;
      if (gap > gapMs) continue;
      if (Math.abs(gap) < bestGap) {
        bestGap = Math.abs(gap);
        best = k;
      }
    }
    if (best) {
      mapping.set(raw, best.stableId);
      used.add(best.stableId);
      if (agg.lastEndMs > best.lastEndMs) best.lastEndMs = agg.lastEndMs;
    }
  }
}

function stitchChunk(chunkOffsetMs, segments) {
  const perRaw = new Map();
  for (const seg of segments) {
    const raw = seg.speaker || "speaker_0";
    const startMs = chunkOffsetMs + (seg.start || 0) * 1000;
    const endMs = chunkOffsetMs + (seg.end || seg.start || 0) * 1000;
    const existing = perRaw.get(raw);
    if (existing) {
      if (startMs < existing.firstStartMs) existing.firstStartMs = startMs;
      if (endMs > existing.lastEndMs) existing.lastEndMs = endMs;
    } else {
      perRaw.set(raw, { firstStartMs: startMs, lastEndMs: endMs });
    }
  }
  const rawsSorted = Array.from(perRaw.entries()).sort(
    (a, b) => a[1].firstStartMs - b[1].firstStartMs
  );
  const used = new Set();
  const mapping = new Map();

  // Tier 1 — strict adjacency. Always safe.
  matchWithinGap(rawsSorted, mapping, used, ADJ_STRICT_GAP_MS);
  // Tier 2 — loose adjacency. Only safe when there's multi-speaker
  // context to disambiguate against. Without that, a large gap
  // cannot tell "same speaker pausing" from "different speaker
  // taking over" — so we prefer the visible false-split.
  if (rawsSorted.length > 1 || known.length > 1) {
    matchWithinGap(rawsSorted, mapping, used, ADJ_LOOSE_GAP_MS);
  }
  // Remainder — allocate new stable ids.
  for (const [raw, agg] of rawsSorted) {
    if (mapping.has(raw)) continue;
    const stableId = `S${nextStableIdN++}`;
    mapping.set(raw, stableId);
    used.add(stableId);
    known.push({ stableId, lastEndMs: agg.lastEndMs });
  }
  return mapping;
}

function updateStatusUI() {
  if (isCapturing) {
    statusDot.classList.remove("idle");
    statusDot.classList.add("recording");
    statusText.textContent = "Recording";
    toggleBtn.textContent = "Stop Transcription";
    toggleBtn.classList.add("recording");
    hintEl.textContent =
      "Capturing audio from the active tab. Leave this panel open while your meeting runs.";
  } else {
    statusDot.classList.add("idle");
    statusDot.classList.remove("recording");
    statusText.textContent = "Idle";
    toggleBtn.textContent = "Start Transcription";
    toggleBtn.classList.remove("recording");
    hintEl.textContent =
      "Tip: open your Teams, Zoom, or Meet tab and click Start. Audio is captured from the active tab.";
  }
  const hasEntries = entries.length > 0;
  copyBtn.disabled = !hasEntries;
  downloadBtn.disabled = !hasEntries;
  clearBtn.disabled = !hasEntries || isCapturing;
  emptyState.classList.toggle("hidden", hasEntries);
}

function renderPlatform(platform, title) {
  if (!platform && !title) {
    meetingBar.classList.add("hidden");
    return;
  }
  meetingBar.classList.remove("hidden");
  platformBadge.textContent =
    platform === "teams"
      ? "Teams"
      : platform === "zoom"
        ? "Zoom"
        : platform === "meet"
          ? "Meet"
          : "Tab";
  meetingTitle.textContent = title || "Active tab";
}

function showError(text, { requireSignIn = false } = {}) {
  errorText.textContent = text;
  errorSignIn.classList.toggle("hidden", !requireSignIn);
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.classList.add("hidden");
  errorText.textContent = "";
}

function appendSegments(chunk) {
  const segs =
    Array.isArray(chunk.segments) && chunk.segments.length > 0
      ? chunk.segments
      : // Fallback: no diarization (e.g. non-diarize deployment) — treat
        // whole chunk as one speaker.
        chunk.text && chunk.text.trim()
        ? [{ speaker: "speaker_0", text: chunk.text, start: 0, end: 0 }]
        : [];
  if (segs.length === 0) return;

  // Run the chunk's raw speaker ids through the session stitcher so
  // the same voice keeps the same label across chunks.
  const chunkOffsetMs = (chunk.elapsedSeconds || 0) * 1000;
  const stableByRaw = stitchChunk(chunkOffsetMs, segs);

  // Collapse consecutive same-speaker segments within the chunk so the
  // UI doesn't fragment into many tiny bubbles for one speaker.
  const collapsed = [];
  for (const seg of segs) {
    const raw = seg.speaker || "speaker_0";
    const stableId = stableByRaw.get(raw) || raw;
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.stableId === stableId) {
      prev.text = `${prev.text} ${seg.text}`.replace(/\s+/g, " ").trim();
    } else {
      collapsed.push({ stableId, text: (seg.text || "").trim() });
    }
  }

  for (const c of collapsed) {
    if (!c.text) continue;
    const { color, label } = speakerLabel(c.stableId);
    const entry = {
      stableSpeakerId: c.stableId,
      color,
      label,
      text: c.text,
      timestamp: chunk.timestamp || new Date().toISOString(),
      elapsedSeconds: chunk.elapsedSeconds || 0,
    };
    entries.push(entry);
    renderEntry(entry);
  }

  chunkMeta.textContent = `chunk ${chunk.chunkIndex || entries.length}`;
  updateStatusUI();
  // Auto-scroll to the newest entry.
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function renderEntry(entry) {
  const wrap = document.createElement("div");
  wrap.className = "entry";
  const head = document.createElement("div");
  head.className = "entry-head";
  const time = document.createElement("span");
  time.className = "entry-time";
  time.textContent = formatClock(entry.elapsedSeconds);
  const sp = document.createElement("span");
  sp.className = "entry-speaker";
  sp.textContent = entry.label;
  sp.style.backgroundColor = entry.color;
  head.append(time, sp);
  const body = document.createElement("div");
  body.className = "entry-text";
  body.textContent = entry.text;
  wrap.append(head, body);
  transcriptEl.appendChild(wrap);
}

function formatTranscriptForExport() {
  const lines = [];
  lines.push("Dhvani transcript");
  lines.push("Exported: " + new Date().toISOString());
  lines.push("");
  for (const e of entries) {
    lines.push(
      `[${formatClock(e.elapsedSeconds)}] ${e.label}: ${e.text}`
    );
  }
  return lines.join("\n");
}

// --------- Button handlers ----------

toggleBtn.addEventListener("click", async () => {
  hideError();
  toggleBtn.disabled = true;
  try {
    const action = isCapturing ? "stop" : "start";
    const resp = await chrome.runtime.sendMessage({ action });
    if (resp && !resp.ok && resp.error) {
      showError(resp.error);
    }
  } catch (err) {
    showError("Couldn't reach the extension background. Try reloading.");
  } finally {
    toggleBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  const text = formatTranscriptForExport();
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied ✓";
    setTimeout(() => (copyBtn.textContent = "Copy all"), 1200);
  } catch {
    showError("Clipboard access was denied by the browser.");
  }
});

downloadBtn.addEventListener("click", () => {
  const text = formatTranscriptForExport();
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `dhvani-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation so Chrome has time to pull the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

clearBtn.addEventListener("click", () => {
  if (isCapturing) return;
  if (!confirm("Clear the current transcript?")) return;
  entries.length = 0;
  speakerAssignments.clear();
  known.length = 0;
  nextStableIdN = 1;
  transcriptEl.innerHTML = "";
  chunkMeta.textContent = "";
  updateStatusUI();
});

errorSignIn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "openSignIn" });
});
errorDismiss.addEventListener("click", hideError);

// --------- Background event stream ----------

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "tick":
      elapsedEl.textContent = formatClock(msg.elapsedSeconds);
      break;
    case "started":
      isCapturing = true;
      renderPlatform(msg.platform, msg.meetingTitle);
      updateStatusUI();
      hideError();
      break;
    case "stopped":
      isCapturing = false;
      updateStatusUI();
      break;
    case "transcript":
      appendSegments(msg.data || {});
      break;
    case "meeting-detected":
    case "meeting-title":
      renderPlatform(msg.platform, msg.meetingTitle);
      break;
    case "error":
      showError(msg.error || "Something went wrong.", {
        requireSignIn: Boolean(msg.requireSignIn),
      });
      break;
  }
});

// --------- Initial status sync ----------

(async function init() {
  try {
    const status = await chrome.runtime.sendMessage({ action: "getStatus" });
    if (status && status.ok) {
      isCapturing = Boolean(status.isCapturing);
      elapsedEl.textContent = formatClock(status.elapsedSeconds || 0);
      renderPlatform(status.platform, status.meetingTitle);
      if (status.lastError) showError(status.lastError);
      updateStatusUI();
    }
  } catch {
    /* worker not ready yet — render idle state */
    updateStatusUI();
  }
})();

updateStatusUI();
