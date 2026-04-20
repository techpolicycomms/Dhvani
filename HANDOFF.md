# Dhvani — session handoff

Single-shot context for a new Claude Code session. Paste the whole file (or just the sections you need) at the start of a new chat. Goal: enough context to continue development without re-exploring.

---

## TL;DR

- **Product**: Dhvani — Next.js 14 PWA + Electron desktop wrapper, ITU's internal meeting transcription tool. Microsoft Entra SSO, server-managed Azure OpenAI keys (NOT BYOK).
- **Repo**: `techpolicycomms/Dhvani` on GitHub.
- **Local path**: `/Users/rahuljha/digital-tools/Dhvani`.
- **Active branch**: `wip/reliability-and-easy-wins`. Open PR target: `main`.
- **Last session commit** (before this one): `613e419` — "Add HANDOFF.md". This session's unstaged changes: ITU-brand #009CD6 swap, /download page rewrite, silent chunk retry, lucide icons on Settings + transcript empty state, Azure Blob voice-audio scaffold, handover docs. Nothing has been committed yet — next human session should `git status` + review + commit.
- **Sister repo (parked)**: `techpolicycomms/itu-transcribe` — BYOK rebuild on Tauri + Next 15. Deprecated in favor of staying on Dhvani. Don't touch.

---

## Run / verify

```bash
cd /Users/rahuljha/digital-tools/Dhvani
npm run dev                  # http://localhost:3000
./node_modules/.bin/tsc --noEmit   # typecheck (currently clean)
./node_modules/.bin/next lint      # 2 pre-existing useCallback warnings; safe
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
| Transcript JSON storage | `lib/transcriptStorage.ts` (FS) + `lib/azureBlobStorage.ts` (Blob) |
| **Voice-audio archival (new, opt-in)** | `lib/azureBlobAudio.ts` + `app/api/audio/upload/route.ts` — see `docs/AZURE_BLOB_AUDIO_SETUP.md` |
| Recap UI | `components/MeetingSummary.tsx` |
| Keyboard shortcuts | `hooks/useKeyboardShortcuts.ts` |
| Brand tokens | `lib/theme.ts` + `app/globals.css` (ITU official blue #009CD6) |

---

## Brand identity (current, as of this session)

- **Primary blue: `#009CD6`** — official ITU brand blue per brand.itu.int. Migrated from `#1DA0DB` across `lib/theme.ts`, `app/globals.css`, `public/manifest.json`, `app/layout.tsx`, `electron/main.ts`, all admin + mission-control + waveform components, extension assets, and icon-generation scripts. The dark-mode tone is `#3FB4E2` (brighter for dark backgrounds).
- **Typography**: Noto Sans + Noto Sans Mono (matches ITU presentation deck).
- **Iconography**: lucide-react line icons, 12–28 px, ITU-blue stroke for section/meaning cues, neutral for plain affordances. Used in Settings section headers, MeetingList empty state, MeetingSummary recap header, and the transcript empty state.
- **PDF template**: the ITU PowerPoint deck the user provided is a stylistic reference for iconography + subtle brand cues, not a binding visual spec. Brand.itu.int is the authority.

---

## Personal vs Power mode

User-facing toggle in **Settings → Mode**. Persisted in `localStorage` as `dhvani-mode`.

```ts
// lib/mode.ts
type Mode = "personal" | "power";
COPY[mode] = { disclaimer, recapHeading, followUpsHeading, exportPrefix, bureauVisible, adminVisible, greetingPrefix }
```

**Personal mode** intentionally hides: reminder banner, TaskChecklist, WellnessIndicator, AudioModeCards picker, MeetingList calendar, AudioModeSelector. NavLinks reduced to Home + Notes. Defaults `chosenMode` to `"microphone"`. Recap heading becomes "What I heard", filename prefix becomes `recap-…`.

**Power mode**: full ITU surface (calendar, dashboard, Bureau tagging, admin). Recap heading "Meeting Summary", filename prefix `ITU-Meeting-Notes-…`.

Read via `useMode()` in any client component.

---

## Dark mode

`app/globals.css` declares colors as CSS variables under `:root` (light) and `html[data-theme="dark"]` (dark). `tailwind.config.ts` maps every Tailwind color token to `var(--xxx)`, so utilities flip automatically. A blocking inline script in `app/layout.tsx` `<head>` reads `localStorage.dhvani-theme` and applies `data-theme` before first paint.

**Previously broken, now fixed:** `app/download/page.tsx` was using inline `style={{}}` with hardcoded hex values and broke in dark mode. Rewritten this session with Tailwind utilities; also now handles the "no published artifact" case explicitly instead of silently falling back to the generic releases page.

