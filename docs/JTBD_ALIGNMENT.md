# Dhvani JTBD Alignment Framework

Authoritative reference for **what we build and why**. Every feature in
Dhvani must map to at least one Jobs-To-Be-Done criterion at `●●●`
(primary driver) before it gets built. If it can't be mapped, it
doesn't ship.

## Criteria

| Criterion          | What it measures |
| ------------------ | ---------------- |
| Mobile UX          | One-tap flows, haptics, lock screen, bottom-anchored controls |
| Info Entry         | Time from "had a thought" to "captured correctly" — title, participants, tags, typos |
| 360° View          | Cross-meeting/people/project visibility; search, follow-ups, timeline |
| AI Consumption     | Recap, chat-with-transcript, highlights, translation, briefings |
| Integrations       | Calendar, extension, Notion/Obsidian/Things, Slack, webhooks, Siri |
| Cost Transparency  | BYOK, live meter, caps, cheaper modes, silence skip |

Legend: `●●●` primary driver · `●●` secondary · `●` tertiary · `·` none.

## Feature-to-criterion matrix

```
                                    Mobile  Info  360°  AI   Integ  Cost
FEATURE                             UX      Entry View  Cons Tools

CORE RECORDING
  One-tap record button            ●●●     ●●●   ·     ·    ·      ·
  Offline recording (R1–R6)        ●●●     ●●    ·     ·    ·      ●
  Opus 24kbps compression          ●●      ·     ·     ·    ·      ●●●
  Crash recovery                   ●●●     ●●●   ·     ·    ·      ·
  Chunked streaming                ●●      ·     ·     ●●   ·      ●●
  System audio capture (desktop)   ·       ●●●   ●     ·    ●●●    ·
  Tab audio capture (web)          ●       ●●    ·     ·    ●●     ·

METADATA & ENTRY
  Auto-title suggestion            ●●      ●●●   ●     ●●   ·      ·
  Auto-participant extraction      ●       ●●●   ●●●   ●●   ·      ·
  Auto-topic tagging               ·       ●●●   ●●    ●●   ·      ·
  Inline editing everywhere        ●●●     ●●●   ·     ·    ·      ·
  Share-to-Dhvani extension        ●●●     ●●●   ·     ·    ●●     ·
  Paste URL to transcribe          ●       ●●●   ·     ●    ●●     ·
  Quick capture widget             ●●●     ●●●   ·     ·    ●●     ·
  Bulk library operations          ●       ●●●   ●●    ·    ·      ·

AI CONSUMPTION
  Recap: 30-sec skim               ●●      ·     ·     ●●●  ·      ·
  Recap: 2-min read                ●       ·     ·     ●●●  ·      ●
  Recap: full analysis             ·       ·     ●     ●●●  ·      ·
  Ask-your-meeting chat            ●       ·     ●●    ●●●  ·      ·
  Intelligent highlights           ●●      ●●    ●●    ●●●  ·      ·
  Reading mode (chapters)          ●●      ·     ●     ●●●  ·      ·
  Cross-meeting synthesis          ·       ·     ●●●   ●●●  ·      ·
  Pre-meeting briefings            ●●      ●●    ●●●   ●●●  ●●     ·
  Post-meeting intelligence        ●       ·     ●●●   ●●●  ·      ·
  Translation assist (FR↔EN)       ●       ·     ·     ●●●  ·      ·

360° VIEW
  People view                      ●       ●●    ●●●   ●●   ·      ·
  Topic view                       ●       ●●    ●●●   ●●   ·      ·
  Project view                     ·       ●●    ●●●   ●    ·      ·
  Unified search                   ●●●     ●●    ●●●   ●●   ·      ·
  Follow-up inbox                  ●●●     ●●    ●●●   ●●   ●      ·
  Timeline view                    ●       ·     ●●●   ·    ·      ·
  Cross-reference intel            ·       ·     ●●●   ●●   ·      ·

INTEGRATIONS
  Calendar read (Outlook/Google)   ●●      ●●●   ●●    ·    ●●●    ·
  Calendar write-back              ·       ●●    ·     ·    ●●●    ·
  Browser extension Meet/Teams     ●       ●●    ·     ·    ●●●    ·
  Notion export                    ·       ·     ·     ·    ●●●    ·
  Obsidian export                  ·       ·     ·     ·    ●●●    ·
  Things / Todoist follow-ups      ·       ●●    ●     ·    ●●●    ·
  Slack recap post                 ●       ·     ·     ·    ●●●    ·
  Email recap                      ●       ·     ·     ·    ●●●    ·
  Google Drive / OneDrive .docx    ·       ·     ·     ·    ●●●    ·
  Webhook support                  ·       ·     ·     ·    ●●●    ·
  Siri Shortcut                    ●●●     ●●    ·     ·    ●●●    ·

COST TRANSPARENCY
  BYOK Azure keys                  ·       ·     ·     ·    ·      ●●●
  Live cost meter                  ·       ·     ·     ·    ·      ●●●
  Monthly cap alerts               ·       ·     ·     ·    ·      ●●●
  Per-recording cost display       ·       ·     ·     ·    ·      ●●●
  Cheaper mode toggle              ·       ·     ·     ●    ·      ●●●
  Silence-skip chunking            ·       ·     ·     ·    ·      ●●●
  Otter-equivalent comparison      ·       ·     ·     ·    ·      ●●

UI / UX FOUNDATION
  Three-state flow (idle/rec/post) ●●●     ●●●   ·     ·    ·      ·
  Mobile bottom-anchored actions   ●●●     ●●    ·     ·    ·      ·
  ⌘K command palette (desktop)     ●       ●●●   ●●●   ●●   ·      ·
  Keyboard shortcuts               ·       ●●●   ●●    ·    ·      ·
  Dark/light themes                ●●      ·     ·     ·    ·      ·
  Haptic feedback                  ●●●     ·     ·     ·    ·      ·
  Lock screen controls             ●●●     ●●    ·     ·    ●●     ·
  Personal/Power mode toggle       ●●      ●●    ●●    ●●   ●●     ·
```

