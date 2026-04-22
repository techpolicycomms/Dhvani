# Dhvani (ध्वनि)

**Open-source meeting transcription with AI intelligence, carbon accountability, and role-aware personalization. Built for international organisations.**

> Real-time transcription · Speaker identification · Role-aware AI summaries · Auto-extracted task checklist · Gamified Mission Control · Carbon + org intelligence dashboards · Zero configuration for users

![MIT License](https://img.shields.io/badge/license-MIT-1DA0DB.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-000)
![Azure OpenAI](https://img.shields.io/badge/Azure_OpenAI-GPT--4o_Transcribe-1DA0DB)

---

## What Dhvani does

Dhvani turns any meeting into a searchable, speaker-attributed transcript with **role-aware AI summaries**, **auto-extracted action items** that land on a personal checklist, a **gamified Mission Control** dashboard, and a **meeting-wellness monitor** that flags unsustainable workloads — all without data leaving the host's Azure tenant.

Built at the ITU Innovation Hub as an internal tool for ~800 staff across three Sectors and the General Secretariat.

---

## Feature tour

### Core transcription
- Real-time speech-to-text via **Azure OpenAI `gpt-4o-transcribe-diarize`** (speaker diarization included).
- Three capture modes selectable up-front: **Browser Tab** (`getDisplayMedia`), **Microphone** (`getUserMedia`), **Desktop App** (virtual audio cable with a device picker).
- MediaRecorder rotation pattern — each 3 s chunk is a complete WebM file, so Whisper never sees header-less fragments.
- Live audio waveform while recording (Web Audio `AnalyserNode`).
- **Recording survives navigation** — state is hoisted into a `TranscriptionContext` mounted at the root layout. Start on `/`, switch to `/transcripts`, the red "Recording · 02:31" pill floats in the top-right and capture keeps running.
- **New Session** button auto-saves the current transcript to history, then clears for the next meeting.

### Language coverage
10 first-class languages via the settings dropdown (English, French, Spanish, Arabic, Chinese, Russian, Hindi, Portuguese, German, Japanese) + auto-detect with Whisper's full coverage. Each role profile ships with its own default language set.

### AI intelligence (role-aware)
Every signed-in user picks a **role profile** during onboarding. The profile tunes summaries, follow-up emails, and suggested vocabulary.

- **12 built-in ITU role profiles** (`lib/roleProfiles.ts`):
  - **ITU-R**: Spectrum Engineer · Satellite Systems Engineer
  - **ITU-T**: Standardization Expert
  - **ITU-D**: Programme Officer · Regional Programme Officer · Cybersecurity Officer
  - **General Secretariat**: Policy Analyst · Finance · HR · IT / Innovation · Events · Legal
  - **Cross-cutting**: Communications · General / Other
  - Each profile carries vocabulary, summary template, action-item format, follow-up tone, quick-phrase filters, meeting-type hints, and working languages.
- **`/api/summarize`** pulls the user's profile from storage, prepends their summary template + domain vocabulary + action-item format to the LLM system prompt. A Spectrum Engineer sees "REGULATORY DECISIONS"; a Programme Officer sees "PROJECT STATUS"; a Finance Officer sees "BUDGET STATUS" — same meeting, different lens.
- **`/api/followup`** injects the profile's tone guidance (diplomatic for Policy, operational for Events, etc.) into the email draft.
- **Ask Dhvani** — chat across all saved transcripts with cited answers.

### Auto-extracted task checklist
- Every summary emits a `---TASKS---` block with `{ task, assignee, deadline, priority, timestamp }` — parsed by `lib/taskManager.ts` and persisted to `data/transcripts/_tasks/<userId>.jsonl`.
- `/tasks` page renders a tick-to-complete checklist with priority colors, deadlines, assignees, and source-meeting badges.
- Compact checklist (top 5 open tasks) embedded on the home page.
- Natural-language deadlines are resolved: "next week" → Monday, "ASAP" → today, "end of month" → last day, "follow up" → +7 days.
- Manual tasks can be added inline.

### Mission Control (gamification)
- `/mission` — space + ICT themed dashboard: rank hero, XP progress, 4 stat cards (Satellites Deployed · Frequencies Coordinated · Mission Time · Debrief Rate), 16 badges with earned/locked states, wellness indicator.
- 9 ranks from **Ground Station Intern** to **ITU Legend**; XP from meetings + completed tasks + summaries + streak days + minutes.
- Stats computed on-demand from the existing usage log + task log + emissions helper — no separate persistence layer to maintain.

### Meeting wellness monitor
- 15 / 20 / 25 hour bands map to healthy / caution / warning / critical.
- Signal-strength gauge on the home dashboard and on Mission Control with orbit-themed messaging ("🟢 Stable LEO" → "🔴 Re-entry imminent").
- Recommendation engine suggests blocking focus time when weekly load trends high.

### Calendar integration (Microsoft 365)
- Today's meetings + next 8 hours pulled from Microsoft Graph `/me/calendarView` with refresh-token rotation.
- Meeting reminders (sticky banner) before a call starts.
- One-click "Start transcription" from a meeting card auto-tags the session.
- Attendee names pre-populate the speaker map (first speaker = signed-in user).

### URL transcription
- `/url-transcribe` — paste a direct `.mp3` / `.mp4` / `.wav` / `.webm` URL, get a speaker-segmented transcript. SSRF-guarded: https only, blocks localhost, RFC1918, link-local, and Azure/AWS metadata IPs. 25 MB cap.
- YouTube / Google Drive / Vimeo return 501 with a clear message — they need extractor libraries scoped in a future release.

### Collaboration & export
- Secure **share links** for transcripts (read-only, token-gated).
- Pin key moments; speaker rename propagates across the transcript.
- Export: Copy, `.txt`, `.srt`, `.json`, `.pdf` (via `/api/export/pdf`).
- Full-text search inside a transcript and across all saved transcripts.

### Audio upload
- Drag-and-drop async transcription of pre-recorded meetings via `/upload`.

### Admin dashboard (4 tabs at `/admin`)
1. **Usage Overview** — cost cards, 30-day spend, stacked daily minutes, sortable user table, rate-limit editor, CSV export, emergency kill-switch.
2. **Team Analytics** — meeting counts, platform breakdown, duration buckets, meetings by weekday/hour/month.
3. **Green ICT** — IPSASB SRS 1-aligned emissions report.
4. **Org Intelligence** — k-anonymity privacy insights across departments.

### Green ICT carbon reporting
Aligned with **IPSASB SRS 1** (Jan 2026), **GHG Protocol** Scopes 1/2/3, and **IFRS S2**.

- Scope 2 = per-call energy × Azure PUE × grid carbon intensity for the deployment region.
- Scope 3 (embodied) = 30% multiplier per Luccioni et al. (2024) *Power Hungry Processing*.
- Grid intensity table: Sweden Central (8 gCO₂/kWh), West Europe (300), East US (380), West US (230) + default.
- Friendly equivalences (Google searches · emails · video-call minutes · car/flight km · tree-days).
- 6-month trend, per-activity share, IPSASB disclosure notes, Markdown report export.
- Per-user 30-day footprint card in Settings.

### Organisational intelligence (privacy-safe)
- **K-anonymity** enforced at the boundary: min 5 contributor-day pairs and 10 meetings per department; below-threshold groups fold into "Other Departments".
- **No raw text, speaker names, or emails** reach the aggregator — only: department, rounded UTC day, duration, ≤5 topic keywords, sentiment, action-item count, speaker count, language.
- **Opt-in by default OFF**. The client sends `x-contribute-insights: true` only when the user explicitly enabled the toggle in Settings.
- Dashboard surfaces topic cloud, topic × department alignment matrix, per-department meeting culture, language distribution, 12-week trend, threshold-driven insights.

### Security posture (see `docs/SECURITY.md`)
- **Microsoft Entra ID SSO** via NextAuth v5 · JWT with 24 h maxAge · explicit same-origin redirect callback.
- Every API route auth-gated via `getActiveUser` / `resolveRequestUser`; admin surface behind `ADMIN_EMAILS`.
- Per-user transcription + chat rate limiting (429 with `Retry-After`).
- Full security headers: HSTS, CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy.
- Path-traversal defence-in-depth across every file operation (`lib/security.ts`).
- No client-side API keys — verified: `grep -r AZURE_OPENAI components/ hooks/` empty.

### Platforms

| Platform | How it works | Install |
|---|---|---|
| Web app | Open URL in any browser | None |
| Mobile (PWA) | Manifest + service worker | "Add to Home Screen" |
| Mac desktop (Electron) | Thin window → central server | DMG, ~90 MB |
| Windows desktop | Thin window → central server | NSIS installer |
| Chrome extension | Manifest V3 side panel | Packaged from `extension/` |

---

## Quick start

```bash
git clone https://github.com/techpolicycomms/Dhvani.git
cd Dhvani
npm install
cp .env.local.example .env.local
# Fill in the Azure OpenAI + Entra credentials — see docs/ENTRA_SETUP.md
npm run dev
# http://localhost:3000
```

The first load triggers the onboarding wizard (pick a role → languages + priorities → go).

---

## Architecture

```
┌─────────────────────┐        ┌────────────────────────┐
│ Browser / Electron  │ ───SSO──│ Microsoft Entra ID     │
└────────────┬────────┘        └────────────────────────┘
             │
             ▼
┌───────────────────────────────────────────────────────┐
│ dhvani.itu.int (Azure Web App, Next.js 14)            │
│                                                       │
│ Context layer (root layout, persists across routes):  │
│   - UserProfileProvider  → role, onboarding, prefs    │
│   - TranscriptionProvider → capture + pipeline state  │
│                                                       │
│ API routes:                                           │
│   /api/transcribe        → Azure OpenAI Transcribe    │
│   /api/summarize         → Azure OpenAI Chat + tasks  │
│   /api/ask /followup     → Azure OpenAI Chat          │
│   /api/tasks             → task CRUD (JSONL)          │
│   /api/user/profile      → role + prefs (JSON)        │
│   /api/user/stats        → Mission Control rollup     │
│   /api/user/wellness     → wellness signal            │
│   /api/me/usage          → personal quota             │
│   /api/me/emissions      → personal carbon            │
│   /api/admin/*           → dashboards (admin-gated)   │
│   /api/calendar/*        → Microsoft Graph            │
│   /api/transcripts/*     → CRUD + share               │
│   /api/url-transcribe    → remote URL → text          │
│   /api/export/pdf        → PDF renderer               │
│   /api/search /health /vocabulary                     │
│   /api/ads/track         → (reserved for Vāchā fork)  │
└────────┬──────────────────────────────────────────┬───┘
         │                                          │
         ▼                                          ▼
┌──────────────────────┐          ┌──────────────────────┐
│ Azure OpenAI (SWC)   │          │ Azure OpenAI (EUW)   │
│ gpt-4o-transcribe-   │          │ gpt-4.1-mini (chat)  │
│ diarize              │          │                      │
└──────────────────────┘          └──────────────────────┘
```

The provider layer (`lib/providers/`) abstracts AI calls so swapping Azure for Gemini, Anthropic, or local Whisper is one new file + one env var. See `docs/ARCHITECTURE.md`.

---

## Project structure

```
app/
├─ admin/                  Admin dashboard (4 tabs)
├─ api/                    26 route handlers — see /api section below
├─ auth/signin/            Entra SSO sign-in
├─ desktop-setup/          Mac/Windows virtual-cable guide
├─ download/               Platform install grid
├─ mission/                Mission Control dashboard
├─ shared/[token]/         Public read-only transcript
├─ tasks/                  Auto + manual task checklist
├─ transcripts/            Saved transcript history
├─ upload/                 Audio file upload
├─ url-transcribe/         Remote URL → transcript
└─ page.tsx                Home (role greeting → tasks + wellness → audio mode → meetings → transcript)

components/                ~35 React components
contexts/
├─ TranscriptionContext.tsx  Recording state that persists across navigation
└─ UserProfileContext.tsx    Role + onboarding gate
hooks/
├─ useAudioCapture.ts      MediaRecorder + rotation cycle
├─ useTranscription.ts     Chunk queue + retries + error fan-out
├─ useTranscriptStore.ts   Transcript + speaker map + localStorage
├─ useMeetingReminders.ts  Calendar-driven sticky banner
├─ useCalendarPrefs.ts     Meeting-panel toggles
└─ useAudioDevices.ts      Media-device enumeration
lib/
├─ providers/              AI provider adapter (azure-openai)
├─ auth.ts                 Session + Graph access-token refresh
├─ calendar.ts             Graph event → Meeting normalisation
├─ config.ts               Centralised provider + feature flags
├─ constants.ts            Chunk duration · languages · transcript types
├─ events.ts               In-process event bus + webhook listener
├─ exportUtils.ts          Copy / .txt / .srt / .json
├─ gamification.ts         Ranks · badges · XP · Mission stats
├─ greenIct.ts             IPSASB SRS 1 emissions engine + user rollup
├─ meetingWellness.ts      Weekly load → signal strength
├─ openai.ts               Azure OpenAI client factories
├─ orgIntelligence.ts      K-anonymity anonymisation + aggregation
├─ rateLimiter.ts          Per-user minute + chat-request caps
├─ roleProfiles.ts         12 ITU role definitions
├─ security.ts             sanitizePathSegment · ensureWithinDir · logSecurityEvent
├─ shareStorage.ts         Read-only transcript share tokens
├─ taskManager.ts          Task CRUD + LLM ---TASKS--- parser + deadline inference
├─ theme.ts                ITU color tokens (used by charts)
├─ transcriptStorage.ts    Per-user saved transcripts
├─ urlFetch.ts             SSRF-safe remote media fetch
├─ usageAggregates.ts      Admin dashboard rollup
├─ usageLogger.ts          JSONL transcription usage log
└─ userProfileStorage.ts   Per-user role profile
docs/
├─ ARCHITECTURE.md         Provider pattern, context layer, env vars
├─ SECURITY.md             Audit log + reporting policy
├─ ENTRA_SETUP.md          App-registration checklist for SSO mode
└─ deployment.md           Legacy deployment notes
electron/                  Main process — thin window pointing at the central server
extension/                 Chrome Manifest V3 side panel
companion/                 Optional Python CLI companion
```

---

## API routes

All routes live under `app/api/` and run on the Node.js runtime. Auth is enforced by `middleware.ts` (which short-circuits when `AZURE_AD_CLIENT_SECRET` is absent in local dev) or self-enforced inside the route for extension / public endpoints.

| Route | Method | Purpose |
|---|---|---|
| `/api/transcribe` | POST | Multipart audio chunk → diarized text |
| `/api/summarize` | POST | Transcript entries → role-aware summary + auto-extracted tasks |
| `/api/ask` | POST | RAG-style chat across one or all transcripts |
| `/api/followup` | POST | Summary → role-aware follow-up email |
| `/api/health` | GET | Public liveness + Azure OpenAI probe |
| `/api/transcripts` | GET / POST | List / save |
| `/api/transcripts/[id]` | GET / DELETE | Single transcript |
| `/api/transcripts/[id]/share` | POST | Mint a share token |
| `/api/search` | GET | Full-text search |
| `/api/vocabulary` | GET / POST / DELETE | Per-user term list |
| `/api/calendar/today` | GET | Today's online meetings |
| `/api/calendar/upcoming` | GET | Next N hours of meetings |
| `/api/url-transcribe` | POST | Remote `https://` media URL → transcript |
| `/api/tasks` | GET / POST / DELETE | Auto + manual tasks (status / date / upcoming / search filters) |
| `/api/user/profile` | GET / POST | Role profile + language + priorities |
| `/api/user/stats` | GET | Mission Control rollup |
| `/api/user/wellness` | GET | Weekly signal strength |
| `/api/me/usage` | GET | Personal quota snapshot |
| `/api/me/emissions` | GET | Personal 30-day carbon |
| `/api/export/pdf` | POST | Transcript → PDF |
| `/api/admin/usage` | GET | Aggregated usage (CSV via `?format=csv`) |
| `/api/admin/analytics` | GET | Meeting analytics |
| `/api/admin/config` | GET / POST | Rate limits + service kill-switch |
| `/api/admin/emissions` | GET | IPSASB-aligned emissions report |
| `/api/admin/org-intelligence` | GET / POST | K-anonymity insights + anonymised record ingest |
| `/api/auth/[...nextauth]` | — | NextAuth handlers |

---

## Environment variables

See `.env.local.example` for the full surface. Required for a production deploy:

- `AZURE_OPENAI_API_KEY` / `_ENDPOINT` / `_WHISPER_DEPLOYMENT` — transcription (endpoint must be **base URL only**, not the full `/openai/deployments/.../audio/transcriptions?api-version=...` path).
- `AZURE_OPENAI_CHAT_API_KEY` / `_CHAT_ENDPOINT` / `_CHAT_DEPLOYMENT` — chat (falls back to the transcription resource if unset).
- `AZURE_AD_CLIENT_ID` / `_SECRET` / `_TENANT_ID` — Entra SSO.
- `NEXTAUTH_SECRET` + `NEXTAUTH_URL`.
- `ADMIN_EMAILS` — comma-separated allow-list for `/admin`.

Feature flags default on; set to `false` to disable:
`FEATURE_SUMMARY · FEATURE_ASK_AI · FEATURE_CALENDAR · FEATURE_UPLOAD · FEATURE_SHARING`.

Full deployment: `docs/DEPLOY.md`. SSO setup: `docs/ENTRA_SETUP.md`.

---

## Tech stack

| Component | Technology |
|---|---|
| Frontend | Next.js 14.2.35, React 18, TypeScript 5, Tailwind CSS 3 |
| Charts | recharts 2.15 (admin) + lightweight CSS bars elsewhere |
| AI (transcription) | Azure OpenAI `gpt-4o-transcribe-diarize` |
| AI (chat) | Azure OpenAI `gpt-4.1-mini` (or any GPT-4o family chat deployment) |
| Auth | Microsoft Entra ID via NextAuth.js v5 |
| Calendar | Microsoft Graph `/me/calendarView` |
| Desktop | Electron 30 + electron-builder 24 |
| Icons | lucide-react |
| Font | Noto Sans (self-hosted via `next/font`) |

---

## Cost

Ballpark for ~30 h / month transcription at list prices:

| Component | Approx monthly |
|---|---|
| Azure Web App (B1) | ~$13 |
| Azure OpenAI inference | ~$11 |
| **Total** | **~$24 / month** |

Versus commercial tools for 800 users: Fireflies ~$182,400/yr · Otter ~$192,000/yr · **Dhvani ~$288/yr**.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT — see [`LICENSE`](./LICENSE).

## Credits

Built by the **ITU Innovation Hub** as an open-source Digital Public Good.
github.com/techpolicycomms/Dhvani
