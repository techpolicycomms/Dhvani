# Dhvani Chrome Extension

One-click meeting transcription inside your browser. Captures audio from the active tab (Teams, Zoom, or Meet) and shows a real-time transcript with speaker labels — all from Chrome's side panel.

This is a thin client for the hosted Dhvani web app. The heavy lifting (Azure OpenAI transcription, speaker diarization, usage accounting, rate limits) runs server-side.

## Install (Developer Mode — for testing & pilots)

1. Clone the Dhvani repo (or download the `extension/` folder).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` folder.
5. Pin the Dhvani icon in your toolbar for one-click access.

If you ever modify the extension code, hit the refresh (⟳) button on the Dhvani card in `chrome://extensions` to reload.

## Usage

1. Join your meeting in **Microsoft Teams**, **Zoom**, or **Google Meet** — inside Chrome.
2. Make sure the meeting tab is the **active tab** (Dhvani captures whatever tab is in focus when you press Start).
3. Click the Dhvani icon — the side panel opens.
4. Click **Start Transcription**. A small "Dhvani ● Recording" badge appears in the meeting tab so everyone on your side of the call has a visible indicator.
5. Transcript segments appear in the side panel every ~10 seconds, with speaker labels and timestamps.
6. Click **Stop** when done, then **Copy all** or **Download .txt** to export.

### First-time sign-in

The extension uses the same Microsoft SSO as the Dhvani web app. On first use, if you're not already signed in, the side panel surfaces a "Sign in" link that opens the Dhvani auth page (`https://app-dhvani.azurewebsites.net/auth/signin`). Complete the Entra ID login once — after that the extension picks up the session cookie automatically.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Not signed in" banner after pressing Start | Click **Sign in**, complete Microsoft SSO, then try again. |
| "Couldn't capture tab audio" | The active tab must be playing audio. Click on the meeting tab first, then the extension icon. |
| No transcript appears after 30 s | Open DevTools on the side panel (`chrome://extensions` → Dhvani → Inspect views: `sidepanel.html`) and check the console. |
| Transcript stops mid-meeting | Chrome sometimes evicts MV3 service workers. Press Stop, then Start again. The transcript you've collected stays; it'll resume with a fresh session. |

## For IT Admins — org-wide deployment

Two paths:

### 1. Managed via Chrome Web Store (recommended)

Upload the extension as **Unlisted** to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). Unlisted extensions aren't publicly searchable but can be force-installed.

Then in the Google Admin Console:

- **Devices → Chrome → Apps & extensions → Users & browsers**.
- Select the relevant OU (e.g. all ITU staff).
- Click **+** → **Add Chrome app or extension by ID**, paste the extension ID from the Web Store listing, set **Installation policy** to **Force install**.

Every managed Chrome will receive the extension automatically.

If ITU's endpoints are managed by Group Policy instead (Windows ADMX):

- `Software Policies\Google\Chrome\ExtensionInstallForcelist`
- Value: `<EXTENSION_ID>;https://clients2.google.com/service/update2/crx`

### 2. Developer mode (pilot only)

Share the `extension/` folder internally. Users load it via `chrome://extensions` → Load unpacked. Works for a small pilot but doesn't scale — updates don't auto-install and Chrome nags the user on every restart about the unpacked extension.

## Architecture

```
┌──────────────┐   tabCapture.getMediaStreamId
│ Service worker│ ──────────────────────────┐
│ (background.js)│                           ▼
└──────┬───────┘                    ┌───────────────┐
       │   chrome.runtime messages  │ Offscreen doc │
       │   ┌────────────────────────│ (offscreen.js)│
       │   ▼                        │ MediaRecorder │
       │ chunk bytes (ArrayBuffer)  └───────────────┘
       ▼
┌──────────────┐    fetch /api/transcribe
│ Dhvani web app│ ◀─── multipart audio + x-auth-token
│ (Azure)       │ ────▶ Azure OpenAI gpt-4o-transcribe-diarize
└──────┬───────┘
       │   { text, segments[], language }
       ▼
┌──────────────┐
│ Side panel UI │  — renders entries with speaker colors
│ (sidepanel.js)│
└──────────────┘
```

### Why the offscreen document?

In Manifest V3, service workers have no DOM and no `navigator.mediaDevices`. `MediaRecorder` can't run there. Chrome's official pattern is to open a hidden "offscreen" document that owns the recorder; the worker passes it a stream id minted via `chrome.tabCapture.getMediaStreamId`.

### Auth

The web app uses Microsoft Entra ID via NextAuth v5 (JWT session cookie). The extension reaches into Chrome's cookie store (`chrome.cookies.get`) for the `__Secure-authjs.session-token` cookie and forwards it as an `x-auth-token` header on every `/api/transcribe` call. The server accepts either the cookie (web-app path) or the header (extension path) via `resolveRequestUser()` in `lib/auth.ts` — both are verified against `NEXTAUTH_SECRET`.

### File map

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest — permissions, side panel, content scripts |
| `background.js` | Service worker — state, tab capture orchestration, chunk upload |
| `offscreen.html` / `offscreen.js` | Hidden doc hosting `MediaRecorder` |
| `sidepanel.html` / `.css` / `.js` | Main transcription UI in Chrome's side panel |
| `popup.html` / `.css` / `.js` | Toolbar popup — status + quick controls (fallback) |
| `content.js` | Runs on Teams/Zoom/Meet — reports platform + shows recording badge |
| `icons/` | 16/48/128 PNG icons |
| `scripts/gen-icons.js` | Regenerate icons (`node scripts/gen-icons.js`) |

## Limitations

- **Active-tab-only capture.** Dhvani records whichever Chrome tab is focused when you press Start. Switch tabs mid-meeting and you still capture the original — but if you close it, capture stops.
- **Service-worker eviction.** MV3 evicts idle service workers after ~30 s. An active `MediaRecorder` in an offscreen document keeps the worker alive, but very long meetings (>3 h) can still get evicted under memory pressure. State is mirrored to `chrome.storage.session` so the UI can recover, but you'll see a fresh chunk index.
- **Speaker stitching.** The diarizer assigns `speaker_0`, `speaker_1`, … per chunk — those ids aren't guaranteed to map to the same voice across chunks. Same limitation as the web app.
- **Meeting audio only.** Microphone audio from your own machine is not captured — only the tab's audio. If you need both, use the web app or the Electron app.

## License

Same as the Dhvani repo — MIT.
