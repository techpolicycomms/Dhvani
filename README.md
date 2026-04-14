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
- 🔐 **Single sign-on** via Microsoft Entra ID (Azure AD) — no passwords, no per-user API keys
- 📊 **Admin dashboard** with per-user usage, rate limits, monthly budget cap, and CSV export
- 🆓 **Free and open source** (MIT License)

## Quick Start (local development)

```bash
git clone https://github.com/techpolicycomms/dhvani.git
cd dhvani
npm install
cp .env.local.example .env.local
# Fill in OPENAI_API_KEY, AZURE_AD_*, NEXTAUTH_SECRET, ADMIN_EMAILS
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or Firefox. Sign in with your Microsoft work account and press **Start**.

> Deploying this for your whole team? Skip ahead to [**For Organizations**](#for-organizations).

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

1. Users sign in via **Microsoft Entra ID SSO**. A middleware gates every route behind a valid session.
2. Dhvani records audio in **configurable chunks** (3–15 seconds, default 5) using the browser's `MediaRecorder` API.
3. Each chunk is POSTed to `/api/transcribe`, which checks rate limits and the org-wide monthly budget, then proxies to the OpenAI Whisper `whisper-1` endpoint using the admin-managed server-side key.
4. Usage is logged (per-chunk seconds + cost, keyed by Entra `oid`) to an append-only JSONL log, powering the admin dashboard.
5. Transcribed text is appended to a live transcript with timestamps, persisted to `localStorage`, and exportable in multiple formats.

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
│   ├── layout.tsx          # Root layout with session provider
│   ├── page.tsx            # Main transcription UI
│   ├── admin/              # Admin dashboard (charts, controls, CSV)
│   ├── auth/signin/        # Branded Microsoft sign-in page
│   ├── desktop-setup/      # Virtual-cable walk-through
│   └── api/
│       ├── auth/[...nextauth]/   # NextAuth handlers
│       ├── transcribe/           # POST: audio → Whisper → text (rate-limited)
│       ├── me/usage/             # GET: per-user quota snapshot
│       ├── admin/usage/          # GET: aggregate usage (JSON or CSV)
│       ├── admin/config/         # GET/POST: rate limits + kill switch
│       └── health/               # GET: liveness
├── components/             # TranscriptPanel, ControlBar, SettingsDrawer, UserChip, …
├── hooks/                  # useAudioCapture, useTranscription, useTranscriptStore
├── lib/                    # auth, rateLimiter, usageLogger, usageAggregates, openai, …
├── electron/               # Optional Electron wrapper
├── companion/              # Optional Python audio companion
├── docs/deployment.md      # Azure deployment guide
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Local-parity compose
└── .github/workflows/      # Deploy to Azure on push to main
```

Key files to read first:

- [`lib/auth.ts`](lib/auth.ts) — NextAuth v5 config with Microsoft Entra ID + admin allowlist
- [`lib/rateLimiter.ts`](lib/rateLimiter.ts) — sliding-window per-user caps + org-wide monthly budget
- [`lib/usageLogger.ts`](lib/usageLogger.ts) — append-only JSONL usage log
- [`app/api/transcribe/route.ts`](app/api/transcribe/route.ts) — auth → rate-limit → Whisper → log
- [`app/admin/Client.tsx`](app/admin/Client.tsx) — recharts dashboard with controls

## Settings

User-facing settings persist in `localStorage`:

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Auto-detect | ISO-639-1 hint passed to Whisper |
| Chunk Duration | 5 s | 3–15 s. Shorter = lower latency, more API calls |
| Audio Device | Default input | Required for virtual-cable mode |

The OpenAI API key is **admin-managed** — it lives in `OPENAI_API_KEY` server-side and is never exposed to the browser.

## Security & Privacy

- The OpenAI API key lives server-side in `OPENAI_API_KEY`. It never reaches the browser bundle.
- Every API route requires a valid Entra ID session. Admin routes additionally check against `ADMIN_EMAILS`.
- Audio chunks are streamed to Whisper and discarded after transcription — Dhvani doesn't persist raw audio anywhere.
- The transcript is saved **only** in the user's browser `localStorage`. There's no backend database.
- Per-chunk usage (userId, seconds, cost) is logged to an append-only JSONL file for billing/audit; no transcript text is stored server-side.
- The Service Worker explicitly does not cache `/api/*` routes.

## For Organizations

Dhvani is built to be deployed once, centrally, by an IT team — not installed per-user. A single admin-managed OpenAI key fans out to your whole org, with SSO, rate limits, and a usage dashboard baked in.

### Deployment Guide

See [**docs/deployment.md**](./docs/deployment.md) for the full walkthrough — Azure Web App for Containers, Microsoft Entra ID SSO, GitHub Actions CI/CD, custom domain + HTTPS, kill switch, and ops playbook.

The short version:

```bash
# Build and push the container
docker build -t dhvanicr.azurecr.io/dhvani:latest .
docker push dhvanicr.azurecr.io/dhvani:latest

# Or just merge to main — GitHub Actions deploys automatically.
```

### Admin Dashboard

Visit `/admin` as a user whose email is in `ADMIN_EMAILS`:

- **30-day spend** bar chart + **daily minutes by top 5 users** line chart
- **Sortable user table** with minutes, cost, sessions, last active
- **Rate-limit controls** — per-user minutes/hour, minutes/day, org-wide monthly USD budget
- **Kill switch** — flip off the whole service instantly
- **CSV export** for audit/finance

### Cost Estimate

Roughly what it costs ITU or a similar 50-person team to run Dhvani:

| Component | Monthly cost |
| --- | --- |
| Azure Web App plan (B1, Linux) | ~$15 |
| Azure Container Registry (Basic) | ~$5 |
| OpenAI Whisper @ $0.006/min | $0.36/hour of audio |
| **Light usage (100 hours/month)** | **~$56** |
| **Heavy usage (500 hours/month)** | **~$200** |

Set `RATE_LIMIT_MONTHLY_BUDGET_USD` in the admin dashboard to cap total spend — Dhvani refuses new transcriptions once the cap is hit, with a clear message to users.

### Environment Variables

See [`.env.local.example`](./.env.local.example) for the complete list. The must-haves:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Admin-managed Whisper key |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | Entra ID App Registration |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth session config |
| `ADMIN_EMAILS` | Comma-separated admin allowlist |
| `RATE_LIMIT_MINUTES_PER_HOUR` / `_PER_DAY` | Per-user caps |
| `RATE_LIMIT_MONTHLY_BUDGET_USD` | Org-wide monthly ceiling |
| `USAGE_LOG_PATH` | JSONL usage log location |

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
