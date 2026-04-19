# Dhvani — Cursor End-to-End Test Protocol

A structured test plan for Cursor's in-browser agent to exercise every
surface against a local dev server. Clickable buttons, flows, expected
limits, known-broken items, and the report format the agent must
produce.

**Run against:** `http://localhost:3000` (dev server already running)
**Auth:** Microsoft Entra SSO — test account must have Calendars.Read
**Browser:** Chromium-based (needs `getDisplayMedia` + `getUserMedia`)

---

## 0. Agent preflight

Paste this into Cursor as the opening prompt:

> You are testing Dhvani, an internal ITU meeting-transcription web app.
> Target URL: `http://localhost:3000`. Follow
> [docs/CURSOR_E2E_TEST.md](docs/CURSOR_E2E_TEST.md) in order. For each
> test: navigate, perform the action, observe, record a verdict
> (PASS / PARTIAL / FAIL / SKIPPED / KNOWN-LIMIT), capture screenshots
> of anomalies. Do **not** skip tests marked KNOWN-LIMIT — verify the
> system communicates the limit clearly; a silent failure is a bug.
> At the end, produce the report in the format at the bottom of the
> protocol.

**Environment check first** — before anything else:

1. `GET http://localhost:3000/api/health` → expect 200 JSON with a status field.
2. `GET http://localhost:3000/` → expect 307 redirect to `/api/auth/signin` (if unauthenticated) or 200 (if already authed).
3. Observe devtools Network tab for any unexpected 4xx / 5xx on first page load.

---

## 1. Hard limits (memorize — many tests check the system respects + communicates these)

| Limit | Value | Enforced where | Expected UX when hit |
|---|---|---|---|
| Per-chunk audio upload | 25 MB | `app/api/transcribe/route.ts:110` | Client auto-chunks ≥25 MB uploads; single-chunk overflow → 413 with helpful message |
| Per-chunk transcribe timeout | 60 s | `app/api/transcribe/route.ts:17` (Vercel `maxDuration`) | Chunk fails → client retries (5× exp backoff) |
| URL-transcribe fetch timeout | 90 s | `app/api/url-transcribe/route.ts:96` | Client surfaces "timed out fetching URL" |
| URL-transcribe total | 120 s | `app/api/url-transcribe/route.ts:15` | Edge-case: huge files will hit this before chunks finish |
| Rate limit per user | 60 min/hr, 240 min/day | `lib/rateLimiter.ts:17-18` | 429 with Retry-After; UI surfaces "You've reached your transcription limit" |
| Org monthly budget | $500 | `lib/rateLimiter.ts:19` | 429 with reason `org-month`; UI: "Monthly transcription budget reached. Contact IT." |
| Concurrent transcribe requests | 4 | `lib/constants.ts:18` | Excess chunks queue client-side; status bar shows `in flight: 4, in queue: N` |
| Minimum free OPFS storage to start recording | 200 MB | `lib/constants.ts:30` | Start button disabled / friendly error |
| Audio chunk cadence | 1.5 s default (1 – 15 s range) | Settings → Chunk Duration | Lower = faster appearance, higher = better speaker tracking |
| Upload accepted formats | `.mp3 .mp4 .wav .m4a .webm .ogg .flac .aac` | `app/upload/page.tsx:13` | File picker filters; unsupported → 400 from server with file-type error |

---

## 2. Known non-bugs (do NOT file these as failures)

These are documented limits the user has already flagged or the product intentionally doesn't support. A test marked KNOWN-LIMIT should verify the system returns a **clear, actionable error** — silence IS a bug.

| # | Behaviour | Status | Verify the error says |
|---|---|---|---|
| K1 | **YouTube URL to `/url-transcribe`** returns 501 | Not yet supported | Error JSON says `"YouTube URLs are coming soon. For now, download the audio file and paste the direct .mp3/.mp4 URL, or use /upload."` |
| K2 | **Google Drive URL** returns 501 | Not yet supported | Same pattern as K1 with "Google Drive" |
| K3 | **Vimeo URL** returns 501 | Not yet supported | Same pattern as K1 with "Vimeo" |
| K4 | **`.exe` / `.dmg` unsigned** → Gatekeeper / SmartScreen warnings | Pending code-signing certs | `/download` page banner explains `xattr -cr` workaround for macOS |
| K5 | **Voice-audio archival** to Azure Blob is OFF by default | Requires privacy review | Transcript JSON saves; audio blob does not |
| K6 | **System audio in browser** (non-Electron) → needs virtual cable OR "Share tab audio" | Browser limitation | "Browser tab" mode works; "Meeting" mode only in desktop app |
| K7 | **Deterministic speaker-to-name mapping** is not available | Needs Teams bot integration (Phase 3) | Speaker picker sources names from Outlook invite as one-click hints |
| K8 | **Live translation view** | Phase 4 roadmap | Not present in UI yet |

