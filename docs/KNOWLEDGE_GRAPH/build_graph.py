#!/usr/bin/env python3
"""Build Dhvani knowledge graph from the Next.js 14 codebase."""
import json
import os
import re
from pathlib import Path

ROOT = Path("/Users/rahuljha/digital-tools/Dhvani")

# ---------- File → node mapping ----------

def slug(path):
    """Turn repo-relative path into a stable id."""
    return path.replace("/", "_").replace("[", "").replace("]", "").replace(".", "_")

def rel(p):
    return str(p.relative_to(ROOT))

# Curated one-liner summaries (written from reading file tops).
SUMMARIES = {
    # Pages
    "app/page.tsx": "Home page (~800 lines) — hub of the app: calendar, recording UI, live transcript, recap.",
    "app/layout.tsx": "Root layout: mounts Noto Sans, SessionProvider, TranscriptionProvider, UserProfileProvider, InstallPrompt, OrphanRecordingBanner.",
    "app/admin/page.tsx": "Admin dashboard server page — gates by ADMIN_EMAILS, fetches usage stats server-side, hands them to the client component.",
    "app/admin/Client.tsx": "Admin dashboard client UI — tabs for usage, emissions (Green ICT), and org intelligence, with recharts visualisations.",
    "app/auth/signin/page.tsx": "Branded sign-in landing that kicks off the Microsoft Entra OAuth flow via a server action.",
    "app/desktop-setup/page.tsx": "Guide for capturing desktop meeting apps — leads with the Dhvani desktop app and shows a virtual-cable fallback.",
    "app/download/page.tsx": "Download landing that resolves the latest mac/win installer URLs from the GitHub Releases API with graceful fallbacks.",
    "app/mission/page.tsx": "Mission Control page — space-themed personal stats dashboard for the signed-in user.",
    "app/offline/page.tsx": "Offline fallback screen shown by the service worker when the network is unavailable.",
    "app/tasks/page.tsx": "Tasks page — full-surface view of the auto-extracted and manual task checklist.",
    "app/transcripts/page.tsx": "Transcripts library — search, filter, open, delete, share saved transcripts.",
    "app/upload/page.tsx": "File-upload transcription page for pre-recorded audio/video files.",
    "app/url-transcribe/page.tsx": "URL-transcription page — paste a direct audio/video URL and transcribe it server-side.",
    "app/shared/[token]/page.tsx": "Public shared-transcript server page — resolves a share token to a read-only transcript view.",
    "app/shared/[token]/SharedTranscriptView.tsx": "Read-only client view of a shared transcript with copy/download/preview controls.",

    # API routes
    "app/api/admin/analytics/route.ts": "GET admin cross-user analytics — reads raw transcript files and computes team-level usage summary.",
    "app/api/admin/config/route.ts": "GET/PUT admin service config — rate limits, monthly budget, service enabled flag, admin emails.",
    "app/api/admin/emissions/route.ts": "GET admin Green ICT emissions report — IPSASB SRS-1 aligned carbon disclosure per period.",
    "app/api/admin/org-intelligence/route.ts": "GET/POST admin anonymised organisational-intelligence insights (k-anon enforced).",
    "app/api/admin/usage/route.ts": "GET admin aggregated usage stats (JSON or CSV) for the usage dashboard.",
    "app/api/ask/route.ts": "POST chat-over-transcripts — Ask Dhvani Q&A with citations against the user's saved transcripts.",
    "app/api/audio/upload/route.ts": "POST raw voice-audio chunk upload — opt-in Azure Blob archival endpoint (off by default).",
    "app/api/auth/[...nextauth]/route.ts": "NextAuth v5 OAuth handlers — mounts GET and POST for sign-in, callback, signout, CSRF.",
    "app/api/calendar/today/route.ts": "GET today's online meetings from Microsoft Graph /me/calendarView, cached 5 min in-process.",
    "app/api/calendar/upcoming/route.ts": "GET upcoming meetings in the next N hours (for the reminder banner), 1-min cache.",
    "app/api/export/pdf/route.ts": "POST transcript id → returns a printable HTML page the browser can save as PDF.",
    "app/api/followup/route.ts": "POST generate a plain-text follow-up email from a transcript summary and action items.",
    "app/api/health/route.ts": "GET public health probe — verifies the Azure OpenAI resource is reachable.",
    "app/api/me/emissions/route.ts": "GET personal 30-day carbon footprint card for the Settings drawer.",
    "app/api/me/usage/route.ts": "GET personal usage + remaining quota for the in-app indicator.",
    "app/api/search/route.ts": "GET full-text search across the signed-in user's saved transcripts, with context snippets.",
    "app/api/storage/route.ts": "GET which transcript storage backend is live (filesystem or Azure Blob) for the Settings drawer.",
    "app/api/summarize/route.ts": "POST transcript → LLM-generated recap with action items, sentiment, keywords, task extraction.",
    "app/api/tasks/route.ts": "GET/POST/DELETE task CRUD against the per-user JSONL task log.",
    "app/api/transcribe/route.ts": "POST audio chunk → Azure OpenAI transcription with rate limiting and usage logging.",
    "app/api/transcripts/[id]/route.ts": "GET/DELETE a single saved transcript belonging to the signed-in user.",
    "app/api/transcripts/[id]/share/route.ts": "POST/DELETE to create or revoke a public share link for a transcript.",
    "app/api/transcripts/route.ts": "GET list + POST save transcripts (anti-abuse caps on entries, text length, daily saves).",
    "app/api/url-transcribe/route.ts": "POST remote audio/video URL → SSRF-safe fetch + transcribe + diarise.",
    "app/api/user/profile/route.ts": "GET/POST user profile (role id + language/feature prefs) from onboarding.",
    "app/api/user/stats/route.ts": "GET personal mission-control stats — rank, XP, badges, wellness, weekly trend.",
    "app/api/user/wellness/route.ts": "GET per-user meeting wellness signal (burnout bands) for the wellness tile.",
    "app/api/vocabulary/route.ts": "GET/POST/DELETE user's custom-vocabulary entries that prime Whisper's prompt.",

    # Components
    "components/ActionItems.tsx": "Interactive action-item checklist rendered under the AI-generated meeting summary.",
    "components/AskDhvani.tsx": "Chat-over-transcripts drawer — talks to /api/ask with citation rendering.",
    "components/AudioModeCards.tsx": "Large card picker for the capture mode (microphone, tab-audio, etc.) shown on the home page.",
    "components/AudioModeSelector.tsx": "Compact radio-group capture-mode selector for the settings drawer and inline surfaces.",
    "components/AudioRoutingDiagram.tsx": "Inline SVG diagram showing audio flow through a virtual-cable on the desktop-setup page.",
    "components/AudioWaveform.tsx": "Live waveform meter — AnalyserNode-driven vertical bars keyed off frequency data.",
    "components/CalendarToggle.tsx": "Calendar-preferences block (enable, reminders, lead time, auto-tag) inside Settings.",
    "components/ControlBar.tsx": "Record / stop / reconnect controls plus elapsed time, chunk count, in-flight counter.",
    "components/DemoBanner.tsx": "Top-of-page banner shown in demo mode to warn reviewers they are not signed in to Entra.",
    "components/DemoSessionProvider.tsx": "Injects a fake NextAuth session so demo-mode pages render as if signed in.",
    "components/DeviceSelector.tsx": "Microphone / virtual-cable device dropdown wired to useAudioDevices().",
    "components/ExportMenu.tsx": "Export dropdown: Copy, Markdown, .docx, .md, .txt, .srt, .json — uses mode-aware filenames.",
    "components/FollowUpEmail.tsx": "Follow-up email drafter — POSTs to /api/followup and lets the user copy the result.",
    "components/InstallPrompt.tsx": "PWA install-prompt card shown on mobile and iOS with platform-specific instructions.",
    "components/MeetingBanner.tsx": "Sticky reminder banner for an impending calendar meeting with Start-transcription CTA.",
    "components/MeetingKeywords.tsx": "Pill-row of keywords extracted from a meeting summary; clicking one searches transcripts.",
    "components/MeetingList.tsx": "Today's online meetings fetched from /api/calendar/today with one-tap Transcribe action.",
    "components/MeetingSummary.tsx": "Recap card — calls /api/summarize, renders Markdown summary, action items, citations.",
    "components/MissionControl.tsx": "Gamified stats dashboard — rank, XP bar, badges, wellness indicator.",
    "components/NavLinks.tsx": "Primary navigation links (Home, Notes, Tasks, Mission, Admin) shared across page headers.",
    "components/OnboardingGate.tsx": "Renders the OnboardingWizard on first sign-in when the user has no saved profile.",
    "components/OnboardingWizard.tsx": "Multi-step modal for picking role / sector / preferred languages during onboarding.",
    "components/OrgInsightsOptIn.tsx": "Localstorage-backed opt-in toggle for contributing anonymised org insights.",
    "components/OrphanRecordingBanner.tsx": "Crash-recovery banner — surfaces OPFS sessions still marked recording and offers Recover/Discard.",
    "components/RecordingBadge.tsx": "Fixed-position recording-in-progress pill shown on every page while capture is active.",
    "components/SentimentBadge.tsx": "Coloured pill showing overall meeting sentiment from the LLM summary.",
    "components/SettingsDrawer.tsx": "Slide-out settings panel — mic, language, mode, theme, calendar, storage, carbon.",
    "components/ShareModal.tsx": "Modal to create or revoke a public-share link for a transcript with TTL choice.",
    "components/SpeakerStats.tsx": "Per-speaker talk-time breakdown bar chart below the transcript.",
    "components/Switch.tsx": "Reusable ITU-branded two-state toggle switch used across settings surfaces.",
    "components/TaskChecklist.tsx": "Task checklist component — list, mark-done, priority colour coding, manual add.",
    "components/TestAudio.tsx": "Short-capture test button to verify a chosen mic/mode round-trips through the transcriber.",
    "components/TranscriptPanel.tsx": "Live transcript panel — renders entries, auto-scroll, in-transcript search, speaker rename, pinning.",
    "components/TranscriptSearch.tsx": "Library-wide search box that queries /api/search and renders hit cards with context.",
    "components/VocabularyManager.tsx": "Custom-vocabulary CRUD UI — terms and definitions that prime the transcriber's prompt.",
    "components/WellnessIndicator.tsx": "Compact meeting-wellness tile (signal strength) shown on home and /mission.",
    "components/admin/EmissionsDashboard.tsx": "Admin Green ICT dashboard — IPSASB SRS-1 aligned carbon report with charts.",
    "components/admin/OrgIntelligence.tsx": "Admin anonymised organisational-intelligence insights dashboard.",

    # Hooks
    "hooks/useAudioCapture.ts": "Cross-mode audio capture — MediaRecorder rotation, OPFS persistence, wake lock, mic/tab/virtual-cable/electron.",
    "hooks/useAudioDevices.ts": "Enumerate audio input devices (after priming mic permission via getUserMedia).",
    "hooks/useCalendarPrefs.ts": "Localstorage-backed calendar preferences (show meetings, reminders, lead time, auto-tag).",
    "hooks/useKeyboardShortcuts.ts": "Global keyboard shortcuts — Cmd+R record, Cmd+E export, Cmd+, settings, Cmd+/ search.",
    "hooks/useMeetingReminders.ts": "Polls /api/calendar/upcoming and fires in-app reminder banners with dismissal memory.",
    "hooks/useMode.ts": "React subscription to the Personal/Power mode primitive with a cross-component change event.",
    "hooks/useTheme.ts": "React subscription to the light/dark/system theme choice with cross-tab sync.",
    "hooks/useTranscriptStore.ts": "Client-side transcript state — entries, auto-save every 30s, resume, cross-slot localStorage sharding.",
    "hooks/useTranscription.ts": "Transcription pipeline — chunk queue, concurrency, exponential-backoff silent retries, delete-on-success.",
    "hooks/useWakeLock.ts": "Acquire/release a screen wake-lock with visibility-change re-acquisition.",

    # Contexts
    "contexts/TranscriptionContext.tsx": "Global transcription context — audio capture, transcript store, pipeline shared across pages.",
    "contexts/UserProfileContext.tsx": "Global user-profile context — needsOnboarding flag, role, language/feature prefs.",

    # Electron
    "electron/audioCapture.ts": "Electron renderer helper — desktopCapturer + MediaRecorder streams chunks to main via IPC.",
    "electron/main.ts": "Electron main process — creates BrowserWindow, system tray, shortcuts, optional demo Next.js fork.",
    "electron/preload.ts": "Electron preload — narrow contextBridge API (window.electronAPI) for start/stop and chunk listeners.",

    # Lib
    "lib/audioPersistence.ts": "OPFS-backed chunk persistence with IndexedDB shadow log and orphan-session recovery API.",
    "lib/audioUtils.ts": "Audio helpers — elapsed formatter, SRT timestamp, pickSupportedMimeType, blobToFile.",
    "lib/auth.ts": "NextAuth v5 config for Microsoft Entra — JWT with refresh, Graph token capture, server helpers.",
    "lib/azureBlobAudio.ts": "Azure Blob client for voice-audio archival (manifest + webm chunks) — opt-in server-side.",
    "lib/azureBlobStorage.ts": "Azure Blob client for transcript JSON — saveTranscript, listTranscripts, getTranscript, deleteTranscript.",
    "lib/azureErrorMessages.ts": "Maps raw Azure / network errors to user-friendly titles, hints, and action links.",
    "lib/calendar.ts": "Microsoft Graph calendar types + helpers — Meeting shape, fromGraphEvent, cache, error handler.",
    "lib/config.ts": "Centralised runtime config derived from env vars — AI provider, storage, calendar, feature flags.",
    "lib/constants.ts": "Shared constants — chunk duration, concurrency, bitrate, pricing, TranscriptEntry type, speaker colors.",
    "lib/demoMode.ts": "Demo-mode flag + fixture data (demo user, demo meetings) for env review without SSO.",
    "lib/docxExport.ts": "Mode-aware .docx exporter — Personal minimal template, Power ITU-branded template.",
    "lib/events.ts": "In-process event bus for Dhvani signals (transcription events, notifications webhook hook).",
    "lib/exportUtils.ts": "Transcript renderers — toTxt, toMarkdown, toSrt, toJson, buildFilename, downloadText.",
    "lib/gamification.ts": "Gamification engine — ranks, XP, badges, mission-stats computed from usage + tasks.",
    "lib/greenIct.ts": "Green-ICT carbon accounting — One-Token Model + IPSASB SRS-1 emissions report builder.",
    "lib/meetingWellness.ts": "Meeting wellness monitor — flags weeks approaching burnout thresholds.",
    "lib/mode.ts": "Personal / Power mode primitive — localStorage-backed with COPY map and change-event emitter.",
    "lib/openai.ts": "Azure OpenAI client factories — createOpenAIClient (whisper) + createChatOpenAIClient (gpt-4.1-mini).",
    "lib/orgIntelligence.ts": "Anonymised org-intelligence log — k-anonymity, opt-in, day-rounded timestamps, redacted records.",
    "lib/rateLimiter.ts": "Per-user hour/day caps + org-wide monthly budget cap; service-enabled master switch.",
    "lib/roleProfiles.ts": "ITU role profiles — sector, department, vocabulary, system-prompt instruction block per role.",
    "lib/security.ts": "Security helpers — sanitisePathSegment, ensureWithinDir, logSecurityEvent, safe regex escaping.",
    "lib/shareStorage.ts": "Transcript-share-link store — create, get, delete tokens with optional TTL and auth gate.",
    "lib/taskManager.ts": "Per-user JSONL task log — CRUD, priority/status enums, LLM task extraction helper.",
    "lib/theme.ts": "ITU brand palette + supporting color tokens (mirrors tailwind.config.ts for JS consumers).",
    "lib/themeMode.ts": "Light/dark/system theme primitive — stored + applied via html[data-theme] attribute.",
    "lib/transcriptStorage.ts": "Transcript persistence facade — picks filesystem or Azure Blob backend based on env.",
    "lib/urlFetch.ts": "SSRF-safe remote-media fetcher — classify URL, validate host, stream into bounded buffer.",
    "lib/usageAggregates.ts": "Pure aggregator over the usage log — UsageStats shape for admin dashboard + CSV export.",
    "lib/usageLogger.ts": "Append-only JSONL usage log — logUsage, readAllUsage, costFromSeconds.",
    "lib/userProfileStorage.ts": "Per-user JSON profile store — readUserProfile, writeUserProfile.",
    "lib/providers/ai.ts": "AIProvider contract — TranscriptionResult, ChatResult shapes shared by implementations.",
    "lib/providers/azure-openai.ts": "Azure OpenAI implementation of AIProvider — wraps createOpenAIClient with verbose_json fallback.",
    "lib/providers/index.ts": "Provider factory — getAIProvider() switches on AI_PROVIDER env.",

    # Misc
    "middleware.ts": "Route middleware — enforces NextAuth session on every page except an allow-list of public prefixes.",
}

