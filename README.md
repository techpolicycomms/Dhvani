# Dhvani (ध्वनि)

**Open-source multilingual meeting transcription for everyone.**

Dhvani captures audio from Zoom, Teams, or Google Meet and transcribes it in real time using **Azure OpenAI GPT-4o Transcribe** with built-in **speaker diarization**. It runs as a web app, a Chrome extension, an Electron desktop app, or a Python CLI companion — audio stays inside your Azure tenant.

Named from the Sanskrit word for "sound" (ध्वनि), Dhvani is built to make meeting transcription accessible, open, and free.

![MIT License](https://img.shields.io/badge/license-MIT-1DA0DB.svg) ![Next.js](https://img.shields.io/badge/Next.js-14-000) ![Azure OpenAI](https://img.shields.io/badge/Azure_OpenAI-GPT--4o_Transcribe-1DA0DB)

> Developed by the **ITU Innovation Hub**.

---

## Features

### Core Transcription
- **Real-time transcription with speaker diarization** — GPT-4o Transcribe identifies who said what automatically
- **50+ languages** with auto-detection and lower word-error rate than legacy Whisper
- **Color-coded speakers** with click-to-rename — "Speaker 1" becomes "Karim" in one click
- **Configurable chunk duration** (3–15 s, default 10 s) — shorter = lower latency, longer = better speaker tracking

### AI Meeting Summary
- **One-click AI summary** powered by GPT-4o — generates structured markdown with key decisions, discussion points, and participant contributions
- **Action items** automatically extracted with assignee and due date, rendered as an interactive checklist
- **Copy / email / regenerate** — share the summary directly from the UI
- **Auto-prompt** — after stopping a 5+ minute session, Dhvani offers to generate a summary

### Transcript Management
- **Save transcripts** to the server — persisted per-user at `DHVANI_DATA_DIR/<userId>/<id>.json`
- **Transcript history** page with search, date filters (7 d / 30 d / all), and bulk export
- **Export** to `.txt`, `.srt`, `.json`, `.csv`, or copy to clipboard — all speaker-aware
- **Delete** saved transcripts at any time

### Calendar Integration
- **Microsoft Outlook calendar sync** via Graph API — shows today's meetings and an upcoming-meeting banner with countdown
- **Platform detection** for Teams, Zoom, and Meet — one-click join from the meeting card
- **Meeting metadata** attached to saved transcripts (subject, organizer, start/end)

### Progressive Web App (PWA)
- **Installable** on desktop and mobile — prompted automatically in Chrome/Edge, with iOS "Add to Home Screen" instructions
- **Offline fallback** page when the network is unavailable
- **Service worker** with versioned caches, network-first pages, cache-first hashed assets, and background sync for failed transcription chunks via IndexedDB

### Chrome Extension
- **Manifest V3** extension in the `extension/` folder
- **One-click tab audio capture** for Teams, Zoom, and Meet tabs — uses the offscreen-document pattern for MediaRecorder
- **Side panel** with live transcript, speaker labels, and export
- **"Dhvani ● Recording" badge** injected into the meeting tab via content script
- **SSO integration** — reads the session cookie via `chrome.cookies` and sends it as `x-auth-token`

### Electron Desktop App
- **System audio capture** via `desktopCapturer` — no virtual cable required
- **Global hotkey** (`Cmd+Shift+T` / `Ctrl+Shift+T`) and system tray icon
- **Same React UI** — the renderer auto-detects `window.electronAPI` and switches to native capture

### Administration
- **Admin dashboard** at `/admin` with 30-day spend chart, daily-minutes-by-user line chart, and sortable user table
- **Rate limits** — per-user minutes/hour and minutes/day, org-wide monthly USD budget
- **Kill switch** — disable the service instantly from the dashboard
- **CSV export** of usage data for audit/finance
- **Optional SSO** — when `AZURE_AD_CLIENT_SECRET` is unset, Dhvani runs without sign-in (local dev mode)

### Security & Privacy
- Azure OpenAI key lives server-side only — never exposed to the browser
- Transcription goes to the org's Azure OpenAI resource — no traffic leaves the tenant
- Every API route requires a valid Entra ID session (or local-user in no-auth mode); admin routes additionally check `ADMIN_EMAILS`
- Audio chunks are streamed to the model and discarded — Dhvani does not persist raw audio
- Saved transcripts are user-scoped; `/api/transcripts/[id]` returns 404 to anyone else
- The Graph access token lives inside the signed JWT cookie, invisible to client JS, and auto-refreshes via `offline_access`
- Usage log stores metadata only (userId, seconds, cost) — never transcript text
- The service worker explicitly skips `/api/*` routes

---

## Quick Start

```bash
git clone https://github.com/techpolicycomms/dhvani.git
cd dhvani
npm install
cp .env.local.example .env.local
# Fill in AZURE_OPENAI_* at minimum.
# Leave AZURE_AD_CLIENT_SECRET blank to run without SSO (local dev).
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge and press **Start**.

> Deploying for your whole team? See [**For Organizations**](#for-organizations).

---

## How It Works

```
  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │ Meeting app │ ──▶ │ Browser / Electron│ ──▶ │ /api/transcribe │ ──▶ │ Azure OpenAI     │
  │ (Zoom, etc) │     │ MediaRecorder     │     │ (Next.js route) │     │ gpt-4o-transcribe│
  └─────────────┘     └──────────────────┘     └─────────────────┘     │ -diarize (tenant)│
                              │                                        └──────────────────┘
                              │             segments + speakers ◀────────────┘
                              ▼
                       ┌──────────────┐
                       │ Transcript   │
                       │ UI + export  │
                       └──────────────┘
```

1. Users sign in via **Microsoft Entra ID SSO** (or skip sign-in in local dev mode).
2. Dhvani records audio in configurable chunks using the browser's `MediaRecorder` API.
3. Each chunk is POSTed to `/api/transcribe`, which checks rate limits and budget, then calls the org's **Azure OpenAI `gpt-4o-transcribe-diarize`** deployment. No traffic leaves the Azure tenant.
4. The model returns speaker-annotated segments. Dhvani groups consecutive same-speaker segments into transcript entries with stable colors and friendly labels.
5. Usage is logged (per-chunk seconds + cost) to an append-only JSONL file, powering the admin dashboard.
6. After stopping, users can **generate an AI summary** (GPT-4o), **save** the transcript to the server, and **export** in multiple formats.

---

## Capture Modes

| Mode | Best for | How it works |
| --- | --- | --- |
| **Tab Audio** | Meetings in a browser tab | `getDisplayMedia({ audio: true })` — check "Share audio" |
| **Microphone** | Mobile, or any fallback | `getUserMedia({ audio: true })` — headset/phone near speakers |
| **Virtual Cable** | Desktop apps (Zoom/Teams installed) | BlackHole (macOS) or VB-CABLE (Windows) routes system audio |
| **Chrome Extension** | Meetings in a Chrome tab | One-click tab capture via side panel — no screen-share prompt |
| **Electron** | Desktop apps, no virtual cable | Native `desktopCapturer` captures system audio directly |
| **Python Companion** | Headless / CLI workflows | Captures from any audio device and streams via WebSocket |

See [`app/desktop-setup/page.tsx`](app/desktop-setup/page.tsx) for step-by-step virtual-cable guides.

---

## Architecture

```
dhvani/
├── app/                        # Next.js 14 App Router
│   ├── layout.tsx              # Root layout, PWA meta tags, session provider
│   ├── page.tsx                # Main transcription UI
│   ├── admin/                  # Admin dashboard (charts, controls, CSV)
│   ├── auth/signin/            # Branded Microsoft sign-in page
│   ├── desktop-setup/          # Virtual-cable walkthrough
│   ├── offline/                # PWA offline fallback page
│   ├── transcripts/            # Saved transcript history + viewer
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth v5 handlers
│       ├── transcribe/         # POST: audio → GPT-4o Transcribe → text
│       ├── summarize/          # POST: transcript → GPT-4o → summary + action items
│       ├── transcripts/        # GET/POST: saved transcript list + create
│       ├── transcripts/[id]/   # GET/DELETE: single saved transcript
│       ├── calendar/today/     # GET: today's meetings (Graph API)
│       ├── calendar/upcoming/  # GET: next N hours of meetings
│       ├── me/usage/           # GET: per-user quota snapshot
│       ├── admin/usage/        # GET: aggregate usage (JSON or CSV)
│       ├── admin/config/       # GET/POST: rate limits + kill switch
│       └── health/             # GET: liveness probe
├── components/                 # UI components
│   ├── TranscriptPanel.tsx     # Live transcript with speaker labels
│   ├── ControlBar.tsx          # Start / Stop / Save controls
│   ├── MeetingSummary.tsx      # AI summary panel (generate, copy, email)
│   ├── ActionItems.tsx         # Interactive action-item checklist
│   ├── MeetingList.tsx         # Today's calendar meetings
│   ├── MeetingBanner.tsx       # Upcoming meeting countdown
│   ├── SettingsDrawer.tsx      # Language, chunk duration, device selection
│   ├── ExportMenu.tsx          # Export to txt / srt / json / csv
│   ├── InstallPrompt.tsx       # PWA install prompt
│   ├── CostEstimator.tsx       # Real-time cost display
│   └── ...                     # DeviceSelector, CalendarToggle, SetupWizard, etc.
├── hooks/                      # React hooks
│   ├── useAudioCapture.ts      # MediaRecorder + chunk streaming
│   ├── useTranscription.ts     # Chunk → /api/transcribe pipeline
│   ├── useTranscriptStore.ts   # Zustand store, localStorage persistence
│   ├── useCalendarPrefs.ts     # Calendar integration prefs
│   ├── useMeetingReminders.ts  # Polls upcoming meetings
│   └── useAudioDevices.ts      # Enumerates audio inputs
├── lib/                        # Server-side utilities
│   ├── auth.ts                 # NextAuth v5 + Entra ID + optional SSO
│   ├── openai.ts               # Azure OpenAI client (Whisper + GPT-4o)
│   ├── rateLimiter.ts          # Sliding-window per-user + monthly budget
│   ├── usageLogger.ts          # Append-only JSONL usage log
│   ├── usageAggregates.ts      # Aggregate usage for admin dashboard
│   ├── transcriptStorage.ts    # Server-side transcript persistence
│   ├── calendar.ts             # Microsoft Graph calendar integration
│   ├── constants.ts            # Pricing, languages, speaker colors
│   └── ...                     # audioUtils, exportUtils, theme, env
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json           # Permissions: tabCapture, sidePanel, offscreen
│   ├── background.js           # Service worker — tab capture orchestration
│   ├── offscreen.html/.js      # Hidden MediaRecorder host
│   ├── sidepanel.html/.css/.js # Transcript side panel
│   ├── popup.html/.css/.js     # Toolbar popup
│   ├── content.js              # Meeting detection + recording badge
│   └── icons/                  # 16, 48, 128 px PNGs
├── electron/                   # Electron desktop wrapper
│   ├── main.ts                 # Main process, tray, global shortcuts
│   ├── preload.ts              # Context isolation bridge
│   └── audioCapture.ts         # Native desktopCapturer
├── companion/                  # Python audio companion (WebSocket)
│   ├── capture.py              # Device capture → WebSocket streaming
│   └── requirements.txt        # sounddevice, websockets
├── public/
│   ├── manifest.json           # PWA manifest (standalone, share_target)
│   ├── sw.js                   # Service worker (versioned cache, offline)
│   └── icons/                  # PWA icons (72–512 px)
├── docs/deployment.md          # Azure deployment guide
├── Dockerfile                  # Multi-stage production build
├── docker-compose.yml          # Local-parity compose
└── .github/workflows/          # Deploy to Azure on push to main
```

---

## Chrome Extension

The `extension/` folder contains a complete Manifest V3 Chrome extension for transcribing meeting tabs without screen-share prompts.

### Install (development)

1. Open `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Pin the Dhvani icon in the toolbar
4. Navigate to a Teams / Zoom / Meet tab and click the icon or open the side panel

The extension reads the Dhvani session cookie and sends it as an `x-auth-token` header, so users must be signed in to the web app first.

---

## Electron Desktop App

For system audio capture without a virtual cable:

```bash
npm run electron:dev     # develop
npm run electron:build   # package .dmg (Mac) and .exe (Windows)
```

Features: native system audio capture, global hotkey (`Cmd/Ctrl+Shift+T`), system tray, same React UI.

---

## Python Companion

The `companion/` folder ships a small Python script that captures audio from any device and streams to Dhvani via WebSocket. See [`companion/README.md`](companion/README.md) for install and usage.

---

## Settings

User-facing settings persist in `localStorage`:

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Auto-detect | ISO-639-1 hint passed to GPT-4o Transcribe |
| Chunk Duration | 10 s | 3–15 s. Shorter = lower latency. Longer = better speaker tracking |
| Audio Device | Default input | Required for virtual-cable mode |
| Calendar Integration | Off | Syncs meetings via Microsoft Graph when enabled |

---

## For Organizations

Dhvani is built to be deployed once, centrally, by an IT team. It runs entirely inside your Azure tenant: SSO via Entra ID, transcription via your Azure OpenAI resource, with rate limits and a usage dashboard baked in.

### Deployment Guide

See [**docs/deployment.md**](./docs/deployment.md) for the full walkthrough — Azure Web App for Containers, Entra ID SSO, GitHub Actions CI/CD, custom domain + HTTPS, kill switch, and ops playbook.

```bash
docker build -t dhvanicr.azurecr.io/dhvani:latest .
docker push dhvanicr.azurecr.io/dhvani:latest
# Or just merge to main — GitHub Actions deploys automatically.
```

### Admin Dashboard

Visit `/admin` as a user whose email is in `ADMIN_EMAILS`:

- **30-day spend** bar chart + **daily minutes by top 5 users** line chart
- **Sortable user table** with minutes, cost, sessions, last active
- **Rate-limit controls** — per-user minutes/hour, minutes/day, org-wide monthly USD budget
- **Kill switch** — disable the service instantly
- **CSV export** for audit/finance

### Cost Estimate

| Component | Monthly cost |
| --- | --- |
| Azure Web App (B1, Linux) | ~$15 |
| Azure Container Registry (Basic) | ~$5 |
| Azure OpenAI transcribe @ ~$0.006/min | $0.36/hour of audio |
| Azure OpenAI GPT-4o summary (per meeting) | ~$0.01–0.05 |
| **Light usage (100 hours/month)** | **~$56** |
| **Heavy usage (500 hours/month)** | **~$200** |

Set `RATE_LIMIT_MONTHLY_BUDGET_USD` in the admin dashboard to cap total spend.

### Environment Variables

See [`.env.local.example`](./.env.local.example) for the complete list. The essentials:

| Variable | Purpose |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI resource key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_WHISPER_DEPLOYMENT` | Transcription model deployment (default `gpt-4o-transcribe-diarize`) |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Chat model deployment for AI summary (default `gpt-4o`) |
| `AZURE_AD_CLIENT_ID` | Entra ID App Registration client ID |
| `AZURE_AD_CLIENT_SECRET` | Entra ID client secret (leave blank for no-auth mode) |
| `AZURE_AD_TENANT_ID` | Entra ID tenant |
| `NEXTAUTH_SECRET` | NextAuth session signing secret |
| `NEXTAUTH_URL` | Public origin (e.g. `https://dhvani.itu.int`) |
| `ADMIN_EMAILS` | Comma-separated admin allowlist |
| `RATE_LIMIT_MINUTES_PER_HOUR` / `_PER_DAY` | Per-user caps (default 60 / 240) |
| `RATE_LIMIT_MONTHLY_BUDGET_USD` | Org-wide monthly ceiling (default $500) |
| `USAGE_LOG_PATH` | JSONL usage log location (default `./data/usage-log.jsonl`) |
| `DHVANI_DATA_DIR` | Saved transcript storage path (default `./data/transcripts`) |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 (App Router, TypeScript strict) |
| Auth | NextAuth v5 (Auth.js) + Microsoft Entra ID |
| Transcription | Azure OpenAI GPT-4o Transcribe with diarization |
| AI Summary | Azure OpenAI GPT-4o (chat completions) |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Charts | Recharts (admin dashboard) |
| Desktop | Electron 30 |
| Extension | Chrome Manifest V3 |
| Container | Docker (Alpine Node 20, multi-stage) |
| CI/CD | GitHub Actions → Azure Container Registry → Azure Web App |

---

## Limitations

- Each audio chunk must be ≤ 25 MB (not a practical limit at 10 s chunks).
- Tab audio requires users to check "Share audio" when picking the tab — there's no way around this browser prompt.
- iOS Safari doesn't support `getDisplayMedia`. Use microphone mode on iPhone/iPad.
- Diarizer speaker IDs are scoped to a single chunk — "speaker_0" in one chunk may not match the next. Dhvani biases chunk size upward and lets users rename speakers; perfect cross-chunk stitching would require persistent speaker embeddings.

## Contributing

We welcome PRs! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, code style, and areas we'd love help with (i18n, tests, macOS audio via CoreAudio, cross-chunk speaker stitching…).

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- **OpenAI** — GPT-4o Transcribe and GPT-4o chat models
- **BlackHole** (existential.audio) and **VB-Audio CABLE** — free virtual audio drivers
- The **Next.js**, **React**, and **Tailwind CSS** teams

---

Built with ☕ by people who took too many meeting notes.
