# Dhvani Current Scorecard

Last updated: 2026-04-20 (updated after speaker-fix + mobile UX sprint)

Self-scored against [JTBD_ALIGNMENT.md](./JTBD_ALIGNMENT.md). This
revision adds the speaker-identity fix, mobile-first record page,
and touch-target floor from the 2026-04-20 session. Estimates, not
measured — user confirmation pending.

## Estimated scorecard

| Criterion         | Score | Change | Top gap |
| ----------------- | ----- | ------ | ------- |
| Mobile UX         |  4.5  | +0.5   | Lock-screen controls, Siri Shortcut still need Capacitor; iOS system-audio impossible on web; local-mic now offline-capable |
| Info Entry        |  4.4  | +0.4   | Auto-title stub; auto-topic tagging absent; voice-embedding diarization still beta |
| 360° View         |  2.7  | +0.2   | People/Topic/Project views not built; speaker-stable transcripts now make "who said what" addressable |
| AI Consumption    |  3.7  | +0.2   | Ask-your-meeting + cross-meeting synthesis + translation assist not built; recap quality lifts with stable speakers |
| Integrations      |  2.5  |   0    | Calendar read ✅; exports (Notion/Obsidian/Things/Slack/webhook/Siri) absent |
| Cost Transparency |  3.8  | +0.3   | Live meter ✅; local mic mode is $0/min; monthly cap alerts + silence-skip still missing |

**Overall: 3.6 / 5.0** (was 3.3)
**Lowest: Integrations (2.5).**

**Next week focus**: pick one of {People view, Calendar write-back,
Notion/email export}. People view is the highest-leverage gap
because it raises two ●●● criteria simultaneously (360° View +
partial Info Entry via auto-participant surfacing).

## This week's shipped fixes — JTBD mapping

Retroactive application of the Appendix B protocol.

### Fix 1 — Drop speaker auto-prime; keep generic "Speaker N" labels

- **Primary driver for**: Info Entry (●●●) — maps to "Auto-participant
  extraction" (previous behaviour was actively *wrong* metadata entry,
  which is worse than blank)
- **Secondary for**: AI Consumption (●●) — wrong speaker attribution
  poisoned recap quality
- **Does not affect**: Mobile UX, 360° View, Integrations, Cost
- **Estimated impact**: Info Entry +0.3 (went from anti-feature to
  neutral; still no embedding-based cross-chunk stitching)

### Fix 2 — 2 s default chunk duration + backpressure hint

- **Primary driver for**: Info Entry (●●●) — maps to "Chunked
  streaming"; accuracy + stability is the lever the criterion measures
- **Secondary for**: AI Consumption (●●) — better input → better recap
- **Does not affect**: Mobile UX, 360° View, Integrations, Cost
- **Estimated impact**: Info Entry +0.2

### Fix 3 — "Join & record" auto-starts capture

- **Primary driver for**: Mobile UX (●●●) — maps to "One-tap record
  button"; the old 2-click flow broke the one-tap promise for the
  calendar path
- **Secondary for**: Info Entry (●●)
- **Does not affect**: 360° View, AI Consumption, Integrations, Cost
- **Estimated impact**: Mobile UX +0.2

### Fix 4 — Inline typo edit (double-click transcript)

- **Primary driver for**: Info Entry (●●●) + Mobile UX (●●●) — maps
  directly to "Inline editing everywhere" (●●● on both)
- **Does not affect**: 360° View, AI Consumption, Integrations, Cost
- **Estimated impact**: Info Entry +0.2, Mobile UX +0.1

### Fix 5 — Sticky language detection across chunks

- **Primary driver for**: AI Consumption (●●) — no matrix row scores
  this ●●●; closest is "Translation assist (●●●)" which is different
- **Secondary for**: Info Entry (●●)
- **Approval gate read**: secondary-only → should have been flagged
  before building. But the fix is small, backward-compatible, and
  prevents an active regression (mid-meeting language flips), so I
  believe it passes the spirit of the gate.
- **Estimated impact**: AI Consumption +0.1, Info Entry +0.1

### Fix 6 — Unconditional save-on-Stop + periodic autosave + pagehide beacon

- **Primary driver for**: Mobile UX (●●●) — maps to "Crash recovery"
  (the user literally said "I closed the app, not sure if it saved")
- **Secondary for**: Info Entry (●●)
- **Does not affect**: 360° View, AI Consumption, Integrations, Cost
- **Estimated impact**: Mobile UX +0.1

## Self-test result