# Docs
DOC_FILES = [
    "docs/ARCHITECTURE.md",
    "docs/AZURE_BLOB_AUDIO_SETUP.md",
    "docs/CIO_ISD_HANDOVER.md",
    "docs/DEPLOY.md",
    "docs/E2E_TESTING_PROMPT.md",
    "docs/ENTRA_SETUP.md",
    "docs/ROADMAP.md",
    "docs/SECURITY.md",
    "docs/STANDALONE_APPS_SPLIT.md",
    "docs/STRATEGIC_PLAN.md",
    "docs/deployment.md",
    "HANDOFF.md",
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
]

# ---------- Build nodes ----------

nodes = []
node_ids = set()

def add_node(id_, label, type_, file, summary):
    if id_ in node_ids:
        return
    node_ids.add(id_)
    nodes.append({
        "id": id_,
        "label": label,
        "type": type_,
        "file": file,
        "summary": summary,
    })

# File-to-id map
def file_id(path):
    return slug(path)

# Pages = app/**/page.tsx (and shared/[token]/SharedTranscriptView).
pages = [
    "app/page.tsx",
    "app/admin/page.tsx",
    "app/admin/Client.tsx",
    "app/auth/signin/page.tsx",
    "app/desktop-setup/page.tsx",
    "app/download/page.tsx",
    "app/mission/page.tsx",
    "app/offline/page.tsx",
    "app/tasks/page.tsx",
    "app/transcripts/page.tsx",
    "app/upload/page.tsx",
    "app/url-transcribe/page.tsx",
    "app/shared/[token]/page.tsx",
    "app/shared/[token]/SharedTranscriptView.tsx",
    "app/layout.tsx",
]
for p in pages:
    label = p.replace("app/", "").replace("/page.tsx", "").replace(".tsx", "") or "home"
    if p == "app/page.tsx": label = "home (/)"
    if p == "app/layout.tsx": label = "root layout"
    add_node(file_id(p), label, "page", p, SUMMARIES[p])