**Guardrail**: anywhere a component uses `style={{ color: "#..." }}` it bypasses the CSS-variable system and will break dark mode. Treat as a regression.

---

## Storage backends

### Transcript JSON (shipped, live)

`lib/transcriptStorage.ts` is the public API. Picks backend at call time based on env:

- **Local filesystem** (default) — `./data/transcripts/<userId>/<id>.json`. Wiped on Web App redeploy.
- **Azure Blob** — picked when `AZURE_STORAGE_CONNECTION_STRING` (or `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY`) are set. Container `dhvani-transcripts`. Survives redeploys.

Settings drawer surfaces which backend is live via `/api/storage`.

### Voice audio (scaffolded, OFF by default)

`lib/azureBlobAudio.ts` + `app/api/audio/upload/route.ts`. Opt-in via `DHVANI_AUDIO_STORAGE=blob` in env. Needs legal/privacy review before being wired to `useAudioCapture`. Full setup guide at `docs/AZURE_BLOB_AUDIO_SETUP.md`. Layout: `audio/<userId>/<sessionId>/{manifest.json, chunk_NNNNN.webm}` inside a dedicated `dhvani-audio` container so retention lifecycle rules can be set independent of transcripts.

---

## Reliability (mobile audio pipeline)

- **Opus 24 kbps** via MediaRecorder; iOS Safari falls back to AAC via `pickSupportedMimeType()`.
- **Chunk size**: 1500ms default. Concurrent transcribes: 4.
- **OPFS atomic writes** — every chunk persisted to `/recordings/<sessionId>/chunk_NNNNN.webm` using tmp+rename.
- **IndexedDB shadow log** — second source of truth for chunk metadata.
- **Screen wake lock** acquired on record start, re-acquired on `visibilitychange`.
- **`navigator.storage.persist()`** requested on first record. **`navigator.storage.estimate()`** gates record start at 200 MB free.
- **Crash recovery** — `OrphanRecordingBanner` mounted in root layout. Shows "Unfinished recording from HH:MM" with Recover / Discard.
- **Silent auto-retry** — `useTranscription.ts` now does **5** exponential-backoff attempts per chunk (was 3). When a chunk finally fails, no user-facing toast fires; the chunk stays on OPFS and the `online`-event auto-resumer picks it up on reconnect. The "(N failed)" badge on the segments stat has been removed, along with the "Reconnected — auto-resuming N chunks" toast. User's mental model is "it heard me".
- **Delete-on-success** — chunks are deleted from OPFS as their transcribe call returns 200.

Constants in `lib/constants.ts`: `DEFAULT_CHUNK_DURATION_MS`, `MAX_CONCURRENT_TRANSCRIPTIONS`, `AUDIO_BITS_PER_SECOND`, `MIN_FREE_STORAGE_BYTES`.

---

## Calendar Transcribe flow (Addendum C)

`onStartFromMeeting(meeting)` in `app/page.tsx`:

1. `setActiveMeeting(meeting)` — stores the event tag.
2. Maps `meeting.platform` → audio source: Teams/Meet → `tab-audio`, Electron available → `electron`, Zoom → `virtual-cable`, else `microphone`.
3. Scrolls to top.
4. Does NOT start capture. The user has to tap Record.
5. Idle home shows a blue "Ready for: <subject>" banner with a × dismiss.

---

## Exports

Menu in `components/ExportMenu.tsx`. Options: Copy All · Copy as Markdown · .docx · .md · .txt · .srt · .json.

Filename uses `buildFilename(ext, { mode, title })` from `lib/exportUtils.ts`. Personal: `recap-<slug>-<date>.<ext>`. Power: `ITU-Meeting-Notes-<slug>-<date>.<ext>`. Legacy shape `dhvani-transcript-<date>.<ext>` when no mode is supplied.

---

## Handover docs produced this session

| File | Use |
|---|---|
| `HANDOFF.md` (this file) | Next session's starting context. |
| `docs/AZURE_BLOB_AUDIO_SETUP.md` | Activating voice-recording archival. |
| `docs/E2E_TESTING_PROMPT.md` | Paste into Cursor / desktop-GUI agent to run the full QA suite and produce a report. |
| `docs/CIO_ISD_HANDOVER.md` | Exec brief for CIO + ISD on scaling, production readiness, ownership transfer. |
| `docs/ROADMAP.md` | 12-month product roadmap once Dhvani graduates from the Innovation Hub. |
| `docs/STANDALONE_APPS_SPLIT.md` | Mega-prompt for splitting Dhvani into discrete apps if leadership prefers that shape. |

