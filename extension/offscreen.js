/**
 * Dhvani — offscreen-document recorder.
 *
 * The MV3 service worker can mint a tab-capture stream id but cannot
 * hold a MediaStream / MediaRecorder (no DOM, no navigator.mediaDevices).
 * This hidden offscreen document owns the recorder and relays audio
 * chunks back to the service worker for upload.
 *
 * Protocol (all via chrome.runtime.sendMessage):
 *   ← { target: "offscreen", action: "startRecording", streamId, chunkMs }
 *   → { ok: true }                      (start succeeded)
 *   → { type: "offscreen-chunk", bytes, mimeType, durationSec }
 *   ← { target: "offscreen", action: "stopRecording" }
 *   → { ok: true }
 *   → { type: "offscreen-error", error }  (any recorder failure)
 */

let stream = null;
let recorder = null;
let chunkStartMs = 0;
let localPlayback = null;

// Keep the active-tab audio audible while we're tapping it — without
// this, getUserMedia on a tab stream *replaces* the tab's audio instead
// of cloning it, so the user would hear silence.
function keepTabAudible(s) {
  try {
    localPlayback = new Audio();
    localPlayback.srcObject = s;
    localPlayback.play().catch(() => undefined);
  } catch {
    /* non-fatal */
  }
}

function pickMimeType() {
  // Chrome supports webm/opus everywhere; the ;codecs suffix gives us
  // the best upstream compatibility with gpt-4o-transcribe.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

async function startRecording(streamId, chunkMs) {
  if (recorder) {
    return { ok: false, error: "Already recording." };
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        "getUserMedia failed: " + (err && err.message ? err.message : String(err)),
    };
  }

  keepTabAudible(stream);

  const mimeType = pickMimeType();
  try {
    recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined
    );
  } catch (err) {
    cleanup();
    return {
      ok: false,
      error:
        "MediaRecorder init failed: " +
        (err && err.message ? err.message : String(err)),
    };
  }

  chunkStartMs = Date.now();

  recorder.ondataavailable = async (ev) => {
    if (!ev.data || ev.data.size === 0) return;
    const now = Date.now();
    const durationSec = Math.max(1, (now - chunkStartMs) / 1000);
    chunkStartMs = now;

    // We can't send Blobs across chrome.runtime messages; hand over the
    // underlying bytes as a plain ArrayBuffer.
    let bytes;
    try {
      bytes = await ev.data.arrayBuffer();
    } catch (err) {
      chrome.runtime.sendMessage({
        type: "offscreen-error",
        error: "Failed to read chunk: " + String(err),
      });
      return;
    }

    chrome.runtime
      .sendMessage({
        type: "offscreen-chunk",
        bytes,
        mimeType: ev.data.type || mimeType || "audio/webm",
        durationSec,
      })
      .catch(() => undefined);
  };

  recorder.onerror = (ev) => {
    chrome.runtime.sendMessage({
      type: "offscreen-error",
      error: "Recorder error: " + (ev.error?.message || String(ev.error)),
    });
  };

  try {
    recorder.start(chunkMs || 10_000);
  } catch (err) {
    cleanup();
    return {
      ok: false,
      error:
        "recorder.start failed: " + (err && err.message ? err.message : String(err)),
    };
  }

  return { ok: true };
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
  }
  cleanup();
  return { ok: true };
}

function cleanup() {
  if (stream) {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    stream = null;
  }
  if (localPlayback) {
    try {
      localPlayback.pause();
      localPlayback.srcObject = null;
    } catch {
      /* ignore */
    }
    localPlayback = null;
  }
  recorder = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  (async () => {
    if (msg.action === "startRecording") {
      const r = await startRecording(msg.streamId, msg.chunkMs);
      sendResponse(r);
      return;
    }
    if (msg.action === "stopRecording") {
      sendResponse(stopRecording());
      return;
    }
    sendResponse({ ok: false, error: "Unknown offscreen action." });
  })();
  return true;
});
