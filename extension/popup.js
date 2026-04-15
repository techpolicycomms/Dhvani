/**
 * Dhvani — toolbar popup.
 *
 * Mostly a compact status + Start/Stop surface, primarily useful when
 * the user isn't ready to open the side panel or on Chrome channels
 * where side panel isn't available.
 */

const $ = (id) => document.getElementById(id);
const statusDot = $("status-dot");
const statusText = $("status-text");
const elapsed = $("elapsed");
const chunks = $("chunks");
const cost = $("cost");
const toggleBtn = $("toggle-btn");
const openPanelBtn = $("open-panel-btn");
const signInBtn = $("signin-btn");
const errorEl = $("error");
const contextEl = $("context");

let isCapturing = false;

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function render(status) {
  isCapturing = Boolean(status && status.isCapturing);
  if (isCapturing) {
    statusDot.classList.add("recording");
    statusText.textContent = "Recording";
    toggleBtn.textContent = "Stop Transcription";
    toggleBtn.classList.add("recording");
  } else {
    statusDot.classList.remove("recording");
    statusText.textContent = "Idle";
    toggleBtn.textContent = "Start Transcription";
    toggleBtn.classList.remove("recording");
  }
  elapsed.textContent = formatClock(status?.elapsedSeconds);
  chunks.textContent = String(status?.chunkCount || 0);
  cost.textContent = `$${(status?.totalCost || 0).toFixed(3)}`;
}

function showError(text) {
  errorEl.textContent = text;
  errorEl.classList.remove("hidden");
}

function hideError() {
  errorEl.classList.add("hidden");
}

async function queryActiveTabPlatform() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url) return;
    const url = tab.url;
    let label = "";
    if (url.includes("teams.microsoft.com")) label = "Microsoft Teams";
    else if (url.includes("zoom.us")) label = "Zoom";
    else if (url.includes("meet.google.com")) label = "Google Meet";
    if (label) {
      contextEl.classList.add("on-meeting");
      contextEl.textContent = `Detected ${label} in this tab — ready to transcribe.`;
    } else {
      contextEl.classList.remove("on-meeting");
      contextEl.textContent =
        "Navigate to a Teams, Zoom, or Meet tab to start transcribing.";
    }
  } catch {
    /* ignore */
  }
}

toggleBtn.addEventListener("click", async () => {
  hideError();
  toggleBtn.disabled = true;
  try {
    const action = isCapturing ? "stop" : "start";
    const resp = await chrome.runtime.sendMessage({ action });
    if (resp && !resp.ok && resp.error) showError(resp.error);
    const status = await chrome.runtime.sendMessage({ action: "getStatus" });
    if (status && status.ok) render(status);
  } catch (err) {
    showError("Couldn't reach the extension background.");
  } finally {
    toggleBtn.disabled = false;
  }
});

openPanelBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.windowId != null && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } else {
      showError("Side panel isn't supported in this Chrome version.");
    }
  } catch (err) {
    showError("Couldn't open the side panel.");
  }
});

signInBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "openSignIn" });
  window.close();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "tick" || msg.type === "started" || msg.type === "stopped") {
    // The popup only lives while open, so we pull a full snapshot rather
    // than mirror every delta.
    void chrome.runtime
      .sendMessage({ action: "getStatus" })
      .then((s) => s?.ok && render(s))
      .catch(() => undefined);
  }
  if (msg.type === "error") {
    showError(msg.error || "Something went wrong.");
  }
});

(async function init() {
  await queryActiveTabPlatform();
  try {
    const status = await chrome.runtime.sendMessage({ action: "getStatus" });
    if (status && status.ok) render(status);
  } catch {
    render({ isCapturing: false });
  }
})();