---

## Open / known issues (updated)

0. ✅ **Speaker identification was broken across chunks** — FIXED 2026-04-20 with a session-wide time-adjacency stitcher ([`lib/speakerStitcher.ts`](lib/speakerStitcher.ts)) and an inline merge UI on the transcript speaker list. Plan for voice-embedding replacement in [`docs/DIARIZATION_ROADMAP.md`](docs/DIARIZATION_ROADMAP.md).
0b. ✅ **Mobile-first record page** — FIXED 2026-04-20: ControlBar is fixed-bottom on mobile with iPhone safe-area inset, hero waveform strip when capturing, sticky header, swipeable SettingsDrawer, 44 px touch-target floor via `@media (pointer: coarse)` rule in [`app/globals.css`](app/globals.css).
0c. ✅ **iOS graceful degrade** — FIXED 2026-04-20: [`lib/platform.ts`](lib/platform.ts) + [`components/MobileCapabilityBanner.tsx`](components/MobileCapabilityBanner.tsx) preflight tab/system-audio requests on iOS, explain the WebKit limitation, and suggest the mic path. Storage-eviction banner surfaces when `navigator.storage.persist()` returns denied. Haptics (Android) on record start/stop. Native mobile path scoped in [`docs/MOBILE_NATIVE_ROADMAP.md`](docs/MOBILE_NATIVE_ROADMAP.md).
1. ✅ **`/download` page dark mode + artifact handling** — FIXED this session.
2. ✅ **Brand color swap to #009CD6** — DONE.
3. ✅ **Silent chunk retry** — DONE (5 retries, no user-facing failure toasts).
4. ✅ **Lucide line icons** — Settings sections, Transcript empty state, (MeetingList + MeetingSummary already had them).
5. **Two pre-existing ESLint warnings** in `app/page.tsx` lines ~174 + ~266 (`useCallback` missing-dep warnings for `setRateLimitMsg` and `setToast`). Safe to leave or fix in a polish pass.
6. **Voice-audio Blob upload** — server-side scaffolded but NOT wired into the capture pipeline. Needs privacy review + a consent UI in Settings before flipping on.
7. **Conferencing-app auto-detect** (Electron) — deferred; needs OS-level process polling + permission UX.
8. **A1 per-phrase live transcript layout** + **B yield-to-user auto-scroll** + **D9 Cmd+F in-transcript search** — deferred (all touch `TranscriptPanel`; safer in a focused refactor).
9. **D5 fuzzy library search** (Fuse.js) — deferred.
10. **D6 background-recording notification** (mobile/PWA) — deferred.
11. **D8 transcript section collapse** for long recordings — deferred.
12. **D12 onboarding example transcript** — deferred.
13. **D14 drag-to-reorder library tags** — deferred.
14. **Release pipeline for desktop binaries** — the /download page now handles missing assets gracefully, but there is no GitHub Actions workflow yet publishing `.dmg`/`.exe` per tag. See `docs/CIO_ISD_HANDOVER.md` "Production readiness" section.

---

## Conventions for the next session

- Don't reintroduce demo mode unless asked — Entra is the auth path.
- Don't add a backend server beyond Next API routes.
- Don't switch to Tauri / monorepo / BYOK — that experiment is parked at `itu-transcribe`.
- Don't bypass the CSS-variable color system — anywhere a component uses an inline `style={{ color: "#…"  }}` it will break dark mode. The `/download` fix above is the pattern to follow.
- **Don't introduce user-facing "N chunks failed" messaging.** Retry silently; log to `console.warn`; let OrphanRecoveryBanner be the manual-recovery surface.
- Run `tsc --noEmit` and `next lint` before committing. Two pre-existing useCallback warnings are acceptable; nothing else.
- Use absolute paths in tool calls — the parent dir `/Users/rahuljha/digital-tools` is itself a separate (empty) git repo.
- Commit messages: prose, why-over-what, no Co-Authored-By unless asked.

---

## Quick orientation prompt for a new session

> I'm continuing work on Dhvani at `/Users/rahuljha/digital-tools/Dhvani`, branch `wip/reliability-and-easy-wins`. Read `HANDOFF.md` at the repo root for full context. Uncommitted changes from the last session include the ITU #009CD6 color migration, /download page rewrite, silent chunk retry, lucide icons on Settings, the Azure Blob voice-audio scaffold, and the docs under `docs/`. Help me with [SPECIFIC THING].