# API routes
api_routes = [
    "app/api/admin/analytics/route.ts",
    "app/api/admin/config/route.ts",
    "app/api/admin/emissions/route.ts",
    "app/api/admin/org-intelligence/route.ts",
    "app/api/admin/usage/route.ts",
    "app/api/ask/route.ts",
    "app/api/audio/upload/route.ts",
    "app/api/auth/[...nextauth]/route.ts",
    "app/api/calendar/today/route.ts",
    "app/api/calendar/upcoming/route.ts",
    "app/api/export/pdf/route.ts",
    "app/api/followup/route.ts",
    "app/api/health/route.ts",
    "app/api/me/emissions/route.ts",
    "app/api/me/usage/route.ts",
    "app/api/search/route.ts",
    "app/api/storage/route.ts",
    "app/api/summarize/route.ts",
    "app/api/tasks/route.ts",
    "app/api/transcribe/route.ts",
    "app/api/transcripts/[id]/route.ts",
    "app/api/transcripts/[id]/share/route.ts",
    "app/api/transcripts/route.ts",
    "app/api/url-transcribe/route.ts",
    "app/api/user/profile/route.ts",
    "app/api/user/stats/route.ts",
    "app/api/user/wellness/route.ts",
    "app/api/vocabulary/route.ts",
]
for p in api_routes:
    label = p.replace("app/api/", "/api/").replace("/route.ts", "")
    add_node(file_id(p), label, "api-route", p, SUMMARIES[p])