---

## 3. Authentication flow

### Test 3.1 — Fresh sign-in

1. Open incognito/private window at `http://localhost:3000`
2. Expect redirect to `/api/auth/signin` → click "Sign in with Microsoft"
3. Microsoft login (handled out-of-band if MFA)
4. Expect redirect back to `/`
5. Verify: header shows user avatar initials; no console errors

**Pass:** signed-in, lands on `/`.
**Fail:** PKCE error (`InvalidCheck: pkceCodeVerifier`), stuck in redirect loop, or blank page.

### Test 3.2 — Sign out

1. Open Settings drawer (⚙ icon top-right)
2. Scroll to bottom → click **Sign out**
3. Expect redirect to sign-in page

**Pass:** back at /api/auth/signin, session cleared.

---

## 4. Home page (`/`)

### Test 4.1 — Mode toggle (Personal vs Power)

1. Settings → Mode → click **Personal**
2. Observe: calendar list, task checklist, wellness indicator, mission-control badges all disappear; nav reduces to **Home + Notes**
3. Toggle back to **Power** → full surface returns

**Pass:** mode switch visibly reshapes the UI.

### Test 4.2 — Theme toggle

1. Settings → Appearance → **Dark**
2. Full page should repaint with dark background, ITU blue still visible, no text invisible on white
3. Reload — theme persists (no flash-of-light on first paint)

**Pass:** dark mode WCAG-readable on every visible element. **Fail:** any surface with inline hex colors that stays light.

### Test 4.3 — Start a **Microphone** recording

1. Ensure Personal mode + "Just me" mic selected (default in browser)
2. Click the large Record button → grant mic permission
3. Speak into the mic for 30 seconds
4. Watch status bar: `Segments: N`, `in flight: <4`, `in queue: <N`
5. Transcript panel fills with speaker-labelled entries
6. Click **Stop**

**Pass:** transcript has ≥1 entry; no stuck queue.
**Fail:** queue accumulates past 10 with no progress (indicates API error — check `/api/transcribe` in Network tab for the actual status).

### Test 4.4 — Start a **Browser tab** recording

1. Switch mode to **Browser tab** in the segmented control
2. Click Record → browser picker appears → pick a tab with audio (open YouTube in another tab first) → **check "Share audio" box**
3. Let it run 30 s, stop
4. Verify Source stat reads "Browser tab"

**Pass:** transcript populates.
**Fail / HINT:** if empty transcript → user probably didn't tick "Share audio" — verify error message clearly says so.

### Test 4.5 — Meeting mode (desktop-only)

**SKIP** in web browser — Meeting mode is an Electron-only capability. The "Meeting" segmented button is hidden when `window.electronAPI?.isElectron` is false.

In web: the picker should only show **Just me**, **Browser tab**, **Virtual cable**.

### Test 4.6 — Stop-then-Record starts fresh session

1. Record 5 s → Stop (transcript on screen)
2. Immediately click Record again
3. **Expected:** previous transcript disappears, new session starts empty, previous transcript auto-saved to `/transcripts` history

**Pass:** transcript resets between sessions. **Fail:** chunks appended to previous transcript.

### Test 4.7 — Speaker picker

1. After any recording with ≥1 speaker detected
2. Sidebar: find "Speakers" → click **Name** next to Speaker 1
3. Expect picker: "Who is this?" with your name (bold, first) + any Outlook attendees + "Someone else…" option
4. Click a name → all turns from that voice-cluster re-label
5. Click Name again on same speaker → picker allows **Change**

**Pass:** one-click rename works; custom entry fallback also works.

### Test 4.8 — Keyboard shortcuts

