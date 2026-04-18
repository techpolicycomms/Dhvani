# Dhvani — session handoff

Single-shot context for a new Claude Code session. Paste the whole file (or just the sections you need) at the start of a new chat. Goal: enough context to continue development without re-exploring.

---

## TL;DR

- **Product**: Dhvani — Next.js 14 PWA + Electron desktop wrapper, ITU's internal meeting transcription tool. Microsoft Entra SSO, server-managed Azure OpenAI keys (NOT BYOK).
- **Repo**: `techpolicycomms/Dhvani` on GitHub.
- **Local path**: `/Users/rahuljha/digital-tools/Dhvani`.
- **Active branch**: `wip/reliability-and-easy-wins` (last commit `06c740c` — "Fix dark mode + Personal mic-only + add Azure Blob storage backend"). Open PR target: `main`.
- **Sister repo (parked)**: `techpolicycomms/itu-transcribe` — was a ground-up BYOK rebuild attempt (Tauri + Next 15). Deprecated in favor of staying on Dhvani per user decision. Don't touch it unless explicitly asked.

---

## Run / verify

```bash
cd /Users/rahuljha/digital-tools/Dhvani
npm run dev                  # http://localhost:3000
./node_modules/.bin/tsc --noEmit   # typecheck (currently clean)
./node_modules/.bin/next lint      # 2 pre-existing useCallback warnings in app/page.tsx, both predate this branch
```

Sign-in flow: Microsoft Entra (creds in `.env`). Demo mode flag exists (`DEMO_MODE=true`) but user wants Entra always-on.

---

## Architecture

- Next.js 14 App Router, TypeScript strict
- Tailwind 3 with CSS-variable color tokens (see Dark mode section)
- NextAuth v5 + Microsoft Entra ID for auth
- Azure OpenAI: `gpt-4o-transcribe-diarize` (transcription, SWC region) + `gpt-4.1-mini` (chat/summary, EUW region) — server-side, never client
- Storage: local filesystem `./data/transcripts/<userId>/<id>.json` by default, Azure Blob when env configured (see Storage section)
- Audio capture: `useAudioCapture` hook with MediaRecorder rotation pattern. Three modes: `tab-audio`, `microphone`, `virtual-cable`. Plus `electron` mode (auto-detected when running in Tauri/Electron wrapper).
- Persistence: OPFS for chunk blobs + IndexedDB shadow log + screen wake lock. See [lib/audioPersistence.ts](lib/audioPersistence.ts).

---

## Major files (where to look first)

| Concern | File |
|---|---|
| Home page (recording UI) | `app/page.tsx` (~800 lines, hub of the app) |
| Settings drawer | `components/SettingsDrawer.tsx` |
| Transcription pipeline | `hooks/useTranscription.ts` |
| Audio capture | `hooks/useAudioCapture.ts` |
| Chunk persistence | `lib/audioPersistence.ts` |
| Crash-recovery banner | `components/OrphanRecordingBanner.tsx` |
| Calendar Transcribe flow | `app/page.tsx:onStartFromMeeting` + `components/MeetingList.tsx` |
| Mode primitive | `lib/mode.ts` + `hooks/useMode.ts` |
| Dark theme | `lib/themeMode.ts` + `hooks/useTheme.ts` + `app/globals.css` |
| Smart Azure error mapping | `lib/azureErrorMessages.ts` |
| Exports (txt/srt/json/md) | `lib/exportUtils.ts` + `components/ExportMenu.tsx` |
| .docx export (Personal/Power) | `lib/docxExport.ts` |
| Storage backend | `lib/transcriptStorage.ts` (FS) + `lib/azureBlobStorage.ts` (Blob) |
| Recap UI | `components/MeetingSummary.tsx` |
| Keyboard shortcuts | `hooks/useKeyboardShortcuts.ts` |

---

## Personal vs Power mode

User-facing toggle in **Settings → Mode**. Persisted in `localStorage` as `dhvani-mode`.

```ts
// lib/mode.ts
type Mode = "personal" | "power";
COPY[mode] = { disclaimer, recapHeading, followUpsHeading, exportPrefix, bureauVisible, adminVisible, greetingPrefix }
```

**Personal mode** intentionally hides:
- Reminder banner, TaskChecklist, WellnessIndicator, AudioModeCards picker, MeetingList calendar, AudioModeSelector segmented control
- NavLinks reduced to just Home + Notes
- Defaults `chosenMode` to `"microphone"` so the record button works without a picker
- Recap heading becomes "What I heard", filename prefix becomes `recap-…`

**Power mode**: full ITU surface (calendar, dashboard, all nav, Bureau tagging, admin link). Recap heading "Meeting Summary", filename prefix `ITU-Meeting-Notes-…`.

The mode is read via `useMode()` in any client component. Don't add a third mode without checking the spec.

---

