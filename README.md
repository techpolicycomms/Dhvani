# Dhvani (ध्वनि)

**Open-source multilingual meeting transcription for everyone.**

Dhvani captures audio from Zoom, Teams, or Google Meet and transcribes it in real-time using **Azure OpenAI GPT-4o Transcribe** with built-in **speaker diarization**. Works on any device — PC, Mac, or phone — through your browser. Audio stays inside the org's Azure tenant.

Named from the Sanskrit word for "sound" (ध्वनि), Dhvani is built to make meeting transcription accessible, open, and free.

![MIT License](https://img.shields.io/badge/license-MIT-1DA0DB.svg) ![Next.js](https://img.shields.io/badge/Next.js-14-000) ![Azure OpenAI](https://img.shields.io/badge/Azure_OpenAI-GPT--4o_Transcribe-1DA0DB)

> Developed by the **ITU Innovation Hub**.

## Features

- 🎤 **Real-time transcription with speaker identification** — Dhvani automatically detects who said what, no manual tagging required
- 🌐 **Works in any browser** (no install needed) or as a native desktop app via Electron
- 🗣️ **50+ languages** supported via GPT-4o Transcribe, with auto-detection and lower word-error rate than Whisper
- 🎨 **Color-coded speakers** with click-to-rename — "Speaker 1" becomes "Karim" in one click
- 💾 **Export to `.txt`, `.srt`, `.json`** with speaker labels, or copy to clipboard
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
# Fill in AZURE_OPENAI_*, AZURE_AD_*, NEXTAUTH_SECRET, ADMIN_EMAILS
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or Firefox. Sign in with your Microsoft work account and press **Start**.

> Deploying this for your whole team? Skip ahead to [**For Organizations**](#for-organizations).

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

1. Users sign in via **Microsoft Entra ID SSO**. A middleware gates every route behind a valid session.
2. Dhvani records audio in **configurable chunks** (3–15 seconds, default 10) using the browser's `MediaRecorder` API. Longer chunks give the diarizer more context for speaker tracking.
3. Each chunk is POSTed to `/api/transcribe`, which checks rate limits and the org-wide monthly budget, then calls the org's **Azure OpenAI `gpt-4o-transcribe-diarize`** deployment with `response_format: verbose_json`. No traffic leaves the Azure tenant.
4. The model returns segments annotated with `speaker_0`, `speaker_1`, … Dhvani groups consecutive same-speaker segments into transcript entries, assigning each a stable color and a friendly label ("Speaker 1", "Speaker 2", …) that the user can rename in one click.
5. Usage is logged (per-chunk seconds + cost, keyed by Entra `oid`) to an append-only JSONL log, powering the admin dashboard.
6. Transcribed text is appended to a live transcript with timestamps + speaker labels, persisted to `localStorage`, and exportable in `.txt` / `.srt` / `.json` (all speaker-aware).

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
- [`app/api/transcribe/route.ts`](app/api/transcribe/route.ts) — auth → rate-limit → Azure OpenAI gpt-4o-transcribe-diarize → log
- [`lib/openai.ts`](lib/openai.ts) — Azure OpenAI client factory + deployment name helper
- [`app/admin/Client.tsx`](app/admin/Client.tsx) — recharts dashboard with controls

## Settings

User-facing settings persist in `localStorage`:

| Setting | Default | Notes |
| --- | --- | --- |
| Language | Auto-detect | ISO-639-1 hint passed to GPT-4o Transcribe |
| Chunk Duration | 10 s | 3–15 s. Shorter = lower latency. Longer = better speaker tracking. |
| Audio Device | Default input | Required for virtual-cable mode |

The Azure OpenAI key is **admin-managed** — it lives in `AZURE_OPENAI_API_KEY` server-side and is never exposed to the browser.

## Security & Privacy

- The Azure OpenAI key lives server-side in `AZURE_OPENAI_API_KEY`. It never reaches the browser bundle.
- Transcription requests go to your org's Azure OpenAI resource (`AZURE_OPENAI_ENDPOINT`) — no traffic leaves the Azure tenant, no calls to `api.openai.com`.
- Every API route requires a valid Entra ID session. Admin routes additionally check against `ADMIN_EMAILS`.
- Audio chunks are streamed to Whisper and discarded after transcription — Dhvani doesn't persist raw audio anywhere.
- The transcript is saved **only** in the user's browser `localStorage`. There's no backend database.
- Per-chunk usage (userId, seconds, cost) is logged to an append-only JSONL file for billing/audit; no transcript text is stored server-side.
- The Service Worker explicitly does not cache `/api/*` routes.

## For Organizations

Dhvani is built to be deployed once, centrally, by an IT team — not installed per-user. It runs entirely inside your Azure tenant: SSO via Entra ID, transcription via your Azure OpenAI resource, with rate limits and a usage dashboard baked in.

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
| Azure OpenAI transcribe @ ~$0.006/min | $0.36/hour of audio |
| **Light usage (100 hours/month)** | **~$56** |
| **Heavy usage (500 hours/month)** | **~$200** |

Pricing for `gpt-4o-transcribe-diarize` may differ from the legacy Whisper rate — confirm against your Azure Cost Management view. Dhvani estimates at the Whisper rate until then.

Set `RATE_LIMIT_MONTHLY_BUDGET_USD` in the admin dashboard to cap total spend — Dhvani refuses new transcriptions once the cap is hit, with a clear message to users.

### Environment Variables

See [`.env.local.example`](./.env.local.example) for the complete list. The must-haves:

| Variable | Purpose |
| --- | --- |
| `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_WHISPER_DEPLOYMENT` | Azure OpenAI resource + transcription deployment (default `gpt-4o-transcribe-diarize`) |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | Entra ID App Registration |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth session config |
| `ADMIN_EMAILS` | Comma-separated admin allowlist |
| `RATE_LIMIT_MINUTES_PER_HOUR` / `_PER_DAY` | Per-user caps |
| `RATE_LIMIT_MONTHLY_BUDGET_USD` | Org-wide monthly ceiling |
| `USAGE_LOG_PATH` | JSONL usage log location |

## Limitations

- Each chunk must be ≤ 25 MB (not a practical limit at 10 s chunks).
- Tab audio requires users to check "Share audio" when picking the tab — there's no way around this browser prompt.
- iOS Safari doesn't support `getDisplayMedia`. Use microphone mode on iPhone/iPad.
- Diarizer speaker ids are scoped to a single audio request — "speaker_0" in one chunk is not guaranteed to be the same voice as "speaker_0" in the next. Dhvani biases the default chunk size upward (10 s) to amortise this, and lets users rename speakers after the fact; perfect cross-chunk stitching would require a persistent speaker embedding.
- Transcription quality is best-effort on noisy audio and heavily overlapping speech.

## Contributing

We welcome PRs! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, code style, and areas we'd love help with (i18n, tests, macOS audio via CoreAudio, cross-chunk speaker stitching…).

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- **OpenAI Whisper** — the open-weights speech-to-text model that makes this possible
- **BlackHole** (existential.audio) and **VB-Audio CABLE** — free virtual audio drivers
- The **Next.js**, **React**, and **Tailwind CSS** teams

---

Built with ☕ by people who took too many meeting notes.