| Shortcut | Expected |
|---|---|
| `Cmd/Ctrl+R` | Toggles record on/off |
| `Cmd/Ctrl+,` | Opens/closes Settings drawer |
| `Esc` | Closes the Settings drawer or any open modal |

Type text in an input field and press `Cmd+R` — shortcut should NOT fire (focus-aware).

### Test 4.9 — "Ready for: meeting" banner (Power mode + calendar)

1. Power mode, calendar sync on
2. Home should show a MeetingList if any events are on the Outlook calendar today
3. Click a meeting card → "Join & record" / "Start" / "Set up" depending on timing
4. Main pane shows blue banner `Ready for: <subject>` with × dismiss
5. Record button now seeds speaker map with attendees

**Pass:** banner appears; attendees feed into the speaker picker.

---

## 5. Transcript panel

### Test 5.1 — Live autoscroll

1. Start a recording that produces multi-line transcript
2. Panel should auto-scroll to newest entry
3. Manually scroll up during recording — autoscroll **should pause**
4. A small **"Latest"** button should appear at the bottom-right
5. Click it → jumps to newest, resumes autoscroll

**Pass:** yield-to-user scroll works. **Partial:** button appears but doesn't jump correctly — degraded but not blocking.

### Test 5.2 — In-transcript search

1. After 20+ entries, type a word into the transcript search box
2. Matching entries filter in place; matches are highlighted
3. Clear the search → full transcript returns

**Pass:** filter works, highlight visible.

### Test 5.3 — Pin entries

1. Hover any entry → star icon appears
2. Click → entry gets an amber left-bar + filled star
3. Pinned entries are referenced in the recap (if summary is re-run)

**Pass:** pin visual state persists for the session.

### Test 5.4 — Jump to timestamp

1. Click the `[mm:ss]` timestamp on any entry
2. URL updates with a hash fragment (copy-able)
3. Reload with hash → scrolls to that entry

---

## 6. Recap + Action Items

### Test 6.1 — Generate Summary

1. Stop a recording ≥30 s long
2. Click the recap card "Generate Summary" / "Wrap up"
3. Loading state shows `Loader2` spinner + "Analyzing your meeting..."
4. Within 10-20 s: summary markdown appears with `## Summary`, `## Decisions`, etc.
5. Action Items section (with ListChecks icon) populates if actionable items detected

**Pass:** markdown renders, action items extracted.

### Test 6.2 — Copy summary

1. Click **Copy** icon in recap header → Check icon flashes
2. Paste into a text editor → markdown preserved

### Test 6.3 — Share via email

1. Click **Mail** icon → system mail client opens with `subject=Meeting Summary: <title>` and the summary prefilled in body

### Test 6.4 — Regenerate

1. Click **RefreshCw** icon → new summary replaces old (different phrasing typical)

### Test 6.5 — Action item completion

1. Click checkbox next to any action item → item fades, completion rate updates on next Mission Control visit

---

## 7. Exports

### Test 7.1 — All formats, Personal mode

Record something short, then Export menu:

| Format | Expected filename pattern | Verify content |
|---|---|---|
| Copy All | (clipboard) | Full transcript with `[mm:ss] Speaker: text` per line |
| Copy as Markdown | (clipboard) | `## Speaker` headings, one paragraph per turn |
| `.docx` | `recap-<slug>-<YYYY-MM-DD>.docx` | Personal footer: "Private notes — Dhvani"; minimal header |
| `.md` | `recap-<slug>-<YYYY-MM-DD>.md` | Plain markdown, no frontmatter |
| `.txt` | `recap-<slug>-<YYYY-MM-DD>.txt` | Plain text, one blank line between turns |
| `.srt` | `recap-<slug>-<YYYY-MM-DD>.srt` | Monotonic timecodes `00:00:01,500 --> 00:00:04,200`; increasing indices |
| `.json` | `recap-<slug>-<YYYY-MM-DD>.json` | Array of `{id, timestamp, speaker, text, rawSpeaker}` |

### Test 7.2 — Power-mode `.docx` upgrade (UN conventions)

