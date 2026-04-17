# Dhvani (ध्वनि)

**Open-source multilingual meeting transcription with AI-powered intelligence. Built for international organisations.**

> Real-time transcription · Speaker identification · AI summaries · Carbon reporting · Zero configuration for users

![MIT License](https://img.shields.io/badge/license-MIT-1DA0DB.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-000)
![Azure OpenAI](https://img.shields.io/badge/Azure_OpenAI-GPT--4o_Transcribe-1DA0DB)

---

## What Dhvani does

Dhvani turns any live meeting into a searchable, speaker-attributed transcript with AI-generated summaries, action items, and privacy-safe organisational insights. It was built at the ITU Innovation Hub to replace commercial transcription tools (Otter, Fireflies, Read.ai) for an 800-person international organisation — audio never leaves the host's Azure tenant, users sign in with their existing Microsoft account, and there is nothing to configure.

---

## Features

### Core transcription

- Real-time speech-to-text via **Azure OpenAI GPT-4o Transcribe with diarization**
- Automatic speaker identification (who said what)
- Language hint dropdown with 10 common languages plus auto-detect (Whisper's full language coverage applies)
- Three capture modes selectable up-front on the home page:
  - **Browser Tab** — `getDisplayMedia` capture of Zoom/Teams/Meet in Chrome
  - **Microphone** — `getUserMedia`
  - **Desktop App** — virtual audio cable (BlackHole / VB-Cable) with a device picker
- MediaRecorder cycle pattern: each 3-second chunk is a complete WebM container — no header-less fragments
- Live audio waveform visualisation while recording
- Rotating recorder instances prevent Whisper decode failures on chunks 1+

### AI intelligence

- **Meeting summaries** — structured Markdown: Summary, Key Decisions, Action Items, Discussion Points, Participants, Keywords, Sentiment, Talk Time
- **Action item extraction** — assignee + due date parsed into a checklist
- **Keyword / topic detection** — cross-referenced across transcripts
- **Sentiment analysis** — Positive / Neutral / Negative / Mixed
- **Ask Dhvani** — chat across all your saved transcripts with cited answers
- **AI-generated follow-up emails** — summary + action items pre-formatted for attendees

### Calendar integration (Microsoft 365)

- Today's meetings + next 8 hours pulled from Microsoft Graph
- Meeting reminders (sticky banner) before a call starts
- One-click "Start transcription" from a meeting card auto-tags the session
- Attendee names pre-populate the speaker map (first speaker = signed-in user)

### Collaboration & export

- Secure **share links** for transcripts (read-only, token-gated)
- Pin key moments (star icon) — jumps-to-timestamp index at the top
- Inline speaker rename — renames propagate across the transcript
- Export: Copy, `.txt`, `.srt`, `.json`, `.pdf` (via `/api/export/pdf`)
- Full-text search inside a transcript and across all saved transcripts

### Audio upload

- Drag-and-drop audio file upload for async transcription of pre-recorded meetings
- Same Whisper pipeline as live capture

### Admin dashboard

Four tabs at `/admin`:

1. **Usage Overview** — cost cards, 30-day spend bar chart, stacked daily minutes per user (top 5 + others), sortable user table, rate-limit editor, CSV export, emergency kill-switch
2. **Team Analytics** — meeting counts, platform breakdown, duration buckets, meetings by weekday/hour/month
3. **Green ICT** (new) — see below
4. **Org Intelligence** (new) — see below

### Green ICT carbon reporting

Aligned with **IPSASB SRS 1** (effective Jan 2026), **GHG Protocol** Scopes 1/2/3, and **IFRS S2**.

- Scope 2 emissions (purchased electricity for AI inference) — per-call energy × Azure PUE × grid carbon intensity for the deployment region
- Scope 3 (embodied) — 30% multiplier per Luccioni et al. (2024) *Power Hungry Processing*
- Grid intensity table: Sweden Central (8 gCO₂/kWh), West Europe (300), East US (380), West US (230) + default
- Friendly equivalences: Google searches, emails sent, video-call minutes, car/flight km, tree-days to offset
- 6-month trend, activity share (transcription vs summary vs Ask AI vs follow-up), expandable IPSASB disclosure notes
- Markdown export of the emissions report in IPSASB SRS 1 disclosure format (Governance / Strategy / Risk / Metrics & Targets)
- Per-user footprint card in settings

### Organisational intelligence (privacy-safe)

- **K-anonymity** enforced at the boundary: minimum 5 users and 10 meetings per department; below-threshold groups collapse into "Other Departments"
- **No raw text** ever reaches the intelligence layer — only `{ department, dayIso, durationMinutes, topicKeywords[], sentiment, actionItemCount, speakerCount, languageUsed }`
- **Opt-in** by default OFF; the client sends an `x-contribute-insights` header only when the user has explicitly enabled it in settings
- Dashboard surfaces: topic cloud, topic × department alignment matrix, per-department meeting culture, language distribution, 12-week trend, threshold-driven insights
- Department claim pulled from the Microsoft Entra JWT when available

### Security & privacy

- All data stays inside your Azure tenant (the web app, the AI calls, the storage)
- **Microsoft Entra ID (Azure AD) SSO** via NextAuth.js v5
- **No API keys on user devices.** Every Azure OpenAI call runs in server-side `app/api/` handlers. Verified: `grep -r AZURE_OPENAI components/ hooks/` → zero matches.
- Chrome extension re-authenticates against the same JWT (`x-auth-token` header re-verified with `NEXTAUTH_SECRET`)
- Per-user hourly/daily minute caps and org-wide monthly budget cap
- Admin kill-switch (`SERVICE_ENABLED=false` returns 503 app-wide)

### Platforms

| Platform | How it works | Install |
|---|---|---|
| Web app | Open URL in any browser | None |
| Mobile (PWA) | Manifest + service worker | "Add to Home Screen" |
| Mac desktop (Electron) | Thin BrowserWindow → central server | DMG, ~90 MB |
| Windows desktop (Electron) | Thin BrowserWindow → central server | NSIS installer |
| Chrome extension | Manifest V3 side panel | Packaged from `extension/` |
| Demo DMG (offline) | Bundles Next standalone server | `npm run electron:build:demo` |

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│  User browser / app  │ ──SSO── │  Microsoft Entra ID  │
└──────────┬───────────┘         └──────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────┐
│  dhvani.itu.int (Azure Web App, Next.js 14)    │
│  - app/api/transcribe      → Azure OpenAI      │
│  - app/api/summarize       → Azure OpenAI      │
│  - app/api/ask, /followup  → Azure OpenAI      │
│  - app/api/calendar/*      → Microsoft Graph   │
│  - app/api/transcripts/*   → filesystem JSONL  │
└──────────────────────────────────────────────┬─┘
                                               │
           ┌───────────────────────────────────┤
           ▼                                   ▼
┌──────────────────────┐         ┌──────────────────────┐
│ Azure OpenAI (SWC)   │         │ Azure OpenAI (EUW)   │
│ gpt-4o-transcribe-   │         │ gpt-4.1-mini (chat)  │
│ diarize              │         │                      │
└──────────────────────┘         └──────────────────────┘
```

The provider layer (`lib/providers/`) abstracts AI calls so swapping Azure OpenAI for Gemini, Anthropic, or local Whisper is one new file plus one env var. See `docs/ARCHITECTURE.md`.

---

## Quick start (development)

```bash
git clone https://github.com/techpolicycomms/Dhvani.git
cd Dhvani
npm install
cp .env.local.example .env.local
# Edit .env.local with your Azure OpenAI key + endpoint
npm run dev
# http://localhost:3000
```

For a no-auth demo experience set `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local` — mock calendar, mock user, open admin dashboard.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AZURE_OPENAI_API_KEY` | ✓ | Data-plane key for the transcription resource |
| `AZURE_OPENAI_ENDPOINT` | ✓ | Base URL only (e.g. `https://x.openai.azure.com/`) — **not** the full `/openai/deployments/.../audio/transcriptions?api-version=...` path |
| `AZURE_OPENAI_WHISPER_DEPLOYMENT` | | Transcription deployment name (default `gpt-4o-transcribe-diarize`) |
| `AZURE_OPENAI_API_VERSION` | | Default `2024-06-01` |
| `AZURE_OPENAI_CHAT_API_KEY` | | Chat key — falls back to `AZURE_OPENAI_API_KEY` if chat lives on the same resource |
| `AZURE_OPENAI_CHAT_ENDPOINT` | | Chat base URL — falls back to `AZURE_OPENAI_ENDPOINT` |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | | Chat deployment name (default `gpt-4o`) |
| `AZURE_OPENAI_CHAT_API_VERSION` | | Default `2024-06-01` |
| `AZURE_AD_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | prod | Entra App Registration for SSO |
| `NEXTAUTH_SECRET` | prod | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | prod | Public origin (e.g. `https://dhvani.itu.int`) |
| `ADMIN_EMAILS` | | Comma-separated allow-list for `/admin` |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | | `true` bypasses SSO and serves mock calendar |
| `DHVANI_SERVER_URL` | | Electron build target server (default `https://dhvani.itu.int`) |
| `RATE_LIMIT_MINUTES_PER_HOUR` | | Per-user hourly cap (default 60) |
| `RATE_LIMIT_MINUTES_PER_DAY` | | Per-user daily cap (default 240) |
| `RATE_LIMIT_MONTHLY_BUDGET_USD` | | Org monthly budget (default 500) |
| `SERVICE_ENABLED` | | `false` hard-disables all transcription (returns 503) |
| `AI_PROVIDER` | | `azure-openai` (default) — future: `google-gemini`, `anthropic`, `local-whisper` |
| `FEATURE_SUMMARY` / `_ASK_AI` / `_CALENDAR` / `_UPLOAD` / `_SHARING` | | Per-feature toggles; `false` disables |
| `NOTIFICATION_WEBHOOK_URL` | | Generic event webhook (Teams/Slack/Zapier) |

Full deployment walkthrough: [`docs/DEPLOY.md`](./docs/DEPLOY.md).

---

## Deployment

### For users — zero configuration

Open `dhvani.itu.int` and sign in with your Microsoft account. Install the desktop app from `/download` if you want a dedicated window — it just points at the central server.

### For admins — one-time setup

Everything lives in one place: **Azure Portal → app-dhvani → Configuration → Application Settings**. Paste the env vars from the table above. Users never see any of it. See [`docs/DEPLOY.md`](./docs/DEPLOY.md).

### Desktop app distribution

```bash
npm run electron:build:mac    # DMG, connects to central server, ~90 MB
npm run electron:build:win    # NSIS installer
npm run electron:build:demo   # Offline DMG with bundled standalone server, ~170 MB
```

The normal DMG/EXE is a thin BrowserWindow — no local server, no bundled keys. The demo build bakes credentials from the *builder's* shell at build time for conference demos without internet; don't distribute it publicly.

---

## Tech stack

| Component | Technology |
|---|---|
| Frontend | Next.js 14.2.5, React 18, TypeScript 5.4, Tailwind CSS 3.4 |
| Charts | recharts 2.15 (admin dashboards) + lightweight CSS bars elsewhere |
| AI (transcription) | Azure OpenAI `gpt-4o-transcribe-diarize` |
| AI (chat) | Azure OpenAI `gpt-4.1-mini` (or any GPT-4o family chat deployment) |
| Auth | Microsoft Entra ID via NextAuth.js v5 (`next-auth@^5.0.0-beta.20`) |
| Calendar | Microsoft Graph `/me/calendarView` |
| Desktop | Electron 30 + electron-builder 24 |
| Extension | Chrome Manifest V3 (side panel) |
| Icons | lucide-react |
| Font | Noto Sans (self-hosted via `next/font`) |

---

## Cost

For a ~30-hour-per-month transcription load:

| Component | Approx monthly |
|---|---|
| Azure Web App (B1) | ~$13 |
| Azure OpenAI inference (30 h) | ~$11 |
| **Total** | **~$24 / month** |

Versus commercial tools for 800 users (list price):

| Tool | Annual per-user | Annual total |
|---|---|---|
| Fireflies.ai Business | $19 × 12 | ~$182,400 |
| Otter.ai Business | $20 × 12 | ~$192,000 |
| **Dhvani** | effectively free | **~$288** |

---

## Project structure

```
app/
├─ admin/                  Admin dashboard (Usage / Analytics / Green ICT / Org Intelligence tabs)
├─ api/
│  ├─ admin/               { config, usage, analytics, emissions, org-intelligence }
│  ├─ ask/                 Cross-transcript AI Q&A
│  ├─ auth/[...nextauth]/  NextAuth handlers
│  ├─ calendar/            { today, upcoming } via Microsoft Graph
│  ├─ export/pdf/          Server-rendered transcript PDF
│  ├─ followup/            Follow-up email generation
│  ├─ health/              Public liveness probe
│  ├─ me/                  { usage, emissions } — per-user cards
│  ├─ search/              Full-text transcript search
│  ├─ summarize/           Meeting summary + action items
│  ├─ transcribe/          Live audio → diarized text
│  ├─ transcripts/         List / get / share CRUD
│  └─ vocabulary/          Custom term list per user
├─ auth/signin/            SSO sign-in page
├─ desktop-setup/          Mac/Windows virtual-cable guide
├─ download/               Platform download grid
├─ shared/[token]/         Public read-only transcript view
├─ transcripts/            Saved transcript history
├─ upload/                 Audio file upload for async transcription
└─ page.tsx                Home: audio mode cards, calendar, control bar, transcript

components/                 31 React components (ControlBar, TranscriptPanel,
                            MeetingSummary, AskDhvani, AudioWaveform, …)

hooks/                      useAudioCapture, useTranscription, useTranscriptStore,
                            useMeetingReminders, useCalendarPrefs, useAudioDevices

lib/
├─ providers/               AI provider adapter (azure-openai today;
│                           Gemini/Anthropic/local-Whisper scoped)
├─ auth.ts                  Session + Graph access-token refresh
├─ calendar.ts              Graph event → Meeting normalisation
├─ greenIct.ts              Emissions engine (IPSASB SRS 1)
├─ orgIntelligence.ts       K-anonymity + aggregation
├─ rateLimiter.ts           Per-user + org budget caps
├─ transcriptStorage.ts     Filesystem-backed transcript CRUD
├─ usageLogger.ts           JSONL usage log
├─ usageAggregates.ts       Admin dashboard aggregation
├─ vocabulary.ts            Custom term list
├─ config.ts                Centralised provider + feature flags
└─ events.ts                In-process event bus + webhook listener

electron/                   Main process (central-server mode + demo-build mode)
extension/                  Chrome Manifest V3 side panel
companion/                  Optional Python CLI companion
docs/                       ARCHITECTURE.md, DEPLOY.md, deployment.md
```

---

## API routes

All routes live under `app/api/` and run on the Node.js runtime. Auth is enforced by `middleware.ts` (or self-enforced inside the route for the extension / public endpoints).

| Route | Method | Purpose |
|---|---|---|
| `/api/transcribe` | POST | Multipart audio chunk → diarized text |
| `/api/summarize` | POST | Transcript entries → structured Markdown summary |
| `/api/ask` | POST | RAG-style chat across one or all transcripts |
| `/api/followup` | POST | Summary → follow-up email |
| `/api/health` | GET | Public liveness + Azure OpenAI reachability probe |
| `/api/transcripts` | GET / POST | List user transcripts / save a new one |
| `/api/transcripts/[id]` | GET / DELETE | Single transcript |
| `/api/transcripts/[id]/share` | POST | Mint a share token |
| `/api/search` | GET | Full-text search |
| `/api/vocabulary` | GET / POST | Per-user term list (shapes transcription) |
| `/api/calendar/today` | GET | Today's online meetings |
| `/api/calendar/upcoming` | GET | Next N hours of meetings |
| `/api/export/pdf` | POST | Render transcript → PDF |
| `/api/me/usage` | GET | Personal usage + remaining quota |
| `/api/me/emissions` | GET | Personal 30-day carbon footprint |
| `/api/admin/usage` | GET | Aggregated usage (also CSV via `?format=csv`) |
| `/api/admin/analytics` | GET | Meeting analytics |
| `/api/admin/config` | GET / POST | Read/update rate limits + service kill-switch |
| `/api/admin/emissions` | GET | IPSASB-aligned emissions report |
| `/api/admin/org-intelligence` | GET / POST | K-anonymity insights / ingest anonymised record |
| `/api/auth/[...nextauth]` | — | NextAuth handlers |

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](./LICENSE).

## Credits

Built by the **ITU Innovation Hub** as an open-source Digital Public Good.
github.com/techpolicycomms/Dhvani