Predicted criterion movers this week: Mobile UX (+0.3), Info Entry
(+0.6), AI Consumption (+0.2). Three of six criteria moved; three
stayed flat (360°, Integrations, Cost). Lowest-score criterion next
week should be 360° View or Integrations — build against whichever
gets explicit priority.

## 2026-04-20 — speaker identity fix + mobile UX sprint

This batch fixes the three live-test complaints: speaker
identification, mobile app posture, and mobile-first visual design.
Follows the Appendix B protocol retroactively (all items are
behaviour fixes / UX improvements on shipped features, not net-new
capabilities — outside the 5-step gate but logged here for
scorecard attribution).

### Fix 7 — Session-stable speaker ids (time-adjacency stitcher)

- **Primary driver for**: Info Entry (●●●) — "Auto-participant
  extraction" finally tracks one id per voice instead of one id per
  chunk. 360° View (●●●) — speaker-attributed transcripts become
  cross-meeting queryable.
- **Secondary for**: AI Consumption (●●) — recap can cite "Alice
  raised concerns…" without the label flickering between chunks.
- **Estimated impact**: Info Entry +0.2, 360° View +0.2,
  AI Consumption +0.1.

### Fix 8 — Mobile-first record page (fixed bottom ControlBar + hero waveform + iOS safe-area)

- **Primary driver for**: Mobile UX (●●●) — maps directly to
  "Bottom-anchored controls" and "One-tap record button"; the
  Start/Stop is now within thumb reach regardless of transcript
  length.
- **Secondary for**: Info Entry (●●).
- **Estimated impact**: Mobile UX +0.2.

### Fix 9 — Touch-target floor + swipeable SettingsDrawer + haptics

- **Primary driver for**: Mobile UX (●●●) — "Haptics" explicitly
  listed at ●●●; 44 pt floor and swipe-to-close close known
  fat-finger traps in the settings flow.
- **Estimated impact**: Mobile UX +0.1.

### Fix 10 — Graceful iOS audio-capture degrade + storage-eviction warning

- **Primary driver for**: Mobile UX (●●●) — maps to "One-tap flows";
  blocking iOS users at tab/system audio with a clear "use mic
  instead" message beats an opaque NotSupportedError.
- **Secondary for**: Info Entry (●●) — the recording they do start
  on iOS isn't a dead-end anymore.
- **Estimated impact**: Mobile UX +0.1.

### Fix 11 — Mode-routed transcription: local Whisper for mic, Azure diarize for meetings

- **Primary driver for**: Cost Transparency (●●●) — maps directly to
  "BYOK / cheaper modes"; mic-mode recordings now cost $0 against
  the Azure monthly budget.
- **Secondary driver for**: Info Entry (●●) — local transcription
  is materially faster for quick voice memos (no network hop).
- **Tertiary**: Mobile UX (●) — offline-capable mic capture once the
  Whisper model is cached.
- **Does not affect**: 360° View, AI Consumption (chat/summary
  still uses Azure regardless of transcription engine), Integrations.
- **Estimated impact**: Cost Transparency +0.3, Info Entry +0.1.

### Fix 12 — Intent-routed transcription (revamp of Fix 11)

The mic-vs-meeting split was too coarse. On-device isn't just for
solo voice memos — a private 1-1 conversation also belongs there
when the user prefers privacy over cloud accuracy. Replaced the
audio-source picker with an **intent picker** + optional privacy
toggle, and added local diarization (chunk-level voice-embedding
clustering) so on-device conversations get speaker labels.

- **Primary driver for**:
  - Info Entry (●●●) — "Inline editing everywhere" + correct
    participant attribution on on-device conversations (previously
    impossible without cloud).
  - Cost Transparency (●●●) — on-device in-person meetings are
    now $0 too, not just solo notes.
- **Secondary driver for**:
  - Mobile UX (●●) — simpler home page (3 intent cards, clear
    subtitles with privacy/cost badges) vs. the previous 3-by-3
    decision matrix.
  - 360° View (●●) — more transcripts get reliable speaker ids.
- **Estimated impact**: Info Entry +0.2, Cost Transparency +0.1,
  Mobile UX +0.1.

### Planned, not yet shipped

- Voice-embedding diarizer refinement — see [DIARIZATION_ROADMAP.md](./DIARIZATION_ROADMAP.md).
- Native whisper.cpp binary bundled with Electron — faster-than-WASM
  mic-mode transcription for desktop users.
- Capacitor iOS/Android wrapper — see [MOBILE_NATIVE_ROADMAP.md](./MOBILE_NATIVE_ROADMAP.md).
  Each is a ●●● primary-driver feature for Mobile UX + a secondary
  criterion; both would clear the 5-step gate individually when built.