Switch to Power mode, export `.docx`:
- Title page has a preamble with: Document ID, Bureau / Group, Meeting subject, Date & time range, Duration, Chair, Participants, "Prepared by: Dhvani — ITU Innovation Hub", automated-transcription disclaimer
- Numbered sections: `1. Meeting Summary`, `2. Action Items`, `3. Transcript (verbatim)`
- Page break before the transcript
- Each transcript turn starts `¶N · Speaker · timestamp` in bold gray
- Footer reads "ITU · Internal working notes"
- Filename: `ITU-Meeting-Notes-<slug>-<YYYY-MM-DD>.docx`

**Pass:** all elements present. **Fail:** any missing.

---

## 8. Library (`/transcripts`)

### Test 8.1 — List + filters

1. Navigate to `/transcripts`
2. Verify list shows saved transcripts newest-first
3. Search box filters by title/meeting subject (in-memory)
4. Date filter: 7d / 30d / all
5. Platform badge visible (Teams/Meet/Zoom) when tagged

### Test 8.2 — Open a transcript

1. Click any item → opens `/transcripts/<id>`
2. Shows transcript, speaker legend, recap if saved, action items, meeting metadata
3. Back button returns to the list

### Test 8.3 — Delete a transcript

1. From list, click delete (trash icon)
2. Expect confirmation prompt
3. Accept → item removed from list; DELETE call to `/api/transcripts/<id>` returns 200
4. `Undo2` button appears briefly? (Check if undo is implemented)

### Test 8.4 — Share

1. Click Share icon → ShareModal opens
2. Copy link → paste in incognito → loads `/shared/<token>` with read-only transcript
3. Tokens should expire or be revokable

---

## 9. `/upload` (file transcription)

**Limits to verify each scenario:**
- Accepted extensions: `.mp3 .mp4 .wav .m4a .webm .ogg .flac .aac`
- Auto-chunks files larger than 25 MB into 25-MB pieces
- No explicit total-file cap in the client, but per-chunk quota + rate limit apply

### Test 9.1 — Upload a small audio file (< 25 MB)

1. Navigate to `/upload`
2. Drag-drop OR click to select a `.mp3` / `.m4a` file (provide a test clip — 1-2 min sample)
3. Progress bar advances; transcript fills
4. After completion: options to save / export / copy

**Pass:** transcript appears; no stuck progress.

### Test 9.2 — Upload a larger audio file (> 25 MB)

1. Select a ~50 MB audio file
2. Client should split into 2 chunks and upload sequentially (see `const chunks: Blob[] = []` loop)
3. Progress advances through all chunks
4. Final transcript concatenates both parts

**Pass:** single transcript stitched from multiple chunks.

### Test 9.3 — Upload a **video file** (`.mp4`)

1. Select a `.mp4` with spoken audio
2. Expected: **audio track extracted** and transcribed
3. If the endpoint rejects video → verify error clearly says so + suggests extracting audio

**Known issue user flagged:** video upload to get transcribe does not work. Verify:
- Does the form accept the `.mp4`?
- Does `/api/transcribe` return a meaningful error?
- If it returns 400 "Invalid file type. Expected an audio file." but the form allowed `.mp4` → that's an inconsistency bug (file-picker allows video, server rejects). **File as bug.**

### Test 9.4 — Reject unsupported file

1. Try uploading a `.txt` or a `.jpg`
2. File picker should block OR the client should show a clear error before starting

---

## 10. `/url-transcribe`

**Known limits (do NOT file as bugs — verify the error is clear):**

### Test 10.1 — YouTube URL (KNOWN-LIMIT K1)

1. Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → click Transcribe
2. Expected: **501 response with message "YouTube URLs are coming soon. For now, download the audio file and paste the direct .mp3/.mp4 URL, or use /upload."**
3. UI must surface this message legibly — not silently fail, not throw a generic 500

**Pass:** 501 + clear message. **Fail:** anything else (silent fail, generic 500, or accepting the URL and hanging).

### Test 10.2 — Google Drive URL (KNOWN-LIMIT K2)

1. Paste a Drive share link → 501 with "Google Drive URLs are coming soon..."

### Test 10.3 — Vimeo URL (KNOWN-LIMIT K3)

1. Paste a Vimeo link → 501 with "Vimeo URLs are coming soon..."

### Test 10.4 — Direct `.mp3` URL (happy path)

1. Paste a direct link to a `.mp3` (find a public sample: `https://file-examples.com/wp-content/storage/2017/11/file_example_MP3_700KB.mp3`)
2. Fetch begins (90 s timeout)
3. Transcription runs
4. Transcript appears

