# Dhvani — From Innovation Pilot to ITU's Default Transcription Tool

**Author:** Dhvani team
**Audience:** Director / CIO / ISD leadership
**Horizon:** 12 months
**Ask:** 2 engineers + 0.5 designer for 9 months (~$400k all-in), plus four unblocks listed at the end.

---

## 1. The claim

ITU does not need to **buy** a transcription tool. ITU needs a transcription tool that is **native to how ITU actually works**: six UN languages, Study Group acronyms, delegate attribution, formal record outputs, Outlook/Teams/SharePoint on every desk, data staying inside the ITU tenant. Dhvani already has the engine. In 12 months, with the plan below, Dhvani becomes the tool every ITU staff member, delegate, and observer reaches for — and the first to be requested by sister UN agencies.

Commercial tools (Otter, Fathom, Rev, Teams' built-in) are English-first, don't know ITU vocabulary, don't integrate with ITU's calendar or document pipeline, can't produce ITU-format records, and charge per-seat at prices that don't scale to 10,000 staff. Dhvani runs inside ITU's Azure tenant for under **$2/user/month** fully loaded.

---

## 2. Vision in one sentence

> When someone at ITU needs to capture what was said — in a WTSA plenary, a Bureau coordination call, a field interview, or a two-person chat — they open Dhvani, and what comes out the other end looks like an ITU document, in the language it was spoken, with the right delegates credited.

---

## 3. The ITU advantage — what no off-the-shelf product can do

| Capability | Commercial SaaS | Dhvani (planned) |
|---|---|---|
| Six UN languages, mid-sentence code-switch | Weak or English-only | First-class |
| ITU vocabulary: SG-17, WTSA, CPM, RRB, PP, TD | Treated as noise | Pre-loaded default |
| Delegate recognition by country/role | Generic "Speaker 1" | "Canada (Chair)", "Secretariat" |
| Formal output templates (ITU-T summary record, ITU-R CPM, verbatim, Bureau memo) | Generic transcript | Native templates |
| Outlook/Teams/SharePoint integration | Limited | Calendar → transcribe → SharePoint → Planner |
| Data residency in ITU Azure tenant | No | Yes |
| Retention + audit under UN compliance | Vendor-controlled | ITU-controlled |
| Per-user cost at 10k users | $$$ | ≤$2/mo |
| Cross-language live translation display | No | Q4 target |

This is the story for the boss, CIO, and any Bureau director in one table.

---

## 4. Phased plan

### Phase 1 — Polish & Trust (Weeks 0–4)

**Goal:** the current branch goes to 50 beta users at HQ without a single embarrassing moment.

**Must ship:**
- Merge `wip/reliability-and-easy-wins` to `main`. Tag `v1.0.0-rc1`.
- Azure Blob transcript storage turned ON in prod; Entra + secrets migrated to Key Vault.
- App Insights live with the five north-star metrics (active users, success rate, time-to-first-entry, recap rate, cost/user).
- GitHub Actions release pipeline produces signed `.dmg` + `.exe` per tag; the `/download` page always resolves to a real installer.
- Full E2E suite run once; fix every A and B finding.
- WCAG 2.2 AA audit; one screen-reader user walk-through.
- Onboarding flow: a 60-second first-record welcome that gets a user their first transcript without reading docs.
- **One polish pass** that makes the app feel premium (detail list in §6).

**Metric at end of phase:** 50 beta users, no P1 incident, net-promoter-score >30, sign-off from ISD to declare v1.

### Phase 2 — ITU-native (Weeks 5–12)

**Goal:** the first demo where an ITU person says "oh, this is actually made for us".

**Must ship:**
1. **Multilingual robustness**
   - Per-chunk language hint (not per-session).
   - Code-switch detection (English ↔ French ↔ Arabic most common at ITU).
   - RTL rendering correct for Arabic; Chinese rendering tuned.
   - Target: a WTSA session with speakers in 3 languages, each captured in their own language, with a toggleable gloss in English.
2. **ITU vocabulary pack**
   - Pre-loaded acronyms for Study Groups, Working Parties, Bureaux, common conferences, major Resolutions.
   - Shipped as a default — no setup step.
   - Admin UI to extend with Bureau-specific terms.
3. **Delegate recognition**
   - Attendee list pulled from the Outlook invite on meeting start.
   - Speaker turns mapped to `Country (Role)` — e.g. `Kenya`, `France (Chair)`, `Secretariat`, `ITU-T/SG-17`.
   - Voice fingerprint (opt-in, per user, local) for cross-meeting persistence.
4. **Formal export templates**
   - ITU-T summary record
   - ITU-R CPM report
   - ITU-D discussion notes
   - Plenary verbatim (for Member-State sessions)
   - Bureau internal memo
   - User picks template at export; output is a proper `.docx` with header, footer, page numbers, TOC.
5. **Meeting directory integration**
   - Saved transcripts auto-tagged with Study Group, Question, Bureau, mandate.
   - Hierarchical navigation in the Library.

**Metric at end of phase:** 500 active users. Two Study Groups using Dhvani as primary tool. One director quote for marketing.

### Phase 3 — Workflow integration (Weeks 13–26)

**Goal:** Dhvani feels like part of ITU, not a separate tool.

**Must ship:**
1. **Outlook add-in**: a "Transcribe this meeting" button on calendar invites.
2. **Teams bot** (pending CIO policy approval): joins as a passive participant, transcribes, delivers to the organizer.
3. **SharePoint sync**: transcripts + action items auto-land in a Bureau-owned library, categorized.
4. **Planner/Tasks**: extracted action items become assigned tasks with due dates.
5. **Email digest**: "Yesterday you had 3 meetings; 7 action items assigned to you; 2 due this week."
6. **Document pipeline**: export directly into ITU-T/R/D document systems as draft TDs.
7. **Mobile-native polish**: first-class phone experience (not a shrunk desktop).

**Metric at end of phase:** 2,000 active users. 30% of internal Teams meetings auto-transcribed. First external agency (UNDP/UNICEF/WHO) requesting access.

### Phase 4 — Intelligence (Weeks 27–52)

**Goal:** post-meeting value exceeds the meeting-itself value.

**Must ship:**
1. **Library search + filters**: fuzzy search across everything you've recorded.
2. **Ask Dhvani**: personal RAG over your meeting history — "what did SG-17 decide about post-quantum?"
3. **Meeting analytics** per Bureau:
   - Talk-time equity (who speaks, for how long, which countries)
   - Decision velocity (questions raised vs closed)
   - Recurring topic trends
4. **Live translation view**: French speaker → English subtitles during live recording.
5. **Automatic decision log** per Study Group — curated from transcripts.
6. **Accessibility**: live captions in the recording view; sign-language interpreter coordination cue.
7. **Federated Dhvani** (stretch): single-sign-on for other UN agencies.

**Metric at end of phase:** 3,000 MAU. Cost <$2/user/month. 99.5% availability. First external Member State requesting access.

---

## 5. "Wow" demo — a single 5-minute story for the boss

Script. Write this on a card. Run it before any decision meeting.

1. **09:58** — open Outlook calendar. A "Transcribe" button sits on a Teams invite titled *SG-17 Rapporteur Group · Security*. Click.
2. **09:58** — Dhvani opens at `/?meeting=<id>`. Banner: *"Ready for: SG-17 Rapporteur Group · Security · starts in 2 min."* Audio source auto-set to Teams tab.
3. **10:00** — meeting starts. Transcript fills live. Speakers labeled `Kenya`, `France (Chair)`, `Secretariat`.
4. **10:04** — a delegate switches to French mid-sentence. Transcript captures the French faithfully; a small gloss-in-English toggle is visible.
5. **10:47** — meeting ends. Banner: *"Meeting ended. Generate summary?"*. Click **ITU-T summary record**. One page of formal markdown appears; download as `.docx` — it has an ITU header, TOC, and page numbers.
6. **17:00** — email digest: *"From today's SG-17 meeting: 3 decisions, 4 action items assigned, 2 are yours."* Click through → Dhvani Library opens to the meeting.
7. **Next week** — type in Dhvani's command palette: *"what did we decide about spectrum allocation for IMT-2030 this year?"*. Dhvani returns a cited summary linking the three meetings where it came up.

No commercial tool does this demo today. That's the point.

---

## 6. UI/UX improvements that make it feel premium

These are the visible shifts that make the boss say "this looks like a real product, not a pilot."

**First 30 seconds (onboarding)**
- A 60-second welcome flow that records a 10-second self-introduction and shows the transcript appearing live. Ends with a confetti microinteraction + "Welcome to Dhvani."
- Default to Personal mode for the first session; surface Power mode after the second recording.

**Recording surface**
- Live waveform with speaker-color highlighting (speaker 1 blue, speaker 2 teal, ...).
- A single, large "breathing" Start button that pulses while recording. Not a rectangle — a circle.
- Status bar shows `00:12:34 · 3 speakers · 22 MB saved safely · $0.08 so far` — one line, tabular numerals.
- Keyboard: `Cmd+K` opens a command palette (Raycast-style). `?` shows shortcuts.
- Esc closes any drawer; Cmd+, opens settings.

**Transcript panel**
- Speaker pill shows country flag + role when recognized (`🇰🇪 Kenya`, `🇫🇷 France · Chair`).
- Multilingual split view: side-by-side when a speaker switches language.
- Search with Cmd+F inside transcript.
- Pin a line (star icon). Pinned lines float at the top of the Recap.
- Live "listening…" dots are already there — good; keep them, but replace the text with a calmer affordance.

**Empty states (currently bland)**
- Not just an icon + sentence. A small illustration (ITU-blue line art), a primary CTA, a secondary learn-more link.
- "No meetings today" → "Invite Dhvani to a meeting: paste a link or connect Outlook."

**Recap**
- Formal-document-style preview. Looks like an ITU TD: header, date, participants, summary, decisions, action items, next steps, footer.
- Hover over any bullet → the source transcript lines highlight.
- Side-by-side view: transcript (left) + formal record (right).

**Library (saved transcripts)**
- Cards not rows. Each card: date, meeting subject, Bureau badge, duration, cost, action-item count.
- Filter chips: Bureau, Study Group, language, has-decisions.
- Fuzzy search at top; result weights title > decisions > body.

**Admin dashboard**
- Executive summary: today's cost, week's cost, top 5 Bureaus, anomalies.
- One chart: cost by Bureau over time.
- One leaderboard: most active users this month.
- Do NOT surface per-user usage to anyone but the user themselves (privacy).

**Typography + brand**
- Noto Sans tuned with tabular numerals + slightly tighter heading kerning.
- ITU blue (#009CD6) used sparingly — as an accent, not a wash.
- Dark mode as a designed product, not an auto-inverted one. Specifically: off-black surfaces, muted ITU-blue, deliberate status colours.
- A top 3-pixel ITU-blue rule on every page (already shipped) — keep it, it's the one brand signature.

**Microcopy**
- "Processing 3 chunks" → "Transcribing 4 seconds of audio".
- "Meeting ended" → "Done listening."
- Error states in plain language (already partially done via `azureErrorMessages.ts`; finish the set).

**Mobile**
- Phone viewport is not "desktop smaller". Record button fills the thumb zone. Transcript scrolls separately. Settings is a bottom sheet, not a sidebar.

**Install-to-home-screen moment**
- After a user's third successful recording, a dismissible card: "Install Dhvani for offline recording and faster start." Actually worth installing.

---

## 7. Function / capability wishlist (prioritized)

Phase 2 + Phase 3 feature list by value and effort — for ruthless scope control.

| Feature | Value | Effort | Phase |
|---|---|---|---|
| Multilingual code-switch | ★★★★★ | Large | 2 |
| ITU vocabulary pack | ★★★★★ | Small | 2 |
| Delegate recognition | ★★★★★ | Medium | 2 |
| Formal export templates | ★★★★ | Medium | 2 |
| Outlook add-in | ★★★★ | Medium | 3 |
| Teams bot | ★★★★ | Large (+policy) | 3 |
| Library search + fuzzy filter | ★★★ | Small | 2 |
| Command palette (Cmd+K) | ★★★ | Small | 2 |
| Mobile-native polish | ★★★ | Medium | 3 |
| Ask Dhvani (personal RAG) | ★★★★ | Medium | 4 |
| Meeting analytics per Bureau | ★★★ | Medium | 4 |
| Live translation view | ★★★★ | Large | 4 |
| SharePoint sync | ★★★ | Small | 3 |
| Planner/Tasks integration | ★★ | Small | 3 |
| Email digest | ★★★ | Small | 3 |
| Federated (other UN agencies) | ★★ | Large (+policy) | 4+ |

Do not ship anything not in this list without a written case.

---

## 8. Distribution & change management

Best feature set loses to worst change management. Budget real time for this.

- **Champions program**: one named advocate per Bureau + per large Study Group. Quarterly champions call.
- **Seed with leadership**: the ten most senior meeting owners use Dhvani for 30 days and publicly note it. Their outputs become reference examples.
- **"Transcribed by Dhvani" badge** on formal records — quietly advertises the tool.
- **Office-hours** weekly for the first 90 days after each phase.
- **Metrics dashboard** shared monthly with Bureau directors — peer pressure is real.
- **Exit survey** every 90 days → tight feedback loop.

---

## 9. Success metrics at 12 months

- **Reach:** 3,000 monthly active users across HQ + regional offices.
- **Penetration:** ≥50% of internal Teams meetings transcribed via Dhvani (vs Teams' own).
- **Quality:** mis-labeled-speaker rate <5% on the ITU eval set; >90% code-switch segments correct.
- **Cost:** <$2/user/month all-in.
- **Reliability:** 99.5% availability, p95 chunk latency <6s, 99% sessions complete error-free.
- **Expansion:** first external UN agency formally requesting access.
- **Adoption signal:** three unsolicited mentions of Dhvani in a Bureau director meeting.

---

## 10. Risks and honest mitigations

| Risk | Mitigation |
|---|---|
| Multilingual quality plateau | Dedicated eng-month in Phase 2 on per-language prompt tuning + eval harness. |
| Teams bot blocked by M365 policy | Raise to CIO in month 3; product works without it. |
| LLM cost drift | Per-user daily cap + monthly org cap already enforced; PTU at 10k users. |
| Privacy pushback on voice archival | Voice archival is OFF; product works without it; turn on only with legal sign-off. |
| Adoption plateau | Champions + leadership seeding; office hours; peer pressure dashboard. |
| Bus factor | HANDOFF.md + runbooks + 2 engineers (not 1). |
| Sister-agency interest creates federation pressure early | Defer to Phase 4; say "yes but not yet". |

---

## 11. What the boss needs to unblock

Five decisions to make this plan real:

1. **Budget approval:** 2 engineers FTE + 0.5 designer for 9 months (~$400k all-in, well under the cost of a commercial tool at ITU scale).
2. **Azure OpenAI TPM increase request** to 500K per region.
3. **Entra app registration migration** to ISD-owned registry (otherwise we can't issue production-grade tokens).
4. **Privacy sign-off pathway** for voice archival (scaffolded, not wired).
5. **One named Bureau director** as executive sponsor and first champion.

If the boss says yes to these five, we commit to the plan. Everything else we'll figure out.

---

## 12. The 14-day starter list (what happens on Monday)

Actionable items that don't need any approvals — every one of these can ship in 14 days from today.

- [ ] Land the current session's branch to `main` after commit + PR review.
- [ ] Stand up App Insights, wire the five north-star metrics.
- [ ] Draft the "Welcome to Dhvani" 60-second onboarding.
- [ ] Ship the ITU vocabulary pack v1 (handcurated list of 150 acronyms).
- [ ] Add the Cmd+K command palette (hooks into existing shortcuts).
- [ ] Write the E2E test report against the current build.
- [ ] Produce a 5-slide deck of the §5 demo for the boss meeting.
- [ ] Identify five executive beta users and send the invite.
- [ ] Draft the Phase 2 eng plan and present it in the next staff meeting.

End of plan.