# Components
components = sorted((ROOT / "components").glob("*.tsx")) + sorted((ROOT / "components/admin").glob("*.tsx"))
for c in components:
    p = rel(c)
    label = c.stem
    add_node(file_id(p), label, "component", p, SUMMARIES.get(p, ""))

# Hooks
for h in sorted((ROOT / "hooks").glob("*.ts")):
    p = rel(h)
    add_node(file_id(p), h.stem, "hook", p, SUMMARIES.get(p, ""))

# Contexts
for c in sorted((ROOT / "contexts").glob("*.tsx")):
    p = rel(c)
    add_node(file_id(p), c.stem, "context", p, SUMMARIES.get(p, ""))

# Lib (flat + providers)
for l in sorted((ROOT / "lib").glob("*.ts")):
    p = rel(l)
    add_node(file_id(p), l.stem, "lib", p, SUMMARIES.get(p, ""))
for l in sorted((ROOT / "lib/providers").glob("*.ts")):
    p = rel(l)
    add_node(file_id(p), f"providers/{l.stem}", "lib", p, SUMMARIES.get(p, ""))

# Electron
for e in sorted((ROOT / "electron").glob("*.ts")):
    p = rel(e)
    add_node(file_id(p), f"electron/{e.stem}", "lib", p, SUMMARIES.get(p, ""))