**Pass:** works. **Fail:** timeout, generic error, or silence.

### Test 10.5 — Malformed URL

1. Paste `not-a-url` → expect 400 with validation error

### Test 10.6 — URL to non-media (e.g. an HTML page)

1. Paste `https://example.com/` → expect 400 with "not audio/video content" error

---

## 11. `/tasks`

1. Navigate to `/tasks`
2. Header has **ListChecks** icon in a pale-blue tile
3. Shows tasks extracted from every meeting summary
4. Each task: description, assignee, due date (if any), completion checkbox
5. Toggle a task → completion saves; visit `/mission` → completion rate updates

**Pass:** tasks render and persist toggles.

---

## 12. `/mission`

1. Navigate to `/mission`
2. Header has **Rocket** icon in pale-blue tile
3. **Rank card** (dark navy gradient) with Crown icon, streak Flame icon, XP progress bar, ITU-blue gradient
4. **Four stat cards** with lucide icons (Mic, CheckCircle2, Clock, BarChart3) in pale-blue tiles
5. **Wellness indicator** (may be empty if no activity)
6. **Badges grid** with Award icon in header; earned badges highlighted in ITU-blue-pale, locked badges faded

**Pass:** all lucide icons render, no stray emoji. **Fail:** any 🛰️ / 📡 / ⏱️ / 📊 emoji surviving in stat cards.

---

## 13. `/download`

1. Navigate to `/download`
2. See three cards: Use in Browser / Mac App / Windows App
3. **Internal-beta banner** visible: "Unsigned. First launch on macOS: …" with the `xattr -cr` command
4. Mac App card → links to `/downloads/Dhvani-0.1.0-arm64.dmg` (HTTP 200)
5. Windows App card → links to `/downloads/Dhvani-Setup-0.1.0.exe` (HTTP 200)
6. Click Use in Browser → returns to `/`

**Pass:** no "Not available yet" state; all three cards have real links.

---

## 14. `/admin` (only if test account is in `ADMIN_EMAILS`)

1. Navigate to `/admin`
2. If not admin → expect 401/redirect
3. If admin:
   - Usage dashboard loads
   - Emissions graph renders
   - Org-intelligence panel shows k-anonymised insights
   - No raw user PII exposed

---

## 15. Settings drawer surfaces

Open Settings (⚙ or Cmd+,). Verify every section:

| Section | Icon | Control | Test |
|---|---|---|---|
| Mode | Briefcase | Personal / Power radio | Flip; UI reshapes |
| Appearance | Palette | Light / System / Dark radio | Flip; theme changes |
| Where notes are stored | Database | Info text | Reads "Server local disk · wiped on redeploy" in dev |
| Language | Languages | Dropdown | 10+ options |
| Chunk Duration | Sliders | Slider 1s–15s | Drag; status bar updates |
| Audio Input Device | Mic | Dropdown | Lists system mics |
| Calendar sync | Calendar | Toggle | On/off |
| Vocabulary | (none) | List + add/delete | Add a term; verify it's stored |
| Role profile | UserCircle2 | Role chip + Change button | Edit role |
| Privacy | ShieldCheck | OrgInsightsOptIn toggle | Toggle |
| Your Carbon Footprint | Leaf | Stats card | Numbers render |
| Admin link (admins only) | — | Button → /admin | Navigate |
| Clear Current Session | Trash2 | Confirmation flow | Requires 2 clicks |
| Sign out | LogOut | Action | Logs out |
| About | ExternalLink | GitHub link | Opens |

---

## 16. Rate limit + quota handling

### Test 16.1 — Hit per-user hourly cap

This is hard to trigger naturally. Simulate by lowering the limit temporarily:

```bash
# In the dev server env (restart dev server):
RATE_LIMIT_MINUTES_PER_HOUR=1 npm run dev
```

1. Record for 65 seconds
2. Expect 429 response from `/api/transcribe` with:
   - `Retry-After` header
   - Body: `{ error: "You've reached your transcription limit. Try again in 1 minute(s).", reason: "user-hour" }`
3. UI should surface this as a toast or banner — **must not be silent**

### Test 16.2 — Hit monthly budget

Similar: set `RATE_LIMIT_MONTHLY_BUDGET_USD=0.01` → first transcribe hits `org-month`:
- Error: "Monthly transcription budget reached. Contact IT."

