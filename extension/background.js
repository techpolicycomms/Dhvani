/**
 * Dhvani — Chrome Extension (MV3) service worker.
 *
 * Orchestrates tab-audio capture and chunked upload to Dhvani's
 * /api/transcribe endpoint, surfaces detected meeting platform,
 * and relays transcripts to the side panel / popup.
 *
 * MV3 caveat: service workers have no DOM, so MediaRecorder cannot
 * run here. The correct pattern is:
 *   1. worker mints a stream id via chrome.tabCapture.getMediaStreamId
 *   2. worker opens an offscreen document (offscreen.html) with reason
 *      USER_MEDIA
 *   3. offscreen document calls getUserMedia with the stream id and
 *      runs MediaRecorder there, piping chunks back to us via
 *      chrome.runtime messages
 *
 * We keep the "offscreen" permission in the manifest for this.
 */

const API_BASE = "https://app-dhvani.azurewebsites.net";
const TRANSCRIBE_URL = `${API_BASE}/api/transcribe`;
const CHUNK_MS = 10_000;
const OFFSCREEN_PATH = "offscreen.html";

// In-worker state. Service workers are evicted after ~30s of idle, so we
// mirror critical state into chrome.storage.session so popup / side panel
// can recover "am I recording?" across worker restarts.
const state = {
  isCapturing: false,
  elapsedSeconds: 0,
  chunkCount: 0,
  totalCost: 0,
  tabId: null,
  meetingTitle: "",
  platform: "",
  startedAt: null,
  // Latched to surface the last error to the side panel on demand.
  lastError: null,
};

let elapsedInterval = null;

// ---------- Offscreen-document helpers ----------

async function hasOffscreenDocument() {
  // getContexts is the modern API; fall back to the older existence check
  // for Chrome < 116.
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }
  const matched = await clients.matchAll();
  return matched.some((c) => c.url.endsWith(OFFSCREEN_PATH));
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification:
      "Capture active-tab audio and run MediaRecorder to chunk it for transcription.",
  });
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      /* already closing */
    }
  }
}

// ---------- State mirroring ----------

async function persistState() {
  try {
    await chrome.storage.session.set({ dhvaniState: { ...state } });
  } catch {
    /* session storage may be unavailable on old Chrome — best effort */
  }
}

async function rehydrateState() {
  try {
    const { dhvaniState } = await chrome.storage.session.get("dhvaniState");
    if (dhvaniState) Object.assign(state, dhvaniState);
  } catch {
    /* ignore */
  }
}

function broadcast(msg) {
  // chrome.runtime.sendMessage throws if no receiver is listening. That's
  // fine — the side panel might be closed. Swallow the "no listener" error.
  chrome.runtime.sendMessage(msg).catch(() => undefined);
}

// ---------- Auth ----------

/**
 * Dhvani uses Microsoft SSO via NextAuth. The signed session cookie is
 * either `__Secure-authjs.session-token` (https) or
 * `authjs.session-token` (http). We grab whichever exists and mirror it
 * into the `x-auth-token` header the server accepts as an alternative to
 * the cookie — Chrome extensions sometimes drop third-party cookies from
 * cross-origin fetch even with credentials:include, so header fallback is
 * belt-and-suspenders.
 */
async function readSessionToken() {
  try {
    const [secureCookie, plainCookie] = await Promise.all([
      chrome.cookies.get({
        url: API_BASE,
        name: "__Secure-authjs.session-token",
      }),
      chrome.cookies.get({ url: API_BASE, name: "authjs.session-token" }),
    ]);
    return (secureCookie && secureCookie.value) ||
      (plainCookie && plainCookie.value) ||
      null;
  } catch {
    return null;
  }
}

async function openSignInTab() {
  const url = `${API_BASE}/auth/signin`;
  await chrome.tabs.create({ url });
}

// ---------- Capture control ----------