# Middleware
add_node(file_id("middleware.ts"), "middleware", "config", "middleware.ts", SUMMARIES["middleware.ts"])

# Docs
DOCS_SUMMARIES = {
    "docs/ARCHITECTURE.md": "Architecture overview of Dhvani — pipelines, data flows, design choices.",
    "docs/AZURE_BLOB_AUDIO_SETUP.md": "Setup guide for enabling opt-in Azure Blob voice-audio archival.",
    "docs/CIO_ISD_HANDOVER.md": "CIO/ISD handover brief covering scaling, production readiness, ownership transfer.",
    "docs/DEPLOY.md": "Deployment instructions for Dhvani on Azure Web App and the desktop build.",
    "docs/E2E_TESTING_PROMPT.md": "Full end-to-end QA script for a desktop GUI agent to exercise the product.",
    "docs/ENTRA_SETUP.md": "Microsoft Entra (Azure AD) tenant + app-registration setup walkthrough.",
    "docs/ROADMAP.md": "12-month product roadmap once Dhvani graduates from the Innovation Hub.",
    "docs/SECURITY.md": "Security posture — auth, rate limiting, SSRF, storage isolation, threat model notes.",
    "docs/STANDALONE_APPS_SPLIT.md": "Mega-prompt for splitting Dhvani into discrete apps if leadership chooses that shape.",
    "docs/STRATEGIC_PLAN.md": "Strategic plan document for Dhvani's positioning inside ITU.",
    "docs/deployment.md": "Legacy deployment notes (superseded by DEPLOY.md).",
    "HANDOFF.md": "Single-shot session handoff doc — paste at the start of a new chat for full context.",
    "README.md": "Project README — overview, run/verify, features, status.",
    "CONTRIBUTING.md": "Contributing guide — coding conventions, PR expectations, setup.",
    "LICENSE": "MIT (or equivalent) license text.",
}
for d in DOC_FILES:
    fpath = ROOT / d
    if not fpath.exists():
        continue
    add_node(file_id(d), Path(d).name, "docs", d, DOCS_SUMMARIES.get(d, ""))

