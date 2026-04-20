# Feature spec: People view

JTBD gate output, Steps 1–2. Awaiting Step 3 approval before any code
is written.

## Step 1 — Proposal

Add a **People view** at `/people` (and a `/people/[name]` detail
page) that indexes every transcript in the signed-in user's library
by the humans who appear in them, so the user can open one person and
see every meeting they've been in, everything they said, every action
item assigned to them, and when they last appeared.

## Step 2 — Justification

```
Feature:            People view
Primary driver for: 360° View (●●●)
Secondary for:      Info Entry (●●)
Tertiary for:       AI Consumption (●) — unlocks future per-person summaries
Does not affect:    Mobile UX, Integrations, Cost Transparency
Estimated impact:   360° View +1.0, Info Entry +0.3
```

Matrix row it corresponds to: `People view · ●·●●·●●●·●●·•·•` in
[JTBD_ALIGNMENT.md](../JTBD_ALIGNMENT.md). One build moves two
criteria, and — most importantly — it unlocks three downstream
`●●●` features on 360° View that all depend on a people index
existing:

- Follow-up inbox (needs: "action items assigned to X")
- Cross-reference intel (needs: "where has person X appeared before")
- Timeline view (needs: "order meetings by date per person")

Without a People view, those three stay blocked.

## What "done" looks like for the MVP

| | Shipped | Not shipped in MVP |
| --- | --- | --- |
| Route | `/people` list; `/people/[slug]` detail | — |
| List view | All people with name + meeting count + last seen | Filters, sort |
| Detail view | Meetings this person attended, grouped by month; top 10 quotes; action items assigned to them; export button | AI summary of "what this person cares about" (separate gate) |
| Data sources | (1) `meeting.organizer` from each saved transcript; (2) `speakerNames` values (renamed speakers); (3) `actionItems[].assignee` | Calendar attendee list (needs schema extension — see below) |
| Deduplication | Case-insensitive exact-match + trimmed-whitespace merge | Fuzzy matching ("Marion B." → "Marion Bignier") |
| Empty states | "No people yet — transcripts with a named speaker or meeting organizer will populate this list." | — |

## Why this is MVP-shippable without schema changes

Every person source already lives in existing saved transcripts:

- `SavedTranscript.meeting.organizer` → [lib/transcriptStorage.ts:67](../../lib/transcriptStorage.ts#L67) (already persisted)
- `SavedTranscript.speakerNames` → [lib/transcriptStorage.ts:82](../../lib/transcriptStorage.ts#L82) (already persisted)
- `SavedTranscript.actionItems[].assignee` → [lib/transcriptStorage.ts:73](../../lib/transcriptStorage.ts#L73) (already persisted)

So the People view is a pure read-side aggregation. No storage
migration. No save-path changes. If attendee-list persistence is
needed for a later pass, it's additive.

## Minimal implementation plan

1. `lib/peopleIndex.ts` — new module. One function: given the list of
   saved transcripts for a user, return `People[]` where each entry
   is `{ name, slug, transcripts: SavedTranscriptMeta[], actionItems,
   quotes, lastSeen }`.
2. `app/people/page.tsx` — server component. Calls `listTranscripts(userId)`,
   passes through `peopleIndex()`, renders the list.
3. `app/people/[slug]/page.tsx` — server component. Same source; filters
   to one person.
4. `components/PersonCard.tsx` — list row.
5. Nav entry (Home / Notes / **People**) in the header for Power mode.
   Hidden in Personal mode by default (per existing mode pattern).
6. Add a `qa:sweep` route: `/people`.

Estimated size: ~400 LOC of new code, zero schema churn, ~4–6 hours
of focused work.

## Risks

- **Name collision.** Two different people both named "John" collapse
  into one. MVP: show a "(2 sources)" hint when the slug collides;
  full disambiguation is a v2.
- **Noisy speaker renames.** If the user renames "Speaker 1" to
  something like "me", the People view would show "me" as a person.
  Mitigation: a small ignore-list of junk strings.
- **Scale.** A heavy user might have 500 transcripts × 8 speakers each
  = ~4k people records. MVP builds the index on every page load;
  switch to a cached server-side index if p50 render > 200 ms.

## Self-score prediction (to verify in Step 4)

After People view ships, the scorecard should read:

| Criterion         | Before | After | Δ    |
| ----------------- | ------ | ----- | ---- |
| Mobile UX         | 4.0    | 4.0   |  0   |
| Info Entry        | 4.0    | 4.3   | +0.3 |
| 360° View         | 2.5    | 3.5   | +1.0 |
| AI Consumption    | 3.5    | 3.5   |  0   |
| Integrations      | 2.5    | 2.5   |  0   |
| Cost Transparency | 3.5    | 3.5   |  0   |

Overall: 3.3 → 3.55.

## Step 3 — Approval gate (pending)

Primary driver for ≥1 criterion? **Yes** (360° View ●●●).

Awaiting human approval to proceed to Step 4 (build + self-test).
