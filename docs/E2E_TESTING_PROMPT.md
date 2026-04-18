# Dhvani — End-to-End Testing Mega-Prompt

Paste the body below into a desktop-GUI-control agent (Cursor's
computer-use agent, Claude's desktop-control mode, Playwright + a
vision agent, etc.) to exercise every intended Dhvani flow against a
live build. The agent should run the suite and produce the report
described at the end.

Assumptions before you run it:
- The dev server is up on `http://localhost:3000` (or a staging URL — pass it in).
- The machine has a working microphone and, for tab-audio tests, a browser that supports `getDisplayMedia({ audio: true })` (Chrome/Edge on macOS/Windows).
- Microsoft Entra creds for a test account are available (pass through env).
- Node 20+, Playwright 1.44+, and `ffmpeg` on PATH if you opt into the audio-injection strategy.

---

## The mega-prompt (copy this into the controlling agent)

```
You are a QA agent exercising Dhvani, an internal ITU meeting-transcription PWA. Your job: run every user-visible flow end-to-end through the actual browser UI (no direct API calls unless a step says so), record what you observe, and produce a structured test report. You control a desktop — use mouse/keyboard/screen primitives.

ENVIRONMENT
- Target URL: ${DHVANI_URL}  (default http://localhost:3000)
- Test user: ${TEST_USER_EMAIL} / Entra MFA handled out of band — if MFA challenges, escalate as a blocker.
- Sample meeting audio (Opus 24 kbps, 2 min, two speakers): fixtures/sample_meeting.webm
- Screenshot everything at each checkpoint. Save recordings of each test run.
- Both light and dark theme must be tested. Reload with `localStorage.dhvani-theme = "dark"` then reload to flip.

TESTS (run in order — some state carries forward)

1. AUTH + HOME
   1.1 Visit ${DHVANI_URL}. Expect Entra sign-in redirect. Sign in.
   1.2 Landing should show the Dhvani header with ITU-Blue (#009CD6) top rule, the mic/record button, and either the calendar list (Power) or bare record surface (Personal).
   1.3 Toggle Settings → Mode to the opposite value. Reload. Expect the UI to reshape (Personal hides calendar, wellness, task checklist, mission control, nav beyond Home + Notes).
   1.4 Flip theme to dark in Settings → Appearance. Nothing should render invisible, unclickable, or keep a light-mode background (common regressions: /download, /admin, any new page).
   ACCEPT: No WCAG AA contrast failures visible in the header, Settings drawer, home card, transcript empty state.

2. BROWSER-ONLY RECORDING (microphone)
   2.1 With Personal mode: click Start. Grant mic. Speak for ≥90 seconds ("the quick brown fox..." etc., long enough to force ≥30 chunks at 1.5s cadence).
   2.2 While recording, toggle the tab to another window for 5 seconds. Return.
   2.3 While recording, briefly disable Wi-Fi for 10 seconds. Re-enable.
   2.4 Stop. Verify:
     - Transcript panel shows entries with speaker labels (at least "Speaker 1").
     - No toast says "chunk N was lost" or "X chunks failed" — failures must be silent to the user.
     - Segments counter shows the chunk count with no "(N failed)" suffix.
     - After reconnect in 2.3, any chunks captured offline are retried silently and appear within 30s.
   2.5 Click "Wrap up" / "Generate Summary". Wait for completion.
     - Expect structured markdown (## Summary, ## Decisions, ## Action Items) in Power mode; "What I heard" phrasing in Personal mode.
     - Expect ≥1 action item parsed into the ActionItems list if the audio mentions any follow-up.

3. TAB-AUDIO RECORDING (Power mode)
   3.1 Switch to Power mode. Open a YouTube clip in another tab that has clear speech.
   3.2 Click the tab-audio mode card → Start → share the YouTube tab with audio.
   3.3 Let it run ~60 seconds, stop.
   3.4 Verify transcript has content and the Source stat reads "Tab Audio".

4. VIRTUAL-CABLE MODE (only if BlackHole or VB-Cable is installed)
   4.1 In Settings → Audio Input Device pick BlackHole 2ch.
   4.2 Play known audio through BlackHole. Start capture in virtual-cable mode.
   4.3 Stop, verify transcript.

5. CRASH RECOVERY
   5.1 Start a microphone recording; after ~30 seconds, force-kill the browser (do NOT click Stop).
   5.2 Relaunch browser → open Dhvani. The OrphanRecordingBanner must appear within 3 seconds of landing.
   5.3 Click Recover. Expect the transcript to fill in from the saved chunks within 30 seconds.
   5.4 Repeat 5.1 but click Discard. Banner dismisses; no transcript produced.

6. CALENDAR → TRANSCRIBE FLOW
   6.1 Confirm Settings → Calendar sync shows "Connected".
   6.2 On the home page, a MeetingList with today's online events should render. If empty, ensure the empty state shows the Calendar icon + the "No meetings today" copy.
   6.3 For an in-progress event, click "Join & record". Expect the banner "Ready for: <subject>" + audio source auto-set to tab-audio (or electron if in desktop build).
   6.4 Start, record ~30s, Stop. The transcript's meeting metadata (in /transcripts/<id>) should carry the subject, organizer, and platform.

7. EXPORTS
   7.1 In a finished transcript, open Export.
   7.2 Download .docx, .md, .txt, .srt, .json. Verify:
     - Filenames follow mode convention — Personal: recap-<slug>-<date>.<ext>; Power: ITU-Meeting-Notes-<slug>-<date>.<ext>.
     - .docx in Personal mode has "Private notes — Dhvani" footer. In Power it reads "ITU · Internal working notes".
     - .srt has correct monotonic timecodes.
   7.3 Copy All + Copy as Markdown both place correct content on the clipboard.

8. /download PAGE (recently fixed)
   8.1 Visit /download in both light and dark theme.
   8.2 In each: text must be legible on its background, every button clickable, and the "Use in Browser" card present.
   8.3 If GitHub Releases has no .dmg/.exe asset, expect a visible "Not available yet" state — NOT a link to the generic releases page masquerading as a download. If assets exist, the .dmg/.exe buttons must resolve to real URLs.

9. SILENT CHUNK RETRY
   9.1 Start recording. Use dev-tools Network → throttle to "Offline".
   9.2 Record 45s. Toggle back online.
   9.3 Expect: no mid-record toast alarming the user; within 30s of reconnect, all chunks appear in the transcript; orphan banner does NOT appear for this session once recovery finishes.

10. DARK MODE SWEEP
    Run through each route: /, /transcripts, /transcripts/<id>, /tasks, /mission, /admin (if admin), /download, /shared/<token>, /offline, /desktop-setup, /url-transcribe, /upload, /auth/signin.
    Each must be WCAG AA legible in dark mode. Inline hex-color styles are banned — flag any surface that clearly uses them.

11. KEYBOARD SHORTCUTS
    Cmd+R toggles record. Cmd+, opens Settings. Esc closes drawer. Shortcuts must NOT fire while focus is in an input/textarea/select (unless it's Cmd+,).

12. ACCESSIBILITY SPOT CHECKS
    - Tab through the home surface — every interactive element reachable.
    - Screen-reader the Start button — announces "Start recording" or equivalent.
    - No button below 36×36 px touch target on mobile viewport (375×667).

REPORT FORMAT (produce this at the end)

# Dhvani E2E Test Report — <ISO date> — <commit sha>

## Environment
- URL, commit SHA, browser + OS, test account hash.

## Summary
| # | Area | Pass | Partial | Fail |
| ... |

## Findings
For each failure or partial:
  ### [A|B|C severity] Short title
  - Test ID: N.m
  - What happened (one sentence).
  - Expected vs observed (two lines).
  - Screenshot/recording links.
  - Repro steps (numbered).
  - Suspected area of code (best guess, optional).

Severity rubric:
  A = blocks a core flow (record, stop, transcribe, save, sign in)
  B = degraded experience in a common flow (dark-mode bug, export typo)
  C = polish / UX nit.

## Regression watch
Items that passed here but are historically flaky; keep in the next run.

## Environment notes
Anything off about the test machine (mic quality, audio routing setup).

END REPORT
```

---

## Tips for the controlling agent

- If MFA blocks login, pause and surface a blocker report item — do NOT try to bypass.
- Record the full session (video + network HAR) for any A-severity finding; attach in the report.
- If a step is skipped (e.g. no BlackHole), list it under `## Skipped` with the reason rather than silently passing.
- Re-run the full suite against both Web App and Electron desktop builds; tag which one each finding came from.
- Treat any inline `style={{ ... }}` hex-color stylings that surface in dark mode as a regression against the CSS-variable guardrails.

---

## Running unattended (optional)

A headless variant runs Playwright without GUI control. It cannot exercise true system-audio routing, so it substitutes a deterministic audio file piped via `ffmpeg` into a virtual mic driver. See `scripts/e2e/` (to be created) when unattended runs become a CI requirement.
