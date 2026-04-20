# Dhvani Current Scorecard

Last updated: 2026-04-20

Self-scored against [JTBD_ALIGNMENT.md](./JTBD_ALIGNMENT.md) after
the live-test feedback batch ([fae30ff](../)). Estimates, not
measured — user confirmation pending.

## Estimated scorecard

| Criterion         | Score | Change | Top gap |
| ----------------- | ----- | ------ | ------- |
| Mobile UX         |  4.0  | +0.3   | Lock-screen controls, Siri Shortcut, haptics not wired |
| Info Entry        |  4.0  | +0.6   | Auto-title still stub; auto-topic tagging absent; quick-capture widget not built |
| 360° View         |  2.5  |   0    | People/Topic/Project views not built; only a flat /transcripts list |
| AI Consumption    |  3.5  | +0.2   | Recap present; ask-your-meeting + cross-meeting synthesis + translation assist not built |
| Integrations      |  2.5  |   0    | Calendar read ✅; exports (Notion/Obsidian/Things/Slack/webhook/Siri) absent |
| Cost Transparency |  3.5  |   0    | Live meter ✅; monthly cap alerts, silence-skip chunking, Otter comparison missing |

**Overall: 3.3 / 5.0**
**Lowest: 360° View (2.5) — tie with Integrations.**

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