### Deferred — do NOT build (no `●●●` anywhere)

- Gamification / streaks
- Wellness widgets
- Emoji reactions on transcripts
- Public sharing of recordings
- Multi-user collaboration
- Custom theme builder
- Bureau/department routing (unless Chris asks)
- Admin dashboards (minimal Power mode only)

## Execution protocol

When proposing a feature, use this 5-step gate before writing code.

**1. Proposal** — Name the feature in one line.

**2. Justification** — State its criterion impact:
```
Feature: X
Primary driver for: [criterion, ●●●]
Secondary for:      [criterion, ●●]
Does not affect:    [criteria]
Estimated impact:   +0.X per affected criterion
```

**3. Approval gate**
- Primary for ≥1 criterion → approved, build
- Only secondary/tertiary everywhere → ask first
- Not in matrix → don't build; flag for matrix update

**4. Post-build self-test** — Score the full 6-criterion card,
compare to previous, verify the predicted criterion moved.

**5. Human confirmation** — User tests, confirms or disputes the
self-score. On dispute: back to refinement, not ship.

## Weekly review ritual

At the end of each build week, save a `CURRENT_SCORECARD.md`:

```
## Week N Scorecard
Date: YYYY-MM-DD

| Criterion         | Score | Change | Top gap                  |
| ----------------- | ----- | ------ | ------------------------ |
| Mobile UX         |  4.5  |  +0.3  | Lock screen controls     |
| Info Entry        |  4.0  |  +0.5  | Share extension missing  |
| 360° View         |  2.5  |  +0.5  | People view not built    |
| AI Consumption    |  3.5  |  +1.0  | Ask-your-meeting stub    |
| Integrations      |  1.5  |   0    | Not started              |
| Cost Transparency |  4.5  |  +0.5  | Cap alerts missing       |

Overall: 3.4 / 5.0
Lowest:  Integrations (1.5)
Next week focus: raise Integrations — calendar, email, Things.
```

Rule: **next week's top priority is always the lowest-scoring
criterion.** Prevents criterion drift (Mobile UX → 5, AI stuck at 3).

## Demo script (for Chris)

30-second opener, 6 × 30-second criterion walks, 30-second close.
Do not do a generic feature tour. Score each criterion aloud.

**Opener**: "I built Dhvani against the same six JTBD criteria you
use to evaluate tools. Let me show you how it scores on each."

**Walk-throughs**:
1. **Mobile UX** — hand him a phone, let him record. "Zero setup,
   zero instructions. 5/5."
2. **Info Entry** — show auto-title, auto-tags, auto-participants.
   "I did not type any metadata. 5/5."
3. **360° View** — search a person's name, show context. "Every
   meeting with Marion, every follow-up, every topic. 4/5 today,
   5 by next month."
4. **AI Consumption** — 30-sec skim + ask-your-meeting chat. "This
   is what the current solution scored 0 on. 5/5."
5. **Integrations** — Outlook export, Notion, Things. "Lives in the
   flow of work. 4/5 today, 5 by next month."
6. **Cost** — show live meter. "Transparent, user-controlled, BYOK
   Azure. 5/5."

**Close**: "Overall 4.7/5 on your own framework. Not because I
built what I wanted — because I built against what you scored."

Do not show in this demo: features Chris didn't ask about, Power
mode, bureau routing, admin dashboards, gamification, any
institutional framing. Save those for a Khuloud meeting.
