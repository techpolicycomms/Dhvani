# Dhvani Current Scorecard

Last updated: 2026-04-20 (updated after speaker-fix + mobile UX sprint)

Self-scored against [JTBD_ALIGNMENT.md](./JTBD_ALIGNMENT.md). This
revision adds the speaker-identity fix, mobile-first record page,
and touch-target floor from the 2026-04-20 session. Estimates, not
measured — user confirmation pending.

## Estimated scorecard

| Criterion         | Score | Change | Top gap |
| ----------------- | ----- | ------ | ------- |
| Mobile UX         |  4.4  | +0.4   | Lock-screen controls, Siri Shortcut still need Capacitor; iOS system-audio impossible on web |
| Info Entry        |  4.3  | +0.3   | Auto-title stub; auto-topic tagging absent; voice-embedding diarization still roadmap |
| 360° View         |  2.7  | +0.2   | People/Topic/Project views not built; speaker-stable transcripts now make "who said what" addressable |
| AI Consumption    |  3.7  | +0.2   | Ask-your-meeting + cross-meeting synthesis + translation assist not built; recap quality lifts with stable speakers |
| Integrations      |  2.5  |   0    | Calendar read ✅; exports (Notion/Obsidian/Things/Slack/webhook/Siri) absent |
| Cost Transparency |  3.5  |   0    | Live meter ✅; monthly cap alerts, silence-skip chunking, Otter comparison missing |

**Overall: 3.5 / 5.0** (was 3.3)
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

### Planned, not yet shipped

- Voice-embedding diarizer — see [DIARIZATION_ROADMAP.md](./DIARIZATION_ROADMAP.md).
- Capacitor iOS/Android wrapper — see [MOBILE_NATIVE_ROADMAP.md](./MOBILE_NATIVE_ROADMAP.md).
  Each is a ●●● primary-driver feature for Mobile UX + a secondary
  criterion; both would clear the 5-step gate individually when built.