## Dark mode (just landed, important to understand)

`app/globals.css` declares colors as CSS variables under `:root` (light) and `html[data-theme="dark"]` (dark). `tailwind.config.ts` maps every Tailwind color token (`bg-white`, `text-dark-navy`, `border-border-gray`, etc.) to `var(--xxx)`, so Tailwind utilities flip automatically when `data-theme` changes.

A blocking inline script in `app/layout.tsx` `<head>` reads `localStorage.dhvani-theme` and applies `data-theme` BEFORE first paint to avoid flash-of-light-theme.

`hooks/useTheme.ts` exposes `{ choice, resolved, setChoice }` with `light | dark | system` choices. Settings → Appearance picker renders this.

**Known caveats**:
- A guard rule in globals.css forces `text-white` to stay literal `#ffffff` inside `.bg-itu-blue` / `.bg-error` / `.bg-success` / `.bg-warning` so accent-button text stays readable.
- `app/download/page.tsx` uses inline `style={}` with hardcoded hex values — bypasses the CSS-variable system and is BROKEN in dark mode (text invisible, buttons unclickable). Fix is straightforward: replace inline styles with Tailwind classes.

---

## Storage backends

`lib/transcriptStorage.ts` is the public API (`saveTranscript`, `listTranscripts`, `getTranscript`, `deleteTranscript`, `activeBackend`). Picks backend at call time based on env:

- **Local filesystem** (default) — `./data/transcripts/<userId>/<id>.json`. Wiped on Web App redeploy.
- **Azure Blob** — picked when `AZURE_STORAGE_CONNECTION_STRING` (or `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY`) are set. Container defaults to `dhvani-transcripts`, auto-created with private access. Path: `transcripts/<userId>/<sessionId>.json`. Survives redeploys.

Settings drawer surfaces which backend is live via `/api/storage`.

Dependency: `@azure/storage-blob`.

---

## Reliability (mobile audio pipeline) — already shipped on this branch

- **Opus 24 kbps** via MediaRecorder; iOS Safari falls back to AAC via the existing `audio/mp4` candidate in `pickSupportedMimeType()`.
- **Chunk size**: 1500ms default (was 3000ms). Concurrent transcribes: 4 (was 2).
- **OPFS atomic writes** — every chunk persisted to `/recordings/<sessionId>/chunk_NNNNN.webm` using tmp+rename.
- **IndexedDB shadow log** — second source of truth for chunk metadata.
- **Screen wake lock** acquired on record start, re-acquired on `visibilitychange`.
- **`navigator.storage.persist()`** requested on first record. **`navigator.storage.estimate()`** gates record start at 200 MB free.
- **Crash recovery** — `OrphanRecordingBanner` mounted in root layout. Shows "Unfinished recording from HH:MM" with Recover / Discard.
- **Auto-resume on `online` event** — when the browser comes back online with pending sessions, the banner silently auto-recovers them through the transcription pipeline + surfaces a toast.
- **Delete-on-success** — chunks are deleted from OPFS as their transcribe call returns 200; failed chunks stay so they surface as recoverable orphans.

Constants in `lib/constants.ts`: `DEFAULT_CHUNK_DURATION_MS`, `MAX_CONCURRENT_TRANSCRIPTIONS`, `AUDIO_BITS_PER_SECOND`, `MIN_FREE_STORAGE_BYTES`.

---

## Calendar Transcribe flow (Addendum C)

`onStartFromMeeting(meeting)` in `app/page.tsx`:

1. `setActiveMeeting(meeting)` — stores the event tag.
2. Maps `meeting.platform` → audio source: Teams/Meet → `tab-audio`, Electron available → `electron`, Zoom → `virtual-cable`, else `microphone`.
3. Scrolls to top.
4. **Does NOT** start capture. The user has to tap Record themselves.
5. Idle home shows a blue "Ready for: <subject>" banner with a × dismiss.

`MeetingCard` button label tracks event timing: "Set up" (>5min away), "Start" (within 5min), "Join & record" (in progress). Past events not currently routed (was deferred).

---

## Exports

Menu in `components/ExportMenu.tsx`. Options:
- Copy All (clipboard)
- Copy as Markdown (D4)
- Download .docx — forks template on mode (Personal: minimal, "Private notes — Dhvani" footer; Power: ITU-branded "ITU · Internal working notes" footer)
- Download .md, .txt, .srt, .json

Filename uses `buildFilename(ext, { mode, title })` from `lib/exportUtils.ts`. Personal: `recap-<slug>-<date>.<ext>`; Power: `ITU-Meeting-Notes-<slug>-<date>.<ext>`. Backwards-compatible legacy shape `dhvani-transcript-<date>.<ext>` when no mode is supplied.

---

## Smart Azure errors (D11)