# External services + storage backends
externals = [
    ("ext_azure_openai_transcribe", "Azure OpenAI — gpt-4o-transcribe-diarize", "external-service", None, "Azure OpenAI diarisation deployment (SWC region) used for audio transcription."),
    ("ext_azure_openai_chat", "Azure OpenAI — gpt-4.1-mini", "external-service", None, "Azure OpenAI chat deployment (EUW region) used for summary, ask, follow-up, tasks."),
    ("ext_azure_blob", "Azure Blob Storage", "external-service", None, "Azure Blob Storage — transcripts and (opt-in) raw voice audio containers."),
    ("ext_entra", "Microsoft Entra ID", "external-service", None, "Microsoft Entra (Azure AD) — OAuth / OIDC identity provider for SSO."),
    ("ext_graph", "Microsoft Graph (Calendar)", "external-service", None, "Microsoft Graph /me/calendarView — pulls the user's online meetings."),
    ("ext_github_releases", "GitHub Releases API", "external-service", None, "api.github.com Releases endpoint — resolves latest desktop installer URLs."),
    ("ext_lucide", "lucide-react", "external-service", None, "lucide-react icon set — line icons used across the UI."),
    ("storage_opfs", "OPFS (browser)", "storage-backend", None, "Origin Private File System — crash-safe chunk blobs under /recordings/<sessionId>/."),
    ("storage_idb", "IndexedDB (browser)", "storage-backend", None, "IndexedDB shadow log of chunk metadata — second source of truth for crash recovery."),
    ("storage_localstorage", "localStorage (browser)", "storage-backend", None, "Browser localStorage — user preferences (mode, theme, calendar, dismissed reminders)."),
    ("storage_fs_transcripts", "Local filesystem — ./data/transcripts", "storage-backend", None, "Default transcript store under ./data/transcripts/<userId>/<id>.json (wiped on redeploy)."),
    ("storage_fs_usage", "Local filesystem — usage log", "storage-backend", None, "Append-only JSONL usage log at ./data/usage-log.jsonl."),
    ("storage_fs_tasks", "Local filesystem — tasks + shares + vocab", "storage-backend", None, "Per-user JSONL/JSON files for tasks, shares, custom vocabulary under ./data."),
    ("storage_fs_orginsights", "Local filesystem — org-insights log", "storage-backend", None, "Anonymised org-insights JSONL log (opt-in) at ./data/org-insights.jsonl."),
    ("storage_fs_profiles", "Local filesystem — user profiles", "storage-backend", None, "Per-user JSON profile store under ./data/users/."),
]
for (id_, label, type_, file, summary) in externals:
    add_node(id_, label, type_, file, summary)

# Config-ish nodes
add_node("public_sw", "service worker (sw.js)", "config", "public/sw.js", "Service worker — offline cache + install banner bootstrap.")

# ---------- Build edges ----------

edges = []

# Mapping for @/path-alias -> repo file paths.
def resolve_alias(alias, from_file):
    # "@/..." -> repo root
    if alias.startswith("@/"):
        return alias[2:]
    # relative -> resolve relative to from_file dir without traversing out
    if alias.startswith("./") or alias.startswith("../"):
        base = (ROOT / from_file).parent
        try:
            resolved = (base / alias).resolve()
            return str(resolved.relative_to(ROOT.resolve()))
        except ValueError:
            return None
    return None

# We resolve to concrete paths by trying common extensions and index files.
def match_node_for_import(ref, from_file):
    resolved = resolve_alias(ref, from_file)
    if not resolved:
        return None
    candidates = [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + "/index.ts",
        resolved + "/index.tsx",
    ]
    for c in candidates:
        full = ROOT / c
        if full.exists() and full.is_file():
            # Normalise to string
            rel_c = c.replace("\\", "/")
            if file_id(rel_c) in node_ids:
                return file_id(rel_c)
    return None

IMPORT_RE = re.compile(r'^\s*import\s+(?:[^\'"]*\s+from\s+)?[\'"]([^\'"]+)[\'"]', re.MULTILINE)
DYNAMIC_IMPORT_RE = re.compile(r'import\([\'"]([^\'"]+)[\'"]\)')
FETCH_API_RE = re.compile(r'fetch\(\s*[`\'"](\/api\/[^\s`\'")?]+)')
USE_CONTEXT_RE = re.compile(r'\buse(Transcription|UserProfile)Context\(')
LINK_HREF_RE = re.compile(r'<Link\s+[^>]*href=[`"\']([^`"\']+)[`"\']')

# All source files we walk
source_files = []
for p in pages + api_routes:
    source_files.append(p)
for c in (ROOT / "components").glob("*.tsx"):
    source_files.append(rel(c))
for c in (ROOT / "components/admin").glob("*.tsx"):
    source_files.append(rel(c))
for h in (ROOT / "hooks").glob("*.ts"):
    source_files.append(rel(h))
for c in (ROOT / "contexts").glob("*.tsx"):
    source_files.append(rel(c))