async function startCapture() {
  if (state.isCapturing) return { ok: true, alreadyRunning: true };

  state.lastError = null;

  // Resolve the active tab. The side panel doesn't have a tab of its own,
  // so we look at whichever tab is currently focused.
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab || !activeTab.id) {
    state.lastError = "No active tab to capture.";
    await persistState();
    return { ok: false, error: state.lastError };
  }

  // Mint a media-stream id tied to that tab. The id is single-use and
  // must be consumed by getUserMedia inside the offscreen doc.
  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId(
        { targetTabId: activeTab.id },
        (id) => {
          if (chrome.runtime.lastError || !id) {
            reject(
              new Error(
                chrome.runtime.lastError?.message ||
                  "tabCapture.getMediaStreamId returned no id"
              )
            );
            return;
          }
          resolve(id);
        }
      );
    });
  } catch (err) {
    state.lastError =
      "Couldn't capture tab audio. Make sure the tab is playing audio and that the extension has permission.";
    await persistState();
    broadcast({ type: "error", error: state.lastError, detail: String(err) });
    return { ok: false, error: state.lastError };
  }

  await ensureOffscreenDocument();

  // Kick off recording in the offscreen doc. It responds once the recorder
  // is wired up; chunk uploads happen asynchronously via 'chunk' messages.
  const startResp = await chrome.runtime
    .sendMessage({
      target: "offscreen",
      action: "startRecording",
      streamId,
      chunkMs: CHUNK_MS,
    })
    .catch((err) => ({ ok: false, error: String(err) }));

  if (!startResp || !startResp.ok) {
    state.lastError =
      (startResp && startResp.error) || "Offscreen recorder failed to start.";
    await closeOffscreenDocument();
    await persistState();
    broadcast({ type: "error", error: state.lastError });
    return { ok: false, error: state.lastError };
  }

  state.isCapturing = true;
  state.tabId = activeTab.id;
  state.elapsedSeconds = 0;
  state.chunkCount = 0;
  state.totalCost = 0;
  state.startedAt = new Date().toISOString();
  state.meetingTitle = activeTab.title || "";
  state.platform = detectPlatformFromUrl(activeTab.url || "");
  await persistState();

  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    state.elapsedSeconds += 1;
    // Fire a lightweight status ping every second so the UI's "mm:ss"
    // counter stays live without polling.
    broadcast({ type: "tick", elapsedSeconds: state.elapsedSeconds });
    // Persist every 10 s to bound write load.
    if (state.elapsedSeconds % 10 === 0) void persistState();
  }, 1000);

  broadcast({
    type: "started",
    platform: state.platform,
    meetingTitle: state.meetingTitle,
    startedAt: state.startedAt,
  });
  return { ok: true };
}

async function stopCapture() {
  if (!state.isCapturing) return { ok: true, alreadyStopped: true };

  await chrome.runtime
    .sendMessage({ target: "offscreen", action: "stopRecording" })
    .catch(() => undefined);
  await closeOffscreenDocument();

  state.isCapturing = false;
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
  await persistState();
  broadcast({ type: "stopped" });
  return { ok: true };
}

// ---------- Chunk upload ----------

/**
 * Called by the offscreen document whenever MediaRecorder yields a blob.
 * We receive the blob as an ArrayBuffer (service workers can't accept
 * Blobs across runtime messages) plus mime + duration hints.
 */
async function handleChunk({ bytes, mimeType, durationSec }) {
  if (!state.isCapturing) return;

  const estimatedSeconds = Math.max(1, Math.round(durationSec || 10));
  const authToken = await readSessionToken();

  const form = new FormData();
  const blob = new Blob([bytes], { type: mimeType || "audio/webm" });
  // Give the server something vaguely filename-y so the multipart boundary
  // parsing is happy on every platform.
  form.append("file", blob, `chunk-${Date.now()}.webm`);

  const headers = {
    "x-audio-seconds": String(estimatedSeconds),
    "x-chunk-id": `ext-${Date.now()}`,
  };
  if (authToken) headers["x-auth-token"] = authToken;

  let res;
  try {
    res = await fetch(TRANSCRIBE_URL, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
    });
  } catch (err) {
    broadcast({
      type: "error",
      error: "Network error — check your connection.",
      detail: String(err),
    });
    return;
  }

  if (res.status === 401) {
    // Session expired or extension has no cookie yet. Prompt the user to
    // sign in once; we don't auto-stop — they can resume after signing in.
    state.lastError = "Not signed in. Opening sign-in page…";
    await persistState();
    broadcast({ type: "error", error: state.lastError, requireSignIn: true });
    void openSignInTab();
    return;
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    broadcast({
      type: "error",
      error: body.error || "Rate limit hit. Slowing down.",
      retryAfterSeconds: body.retryAfterSeconds,
    });
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    broadcast({
      type: "error",
      error: body.error || `Transcription failed (${res.status}).`,
    });
    return;
  }

  const body = await res.json().catch(() => null);
  if (!body) return;

  state.chunkCount += 1;
  // $0.006/min — same rate the web app uses. This is a display estimate
  // only; the server-side usage log is the source of truth for billing.
  state.totalCost += (estimatedSeconds / 60) * 0.006;
  await persistState();

  broadcast({
    type: "transcript",
    data: {
      text: body.text || "",
      segments: Array.isArray(body.segments) ? body.segments : [],
      language: body.language || null,
      chunkIndex: state.chunkCount,
      elapsedSeconds: state.elapsedSeconds,
      timestamp: new Date().toISOString(),
    },
  });
}

