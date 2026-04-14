# Dhvani (ध्वनि)

**Open-source multilingual meeting transcription for everyone.**

Dhvani captures audio from Zoom, Teams, or Google Meet and transcribes it in real-time using OpenAI Whisper. Works on any device — PC, Mac, or phone — through your browser.

Named from the Sanskrit word for "sound" (ध्वनि), Dhvani is built to make meeting transcription accessible, open, and free.

![MIT License](https://img.shields.io/badge/license-MIT-14b8a6.svg) ![Next.js](https://img.shields.io/badge/Next.js-14-000) ![OpenAI Whisper](https://img.shields.io/badge/Whisper-API-10a37f)

## Features

- 🎤 **Real-time transcription** from any meeting platform — Zoom, Teams, Meet, WebEx, and more
- 🌐 **Works in any browser** (no install needed) or as a native desktop app via Electron
- 🗣️ **50+ languages** supported via Whisper with auto-detection
- 💾 **Export to `.txt`, `.srt`, `.json`** or copy to clipboard
- 📱 **PWA** — install on your phone's home screen for one-tap launches
- 🔑 **Your API key, your data, your control** — bring your own OpenAI key; nothing is stored server-side
- 💰 **Transparent cost tracking** — running dollar estimate as the meeting goes
- 🆓 **Free and open source** (MIT License)

## Quick Start

```bash
git clone https://github.com/techpolicycomms/dhvani.git
cd dhvani
npm install
cp .env.local.example .env.local
# Add your OpenAI API key to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or Firefox. Walk through the one-time setup wizard and press **Start**.

### Alternative: bring your key in the browser

If you don't want to set `OPENAI_API_KEY` server-side, click the ⚙️ **Settings** gear and paste your key there. It's stored only in your browser's `localStorage` and sent to `/api/transcribe` as an `x-openai-key` header — never logged.

## How It Works

```
  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
  │ Meeting app │ ──▶ │ Browser / Electron│ ──▶ │ /api/transcribe │ ──▶ │ Whisper API  │
  │ (Zoom, etc) │     │ MediaRecorder     │     │ (Next.js route) │     │ (OpenAI)     │
  └─────────────┘     └──────────────────┘     └─────────────────┘     └──────────────┘
                              │                                              │
                              │                        transcript chunks ◀───┘
                              ▼
                       ┌──────────────┐
                       │ Transcript   │
                       │ UI + export  │
                       └──────────────┘
```

1. Dhvani records audio in **configurable chunks** (3–15 seconds, default 5) using the browser's `MediaRecorder` API.
2. Each chunk is POSTed to `/api/transcribe`, which proxies to the OpenAI Whisper `whisper-1` endpoint. Your API key never reaches the browser bundle.
3. Transcribed text is appended to a live transcript with timestamps, persisted to `localStorage`, and exportable in multiple formats.

## Capture Modes

Dhvani supports three browser-based capture modes plus a native Electron mode:

| Mode | Best for | How it works |
| --- | --- | --- |
| **Tab Audio** | Meetings running in a Chrome/Edge/Firefox tab | `getDisplayMedia({ audio: true })` — check "Share audio" when picking the tab |
| **Microphone** | Mobile, or any fallback | `getUserMedia({ audio: true })` — headset or phone near speakers |
| **Virtual Cable** | Desktop apps (Zoom/Teams installed) | BlackHole (macOS) or VB-CABLE (Windows) routes system audio into Dhvani |
| **Electron** | Desktop apps, no virtual cable | Native `desktopCapturer` — install `npm run electron:build` |

See [`app/desktop-setup/page.tsx`](app/desktop-setup/page.tsx) in the app for step-by-step virtual-cable guides with diagrams.

## Electron Desktop App

For the cleanest desktop experience — no browser tab, no virtual cable — run Dhvani as an Electron app:

```bash
npm run electron:dev     # develop
npm run electron:build   # package .dmg (Mac) and .exe (Windows)
```

Features:
- Captures system audio natively (no BlackHole / VB-CABLE required)
- Global hotkey to toggle capture (`Cmd+Shift+T` / `Ctrl+Shift+T`)
- System tray icon with Start/Stop/Quit
- Same React UI — the renderer auto-detects `window.electronAPI` and uses native capture

## Python Companion (optional)

Prefer the browser but need to feed system audio from a desktop app? The `companion/` folder ships a small Python script that captures from any audio device and streams to Dhvani via WebSocket. See [`companion/README.md`](companion/README.md) for install and usage.

## Architecture

```
dhvani/
├── app/                    # Next.js 14 App Router
│   ├── layout.tsx          # Root layout with PWA head tags
│   ├── page.tsx            # Main transcription UI
│   ├── desktop-setup/      # Virtual-cable walk-through
│   └── api/
│       ├── transcribe/     # POST: audio → Whisper → text
│       └── health/         # GET: validate API key
├── components/             # React components (TranscriptPanel, ControlBar, …)
├── hooks/                  # Core hooks: useAudioCapture, useTranscription, useTranscriptStore
├── lib/                    # Pure utilities: openai, audioUtils, exportUtils, constants
├── electron/               # Optional Electron wrapper
├── companion/              # Optional Python audio companion
└── public/                 # PWA manifest, service worker, icons
```

Key files to read first:

- [`hooks/useAudioCapture.ts`](hooks/useAudioCapture.ts) — three-mode MediaRecorder pipeline with reconnect support
- [`hooks/useTranscription.ts`](hooks/useTranscription.ts) — queued Whisper client with retries and cost tracking
- [`app/api/transcribe/route.ts`](app/api/transcribe/route.ts) — secure API proxy; key never leaks

## Settings

All settings persist in `localStorage`:

| Setting | Default | Notes |
| --- | --- | --- |
| OpenAI API Key | (none — uses `.env`) | Client-side override; validated by `/api/health` |
| Language | Auto-detect | ISO-639-1 hint passed to Whisper |
| Chunk Duration | 5 s | 3–15 s. Shorter = lower latency, more API calls |
| Audio Device | Default input | Required for virtual-cable mode |

## Security & Privacy

- The OpenAI API key is kept in `.env.local` (server-side) or `localStorage` (client-side). It's never exposed to the browser bundle or logged.
- Audio chunks are streamed to Whisper and discarded after transcription — Dhvani doesn't persist raw audio anywhere.
- The transcript is saved **only** in your browser's `localStorage`. There's no backend database.
- The Service Worker explicitly does not cache `/api/*` routes.

## Cost

Whisper is billed at **$0.006 per minute** of audio. Dhvani shows a running estimate in the control bar — a typical 1-hour meeting costs about **$0.36**.

## Limitations

- Whisper requires each chunk to be ≤ 25 MB (not a practical limit at 5 s chunks).
- Tab audio requires users to check "Share audio" when picking the tab — there's no way around this browser prompt.
- iOS Safari doesn't support `getDisplayMedia`. Use microphone mode on iPhone/iPad.
- Whisper is best-effort on noisy audio and in overlapping speech; consider diarization tools for multi-speaker attribution.

## Contributing

We welcome PRs! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, code style, and areas we'd love help with (i18n, tests, macOS audio via CoreAudio, streaming Whisper…).

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- **OpenAI Whisper** — the open-weights speech-to-text model that makes this possible
- **BlackHole** (existential.audio) and **VB-Audio CABLE** — free virtual audio drivers
- The **Next.js**, **React**, and **Tailwind CSS** teams

---

Built with ☕ by people who took too many meeting notes.