---

## 17. Accessibility quick-checks

Use Chrome DevTools Lighthouse with "Accessibility" checked. Run on:
- `/`
- `/transcripts`
- `/download`
- `/mission`
- `/admin` (if available)

Expected: Lighthouse score ≥ 90 on each; no color-contrast failures on the header, record button, or transcript panel.

Keyboard-only navigation:
- Tab through home → every interactive element reachable
- Focus rings visible (not removed)
- `aria-label` on icon-only buttons (record, settings, close)

---

## 18. Known-broken to verify are broken (AND communicate clearly)

The user has flagged these — verify each one **fails predictably with a clear message**:

1. `/url-transcribe` with YouTube URL → 501 + "YouTube URLs are coming soon..." (see 10.1)
2. `/upload` with `.mp4` video → should either extract audio OR error clearly. If it errors, verify the message names the file type and suggests conversion. (see 9.3)

If any of these fails silently, throws a generic 500, or hangs indefinitely → **file as a bug, do not dismiss as KNOWN-LIMIT.**

---

## 19. Cross-session persistence

1. Record a transcript, save to history
2. Close the browser entirely
3. Reopen `/transcripts` → transcript is there
4. Click it → full content loads

## 20. Orphan recording recovery

1. Start a recording
2. In a separate terminal: `kill -9 <browser pid>` OR force-quit the browser
3. Reopen Dhvani
4. Within 3 seconds: **OrphanRecordingBanner** appears: "Unfinished recording from HH:MM — Recover / Discard"
5. Click Recover → chunks fed back through transcription pipeline; final transcript appears within 30 s

**Pass:** orphan banner appears; recover succeeds.

---

## REPORT FORMAT

At the end of the run, produce this report. One file, paste-ready.

````markdown
# Dhvani E2E Test Report — <ISO date> — commit <sha>

## Environment
- URL: http://localhost:3000
- Browser + OS:
- Test account (email hash):
- Run duration:

## Summary
| # | Area | Pass | Partial | Fail | Skipped | Known-limit verified |
|---|---|---|---|---|---|---|
| 3 | Auth | . | . | . | . | . |
| 4 | Home | . | . | . | . | . |
| 5 | Transcript panel | . | . | . | . | . |
| 6 | Recap + Actions | . | . | . | . | . |
| 7 | Exports | . | . | . | . | . |
| 8 | Library | . | . | . | . | . |
| 9 | Upload | . | . | . | . | . |
| 10 | URL transcribe | . | . | . | . | . |
| 11 | Tasks | . | . | . | . | . |
| 12 | Mission | . | . | . | . | . |
| 13 | Download | . | . | . | . | . |
| 14 | Admin | . | . | . | . | . |
| 15 | Settings | . | . | . | . | . |
| 16 | Rate limits | . | . | . | . | . |
| 17 | A11y | . | . | . | . | . |
| 19 | Persistence | . | . | . | . | . |
| 20 | Orphan recovery | . | . | . | . | . |

## Severity rubric
- **A** blocks a core flow (record / stop / transcribe / save / sign in)
- **B** degraded experience in a common flow (dark-mode bug, export defect, unclear error on a known-limit)
- **C** polish / UX nit

## Findings
For each failure or partial:
### [A|B|C] Short title
- Test ID: N.m
- What happened (one sentence)
- Expected vs observed (two lines)
- Screenshot: <path>
- Network: <status + body snippet for any 4xx/5xx>
- Repro steps (numbered)
- Suspected code location (best guess)

## Regression watch
Items that passed here but are historically flaky.

## Environment notes
Anything off about the test machine (mic quality, dev server restart during run, etc.)

END REPORT
````

---

## Tips for the Cursor agent running this

- Do not skip KNOWN-LIMIT tests — they verify error clarity, not feature presence.
- If the dev server log shows a stack trace, include the first 5 lines in the finding.
- If a test requires calendar data and the test account has no events today, mark SKIPPED with reason.
- Screenshots: always capture the full page on FAIL, and the error toast on PARTIAL.
- If you hit a test where the environment is wrong (e.g. needs admin but your account isn't), mark SKIPPED with reason — do not guess.
- Produce the report even if you only get through half the protocol — partial data is more useful than no data.
