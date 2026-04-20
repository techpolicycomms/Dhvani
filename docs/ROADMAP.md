# Dhvani — Product Development Roadmap

**Horizon:** 12 months from handover to ISD.
**Framing:** outcome-based. Each quarter has an explicit problem statement, a small set of must-ship outcomes, and the non-goals that stop scope creep.
**Ownership:** ISD Platform is accountable for running; ITU Innovation Hub advises until Q4; Product lead coordinates with CIO monthly.

**Strategic posture:** *make the meeting part of Dhvani invisibly good, then expand into the ambient knowledge-worker surface area the transcript unlocks*. Do not chase feature parity with Otter or Fathom. Chase the ITU-specific workflow that generic tools cannot — Bureau tagging, multilingual delegate speech, calendar-gated compliance, and a clear audit story for an internationally regulated workplace.

---

## North-star metrics (weekly)

- **Active users** (≥ 1 recording this week).
- **Successful-recording rate** (sessions that end with a saved transcript / sessions started).
- **Time-to-first-transcript-entry** (median ms from tap-Start to first row on screen).
- **Meeting-to-recap rate** (sessions where the user hit Generate Summary).
- **Cost per user-month** (Azure OpenAI + storage).

Baseline measurement is the first thing ISD instruments post-handover.

---

## Quarter 1 — **Operational maturity** (ship the hand-off)

**Problem:** the product works but isn't operated. Users complain quietly. A single bug window loses a week of trust.

**Must ship:**
- App Insights instrumentation end-to-end; the five north-star metrics live on a weekly dashboard.
- Release pipeline for web + desktop, with codesigning (see CIO handover).
- Auto-tests for the critical path (auth → record → save → export).
- Voice-audio archival — consent UI + privacy policy fully wired (if ISD approves).
- /download page always resolves to a real installer link within 24 hours of a tag.

**Non-goals (do not do this quarter):**
- No new modalities, no new LLM features, no UI overhauls.

**Definition of done:** ISD runs an on-call rotation; 90 days without a P1 incident.

---

## Quarter 2 — **Transcript quality & speaker intelligence**

**Problem:** a 30-minute transcript with mis-labeled speakers is worse than no transcript. Delegates also switch languages mid-sentence; we lose them.

**Must ship:**
- **Speaker persistence across chunks** — stopgap shipped 2026-04-20: a session-wide time-adjacency stitcher (see [`lib/speakerStitcher.ts`](../lib/speakerStitcher.ts) and [DIARIZATION_ROADMAP.md](./DIARIZATION_ROADMAP.md)) and an inline merge UI on the transcript panel. Voice-embedding based identification (the real fix) is the next step — on-device ECAPA-TDNN via `@xenova/transformers`, cosine-similarity clustering, feature-flagged rollout.
- **Code-switch robustness** — detect mid-utterance language changes (EN↔FR↔ES are the common ITU cases) and feed the right language hint per chunk rather than per session.
- **ITU vocabulary pack** — ship a default VocabularyManager preset covering ITU acronyms (SG, WG, CPM, PP, etc.) so the first transcript any new user sees already says "SG-17" instead of "SG17" or "Essgee Seventeen".
- **Recap quality eval harness** — a small benchmark suite of real ITU meetings with human-graded summaries; measure drift as we tune prompts.

**Non-goals:** training a model, building a custom ASR.

**Definition of done:** mis-labeled-speaker rate < 5% on the eval set; code-switched segments captured correctly in ≥ 90% of cases.

---

## Quarter 3 — **Knowledge surface (post-meeting)**

**Problem:** transcripts die in a folder. The value is in what they unlock — search across meetings, task tracking, institutional memory.

**Must ship:**
- **Dhvani Library: fuzzy search + filters** across all saved transcripts (per-user). Fuse.js client-side, scoped to the signed-in user.
- **"Ask across my meetings"** — a private RAG over the user's own transcript history. Uses the existing Azure OpenAI deployments.
- **Task digest** — a daily email (or Teams message) summarising open action items from the last 7 days of meetings.
- **Shareable summary pages** with an ITU-tenant-locked sharing model (no external links unless the admin explicitly enables).

**Non-goals:** org-wide knowledge base, cross-user search, public sharing.

**Definition of done:** 50% of weekly active users trigger at least one post-meeting query per week.

---

## Quarter 4 — **Enterprise & scale polish**

**Problem:** 10× user growth exposes things that 100 users tolerated.

**Must ship:**
- **Dedicated Azure OpenAI PTU** instead of shared quota, if usage justifies.
- **Admin dashboard v2**: usage by Bureau, cost by Bureau, spike detection, anomaly alerts.
- **Full WCAG 2.2 AA audit** + remediation, including live captioning in the recording view for accessibility.
- **Meeting-protocol integrations**: Teams bot that can join a meeting as a participant, record permission handled, transcripts delivered to the organizer (this is a significant engineering item; may spill into the following year).
- **Org-level retention policy enforcement** — one place to set "90-day delete" and have it apply to transcripts + audio uniformly.

**Non-goals:** mobile-native app (the PWA is the mobile app).

**Definition of done:** 99.9% availability SLO met for 90 days consecutively.

---

## Year 2 and beyond (directional, not committed)

- Multilingual real-time translation view (display French speaker's words in English alongside the original, latency-permitting).
- Dhvani for offline/low-bandwidth field teams (fully local, on-device small model for transcription; reconcile on reconnect).
- Integration with ITU document management — drop a transcript into an existing document workspace with action items auto-filed.
- Structured-output schemas (JSON-first) for machine consumers who want to pipe meeting output into other ITU systems.
- Multi-tenant / federated deployment for sister UN agencies (UNDP, UNICEF, WHO) who've asked.

Leadership decision point at end of Q4: continue as one integrated super-app vs. split into several specialised apps (see `docs/STANDALONE_APPS_SPLIT.md`).

---

## How this roadmap will be kept honest

- Monthly roadmap review with CIO + ISD Director + Product lead.
- Each quarter's outcomes become numeric: we score 0/1 on "shipped, metric moved" at the end of the quarter.
- Anything not in the current quarter is not being worked on. No parallel side-projects.
- A missed quarter triggers a root-cause review, not a "slip to next quarter".

---

## Risks & assumptions

| Risk | Mitigation |
|---|---|
| Azure OpenAI pricing changes materially | Quarterly cost-model review; prepared to move to PTU at 10k users. |
| ITU legal/privacy pushes back on voice archival | Product works without voice archival; feature is guarded behind an off-by-default flag. |
| Teams bot integration blocked by Microsoft 365 admin policy | Q4 scope item; escalate to CIO at month 9 if not in motion. |
| User growth outpaces runway | Per-user caps + monthly org caps already enforced. |
| Key engineer leaves | Handover doc + runbooks mitigate. Bus factor is the single largest risk for Q1. |