for l in (ROOT / "lib").glob("*.ts"):
    source_files.append(rel(l))
for l in (ROOT / "lib/providers").glob("*.ts"):
    source_files.append(rel(l))
for e in (ROOT / "electron").glob("*.ts"):
    source_files.append(rel(e))
source_files.append("middleware.ts")

seen_edges = set()
def add_edge(src, tgt, type_):
    if src == tgt:
        return
    key = (src, tgt, type_)
    if key in seen_edges:
        return
    seen_edges.add(key)
    edges.append({"source": src, "target": tgt, "type": type_})

# Walk each source file: parse imports, api calls, context uses, link navigations
for sf in source_files:
    full = ROOT / sf
    if not full.exists():
        continue
    try:
        text = full.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    src_id = file_id(sf)
    if src_id not in node_ids:
        continue

    # Imports
    for m in IMPORT_RE.finditer(text):
        ref = m.group(1)
        if ref.startswith("node:"):
            continue
        # lucide-react → external
        if ref == "lucide-react":
            add_edge(src_id, "ext_lucide", "imports")
            continue
        tgt = match_node_for_import(ref, sf)
        if tgt:
            add_edge(src_id, tgt, "imports")
    for m in DYNAMIC_IMPORT_RE.finditer(text):
        ref = m.group(1)
        tgt = match_node_for_import(ref, sf)
        if tgt:
            add_edge(src_id, tgt, "imports")

    # fetch("/api/...") → calls-api
    for m in FETCH_API_RE.finditer(text):
        api_path = m.group(1)
        # Strip trailing slash, find best api route match
        # Pattern: /api/foo/bar → app/api/foo/bar/route.ts (possibly with [id] segment)
        segs = api_path.strip("/").split("/")  # ['api', 'foo', ...]
        # Try best-effort longest-prefix match over known api routes.
        best = None
        best_len = 0
        for ap in api_routes:
            ap_segs = ap.replace("app/", "").replace("/route.ts", "").strip("/").split("/")
            # Compare ap_segs to segs. Treat [x] as a wildcard.
            if len(ap_segs) > len(segs): continue
            match = True
            for i, s in enumerate(ap_segs):
                if s.startswith("[") and s.endswith("]"):
                    continue
                if s != segs[i]:
                    match = False
                    break
            if match and len(ap_segs) > best_len:
                best = ap
                best_len = len(ap_segs)
        if best:
            add_edge(src_id, file_id(best), "calls-api")

    # useContext calls
    for m in USE_CONTEXT_RE.finditer(text):
        name = m.group(1)
        if name == "Transcription":
            add_edge(src_id, file_id("contexts/TranscriptionContext.tsx"), "uses-context")
        elif name == "UserProfile":
            add_edge(src_id, file_id("contexts/UserProfileContext.tsx"), "uses-context")

    # <Link href="/xxx"> → navigates-to (pages only)
    if sf in pages or sf.endswith("page.tsx") or sf.endswith("Client.tsx") or sf.endswith("SharedTranscriptView.tsx"):
        for m in LINK_HREF_RE.finditer(text):
            href = m.group(1)
            if not href.startswith("/"):
                continue
            # Map href → page file
            target_page = None
            clean = href.split("?")[0].split("#")[0].rstrip("/")
            if clean == "":
                target_page = "app/page.tsx"
            else:
                # Try to match page routes
                candidate = f"app{clean}/page.tsx"
                if (ROOT / candidate).exists():
                    target_page = candidate
                else:
                    # maybe it's a dynamic page [token]
                    candidate2 = f"app{clean}/page.tsx"
                    # Skip if external anchor
                    pass
            if target_page and file_id(target_page) in node_ids:
                add_edge(src_id, file_id(target_page), "navigates-to")

# Storage edges (explicit)
add_edge(file_id("lib/transcriptStorage.ts"), "storage_fs_transcripts", "writes-storage")
add_edge(file_id("lib/transcriptStorage.ts"), "storage_fs_transcripts", "reads-storage")
add_edge(file_id("lib/transcriptStorage.ts"), "storage_azure_blob_alias_not_used_ignore", "reads-storage") if False else None

add_edge(file_id("lib/azureBlobStorage.ts"), "ext_azure_blob", "depends-on-service")
add_edge(file_id("lib/azureBlobStorage.ts"), "ext_azure_blob", "writes-storage")
add_edge(file_id("lib/azureBlobStorage.ts"), "ext_azure_blob", "reads-storage")

add_edge(file_id("lib/azureBlobAudio.ts"), "ext_azure_blob", "depends-on-service")
add_edge(file_id("lib/azureBlobAudio.ts"), "ext_azure_blob", "writes-storage")
add_edge(file_id("lib/azureBlobAudio.ts"), "ext_azure_blob", "reads-storage")