// ---------- Meeting detection ----------

function detectPlatformFromUrl(url) {
  if (!url) return "";
  if (url.includes("teams.microsoft.com")) return "teams";
  if (url.includes("zoom.us")) return "zoom";
  if (url.includes("meet.google.com")) return "meet";
  return "";
}

// ---------- Message routing ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from offscreen are forwarded here too; we filter by target.
  if (msg && msg.target === "offscreen") return;

  (async () => {
    await rehydrateState();

    if (!msg || typeof msg !== "object") {
      sendResponse({ ok: false, error: "Invalid message." });
      return;
    }

    switch (msg.action) {
      case "start": {
        const r = await startCapture();
        sendResponse(r);
        return;
      }
      case "stop": {
        const r = await stopCapture();
        sendResponse(r);
        return;
      }
      case "getStatus": {
        sendResponse({
          ok: true,
          isCapturing: state.isCapturing,
          elapsedSeconds: state.elapsedSeconds,
          chunkCount: state.chunkCount,
          totalCost: state.totalCost,
          meetingTitle: state.meetingTitle,
          platform: state.platform,
          startedAt: state.startedAt,
          lastError: state.lastError,
        });
        return;
      }
      case "openSignIn": {
        await openSignInTab();
        sendResponse({ ok: true });
        return;
      }
      case "openSidePanel": {
        const tab = sender.tab;
        if (tab && tab.windowId != null) {
          try {
            await chrome.sidePanel.open({ windowId: tab.windowId });
          } catch {
            /* not all Chrome versions support programmatic open */
          }
        }
        sendResponse({ ok: true });
        return;
      }
      default:
        break;
    }

    // Messages from offscreen document:
    if (msg.type === "offscreen-chunk") {
      await handleChunk({
        bytes: msg.bytes,
        mimeType: msg.mimeType,
        durationSec: msg.durationSec,
      });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "offscreen-error") {
      state.lastError = msg.error || "Recorder error.";
      await persistState();
      broadcast({ type: "error", error: state.lastError });
      // An unrecoverable recorder error should end the capture session.
      void stopCapture();
      sendResponse({ ok: true });
      return;
    }

    // Messages from content.js (meeting detection).
    if (msg.type === "meeting-detected") {
      state.platform = msg.platform || state.platform;
      if (sender.tab && sender.tab.title) {
        state.meetingTitle = sender.tab.title;
      }
      await persistState();
      broadcast({
        type: "meeting-detected",
        platform: state.platform,
        meetingTitle: state.meetingTitle,
      });
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "meeting-title") {
      state.meetingTitle = msg.title || state.meetingTitle;
      await persistState();
      broadcast({
        type: "meeting-title",
        meetingTitle: state.meetingTitle,
      });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown action." });
  })();

  // Keep the port open for async sendResponse.
  return true;
});

// Side panel opens when the toolbar icon is clicked. Some Chrome channels
// still require the explicit default_panel_behavior toggle.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    /* older Chrome — popup fallback handles it */
  }
  await rehydrateState();
});

// Cold start after eviction: pick up where we left off if possible.
rehydrateState();