`lib/azureErrorMessages.ts` exports `interpretError(raw)` returning `{ title, hint, link?, severity }`. Wired in `contexts/TranscriptionContext.tsx` `onError` and `onRateLimited` callbacks. 401 → "Azure rejected your key", 429 → "rate-limiting", 5xx → "temporarily unavailable", network → "Your connection is slow", etc. Toast duration scales with severity.

---

## Keyboard shortcuts (Week 7)

`hooks/useKeyboardShortcuts.ts` — `Cmd+R` toggles record, `Cmd+,` opens Settings, `Esc` closes drawers. Wired in `app/page.tsx` near where `onStart` is defined. Form-field focus is honored (Cmd+, is intentionally global).

---

## Recap (mode-aware)

`components/MeetingSummary.tsx` reads `useMode().copy.recapHeading`. Personal: "What I heard" / "Wrap up" CTA / softer helper copy. Power: "Meeting Summary" / "Generate Summary" / standard copy.

Server route: `/api/summarize` — uses Azure OpenAI chat with role-aware system prompts from `lib/roleProfiles.ts`. Emits a `---TASKS---` block parsed by `lib/taskManager.ts` and persisted as auto-extracted action items.

---

## Open / known issues

1. **`/download` page is broken in dark mode** — uses inline `style={...}` with hardcoded hex values. Fix: replace inline styles with Tailwind classes (`bg-white`, `text-dark-navy`, `text-itu-blue`). Highest priority known bug.
2. **Download page resolves installer URLs from GitHub Releases API** — if no `.dmg`/`.exe` artifact is published in the latest release, falls back to the generic releases page silently. Catch block at line ~36 swallows fetch errors with no console.error. User reported "I can't download" — this is the cause.
3. **Two pre-existing ESLint warnings** in `app/page.tsx` lines ~180 + ~272 (`useCallback` missing-dep warnings for `setRateLimitMsg` and `setToast`). Predate this branch. Safe to leave or fix in a polish pass.
4. **Brand color** — codebase uses `#1DA0DB`; ITU official spec is `#009CD6`. Both are very close. Switching is a 2-line change in `lib/theme.ts` + `app/globals.css` since Tailwind reads from CSS vars. User may want this.
5. **Visual gaps** — Settings sections, MeetingList empty state, MissionControl badges, transcript empty state — all could use lucide line icons in ITU blue for scannability. User specifically asked for ITU brand icons.
6. **Conferencing-app auto-detect** (Electron) — deferred, needs OS-level process polling + permission UX.
7. **A1 per-phrase live transcript layout** + **B yield-to-user auto-scroll** + **D9 Cmd+F in-transcript search** — deferred (touch the same `TranscriptPanel` component, safer in a focused refactor).
8. **D5 fuzzy library search** (Fuse.js) — deferred.
9. **D6 background-recording notification** (mobile/PWA) — deferred.
10. **D8 transcript section collapse** for long recordings — deferred.
11. **D12 onboarding example transcript** — deferred.
12. **D14 drag-to-reorder library tags** — deferred.

---

## Recent commits on `wip/reliability-and-easy-wins` (newest first)

```
06c740c  Fix dark mode + Personal mic-only + add Azure Blob storage backend
e353a7e  Personal mode actually strips the UI down to "tap to record"
3050e15  Weeks 5-7: dark mode, mode-aware recap + filenames, keyboard shortcuts
d540ea7  Weeks 3 + 4: offline auto-resume, .docx export, mode-aware install prompt
88333b8  Apply UI/UX Addendum v1 to Dhvani: mode, calendar, exports, errors
96e4970  WIP: offline-first persistence + Electron-aware capture UI
```

`main` is at the upstream `2a55060` point, untouched by this session.

---

## Conventions for the next session

- Don't reintroduce demo mode unless asked — Entra is the auth path.
- Don't add a backend server beyond Next API routes; everything stays in the existing stack.
- Don't switch to Tauri / monorepo / BYOK — that experiment is parked at `itu-transcribe`.
- Don't bypass the CSS-variable color system — anywhere a component uses an inline `style={{ color: "#…"  }}` it will break dark mode.
- Run `tsc --noEmit` and `next lint` before committing. Two pre-existing useCallback warnings are acceptable; nothing else.
- Use absolute paths in tool calls when scripting — the parent dir `/Users/rahuljha/digital-tools` is itself a separate (empty) git repo, so `cd Dhvani` matters.
- Commit messages: prose, why-over-what, no Co-Authored-By unless asked.

---

## Quick orientation prompt for a new session

> I'm continuing work on Dhvani at `/Users/rahuljha/digital-tools/Dhvani`, branch `wip/reliability-and-easy-wins`. Read `HANDOFF.md` at the repo root for full context. The most important known issue is: the `/download` page uses inline hex-color styles that break in dark mode and resolves installer URLs from GitHub Releases API which has no published artifacts (so users can't actually download). Help me fix [SPECIFIC THING].