add_edge(file_id("lib/audioPersistence.ts"), "storage_opfs", "writes-storage")
add_edge(file_id("lib/audioPersistence.ts"), "storage_opfs", "reads-storage")
add_edge(file_id("lib/audioPersistence.ts"), "storage_idb", "writes-storage")
add_edge(file_id("lib/audioPersistence.ts"), "storage_idb", "reads-storage")

add_edge(file_id("lib/shareStorage.ts"), "storage_fs_tasks", "writes-storage")
add_edge(file_id("lib/shareStorage.ts"), "storage_fs_tasks", "reads-storage")
add_edge(file_id("lib/taskManager.ts"), "storage_fs_tasks", "writes-storage")
add_edge(file_id("lib/taskManager.ts"), "storage_fs_tasks", "reads-storage")
add_edge(file_id("lib/usageLogger.ts"), "storage_fs_usage", "writes-storage")
add_edge(file_id("lib/usageLogger.ts"), "storage_fs_usage", "reads-storage")
add_edge(file_id("lib/usageAggregates.ts"), "storage_fs_usage", "reads-storage")
add_edge(file_id("lib/greenIct.ts"), "storage_fs_usage", "reads-storage")
add_edge(file_id("lib/gamification.ts"), "storage_fs_usage", "reads-storage")
add_edge(file_id("lib/meetingWellness.ts"), "storage_fs_usage", "reads-storage")
add_edge(file_id("lib/orgIntelligence.ts"), "storage_fs_orginsights", "writes-storage")
add_edge(file_id("lib/orgIntelligence.ts"), "storage_fs_orginsights", "reads-storage")
add_edge(file_id("lib/userProfileStorage.ts"), "storage_fs_profiles", "writes-storage")
add_edge(file_id("lib/userProfileStorage.ts"), "storage_fs_profiles", "reads-storage")
add_edge(file_id("app/api/vocabulary/route.ts"), "storage_fs_tasks", "writes-storage")
add_edge(file_id("app/api/vocabulary/route.ts"), "storage_fs_tasks", "reads-storage")
add_edge(file_id("app/api/admin/analytics/route.ts"), "storage_fs_transcripts", "reads-storage")
add_edge(file_id("app/api/admin/org-intelligence/route.ts"), "storage_fs_orginsights", "reads-storage")

# External service deps (depends-on-service)
add_edge(file_id("lib/openai.ts"), "ext_azure_openai_transcribe", "depends-on-service")
add_edge(file_id("lib/openai.ts"), "ext_azure_openai_chat", "depends-on-service")
add_edge(file_id("lib/providers/azure-openai.ts"), "ext_azure_openai_transcribe", "depends-on-service")
add_edge(file_id("lib/providers/azure-openai.ts"), "ext_azure_openai_chat", "depends-on-service")
add_edge(file_id("lib/auth.ts"), "ext_entra", "depends-on-service")
add_edge(file_id("lib/calendar.ts"), "ext_graph", "depends-on-service")
add_edge(file_id("app/api/calendar/today/route.ts"), "ext_graph", "depends-on-service")
add_edge(file_id("app/api/calendar/upcoming/route.ts"), "ext_graph", "depends-on-service")
add_edge(file_id("app/download/page.tsx"), "ext_github_releases", "depends-on-service")
add_edge(file_id("app/api/transcribe/route.ts"), "ext_azure_openai_transcribe", "depends-on-service")
add_edge(file_id("app/api/summarize/route.ts"), "ext_azure_openai_chat", "depends-on-service")
add_edge(file_id("app/api/ask/route.ts"), "ext_azure_openai_chat", "depends-on-service")
add_edge(file_id("app/api/followup/route.ts"), "ext_azure_openai_chat", "depends-on-service")
add_edge(file_id("app/api/url-transcribe/route.ts"), "ext_azure_openai_transcribe", "depends-on-service")

# localStorage-using hooks/components → external backing
for f in ["hooks/useMode.ts", "hooks/useTheme.ts", "hooks/useCalendarPrefs.ts", "hooks/useMeetingReminders.ts", "hooks/useTranscriptStore.ts", "lib/mode.ts", "lib/themeMode.ts", "components/OrgInsightsOptIn.tsx", "components/InstallPrompt.tsx"]:
    add_edge(file_id(f), "storage_localstorage", "reads-storage")
    add_edge(file_id(f), "storage_localstorage", "writes-storage")

# service worker referenced from layout
add_edge(file_id("app/layout.tsx"), "public_sw", "depends-on-service")

# Drop any spurious empty-target edges just in case
edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]

# Remove dupes finally
dedup = {}
for e in edges:
    dedup[(e["source"], e["target"], e["type"])] = e
edges = list(dedup.values())

out = {"nodes": nodes, "edges": edges}
target = ROOT / "docs/KNOWLEDGE_GRAPH/graph.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(out, indent=2))
print(f"Nodes: {len(nodes)}")
print(f"Edges: {len(edges)}")
print(f"Wrote {target}")
