# Dhvani — Standalone Apps Split: Mega-Prompt for Leadership Decision

**Purpose.** If ITU leadership prefers several focused apps over one integrated Dhvani super-app, this document contains (a) a decision framework and (b) a single paste-into-a-coding-agent prompt that carves Dhvani into its natural product lines and stands up their scaffolds.

**Do not execute this prompt casually.** It's a substantial body of work (weeks of engineering, two code repos to spin up per app, per-app auth + deploy) and it trades integration for focus. Read the framework first.

---

## Decision framework

Split **only if** at least three of these are true:

1. Different audiences own different surfaces (recording team ≠ library team ≠ admin team).
2. Different release cadences are starting to fight each other (meeting team wants weekly, admin wants quarterly).
3. Different compliance regimes apply (e.g. voice audio subject to rules that the pure library isn't).
4. Deploy-blast-radius matters — a bug in one surface shouldn't ground the others.
5. A clear revenue/budget line separates the apps.

Otherwise, stay one app. Splitting sounds clean but costs real engineering weeks and multiplies the operational surface.

## Suggested split (if the decision is yes)

| App | Core job | Likely primary user | Status |
|---|---|---|---|
| **Dhvani Record** | Capture + transcribe + recap one meeting | Individual contributors | This is the current product minus library/admin. |
| **Dhvani Library** | Search, browse, ask-across-meetings | Power users, managers | Q3 roadmap items — today lives under `/transcripts`. |
| **Dhvani Admin** | Usage, cost, emissions, org insights | ITU CIO office, Bureau leads | Today lives under `/admin`. |
| **Dhvani Companion** (optional) | Side-panel extension for Teams/Meet tabs | IC, unchanged | Already lives in `extension/`. |

Shared spine across all apps:
- `auth-core` (NextAuth + Entra config)
- `ui-core` (tailwind tokens, brand, theme, lucide icons)
- `storage-core` (Azure Blob adapters, transcript schema)
- `telemetry-core` (App Insights)

These should move into a private monorepo or a small set of versioned internal packages before the split — otherwise every app reinvents the primitives.

---

## THE MEGA-PROMPT

Copy from this line to the bottom block into a coding agent with repo-creation + write access. It sets up the split cleanly.

```
You are splitting the Dhvani monolith into three focused apps and a shared-primitives package. You have full repo/write access.

CONTEXT
- Source repo: github.com/techpolicycomms/Dhvani (branch: main, current app at https://dhvani.internal.itu.int)
- The monolith is Next.js 14 App Router, TypeScript strict, NextAuth v5 + Microsoft Entra, Azure OpenAI server-side, Azure Blob or local FS storage, Tailwind w/ CSS-variable theming, lucide-react icons, ITU brand blue #009CD6.
- HANDOFF.md + docs/ARCHITECTURE.md + docs/CIO_ISD_HANDOVER.md + docs/ROADMAP.md in the source repo give the full picture.

TARGET LAYOUT
- Private org on GitHub: techpolicycomms (or a new org, ask first).
- Shared packages (one repo, pnpm workspace, named `dhvani-core`):
  - @dhvani/auth-core     — NextAuth config, Entra provider, ActiveUser + quota + rate limiting helpers.
  - @dhvani/ui-core       — Tailwind config (#009CD6 tokens + dark mode), lucide icon wrappers, ITU-branded layout primitives.
  - @dhvani/storage-core  — SavedTranscript schema, filesystem + Azure Blob adapters, azure audio blob helpers.
  - @dhvani/telemetry     — App Insights wiring, structured logger, metrics emitter.
  - @dhvani/calendar      — Microsoft Graph calendar adapter + useCalendarPrefs.
- App repos (each Next.js 14 + TS, each depending on @dhvani/*):
  - dhvani-record  — record + transcribe + recap + export. Migrated from `app/page.tsx` + `hooks/useAudioCapture` + `useTranscription` + `components/ControlBar` etc.
  - dhvani-library — browse saved, search, "Ask across meetings", tags. Migrated from `app/transcripts/**` + `app/tasks/**`.
  - dhvani-admin   — admin dashboard, emissions, org intelligence. Migrated from `app/admin/**`.

PLAN (execute in this order; commit after each step)

1. Inventory + dependency map.
   - Read the Dhvani monolith, list every file and classify: "belongs to Record", "belongs to Library", "belongs to Admin", "shared primitive → package X".
   - Produce `docs/SPLIT_INVENTORY.md` in the source repo. Do NOT move code yet.

2. Stand up the @dhvani/* packages as a pnpm workspace.
   - Initialize `dhvani-core` repo with `pnpm`. Add TypeScript, ESLint, Prettier, Jest matching Dhvani's configs.
   - Migrate in this order: auth-core, storage-core, ui-core, telemetry, calendar. Each in its own PR.
   - Each package exports a minimal, typed API. Don't re-export Next.js types.
   - Publish to a private npm registry (or use `pnpm.workspace.packages` + git deps if no registry yet).

3. Scaffold the three apps with `create-next-app` (App Router, TS, Tailwind).
   - Wire each to the shared packages as workspace deps.
   - Reproduce the Entra auth flow via @dhvani/auth-core in all three; verify a real sign-in works.
   - Set up `/api/health` in each.

4. Port Record first (dhvani-record).
   - Copy pages, components, hooks relevant to capture + transcribe + recap + export.
   - Replace local imports of `lib/*` with @dhvani/*.
   - Migrate tests. Get `npm run dev` green.
   - Deploy to a staging Azure App Service; smoke-test with a real user.

5. Port Library (dhvani-library).
   - `app/transcripts/**`, `app/tasks/**`, any library search.
   - Add Fuse.js for fuzzy search (this was Q3 on the roadmap; doing it during the split is a good moment).
   - Deploy to staging.

6. Port Admin (dhvani-admin).
   - `app/admin/**`, all admin components.
   - Scope access — admin is a restricted surface, tighter Entra group restriction than the other two.
   - Deploy to staging.

7. Unify UX across apps.
   - A top-bar nav present in all three that flips to the other app at the same route-equivalent.
   - Shared dark-mode toggle, shared keyboard-shortcut primitives.
   - Crash-recovery banner (OrphanRecordingBanner) stays in dhvani-record; library and admin don't record audio.

8. Retire the monolith.
   - Cut a final tag (`v1-monolith`) on Dhvani before shutdown.
   - Flip DNS: dhvani.itu.int → record; library.dhvani.itu.int → library; admin.dhvani.itu.int → admin.
   - Leave a redirect at the old `/admin` and `/transcripts` → the new subdomains for 90 days.
   - Archive (do not delete) the monolith repo with a README pointer.

9. Documentation pass.
   - Each app has its own HANDOFF.md, ARCHITECTURE.md, DEPLOY.md derived from the monolith's docs, trimmed to just what matters.
   - @dhvani/* packages each have a README.md with the published API.

CONSTRAINTS
- Do not drop features during the port. Any feature that exists in the monolith must exist in one of the new apps on day 1 of cutover (or be explicitly deprecated in the release notes).
- Brand identity stays identical — #009CD6 everywhere, Noto Sans, lucide line icons. Import tokens from @dhvani/ui-core; no app hard-codes a hex.
- Dark mode works in every app before port is considered complete. Follow the CSS-variable pattern from the monolith. Inline hex styles banned.
- Voice-audio archival remains OFF by default in every app. Its setup guide stays in dhvani-record docs.
- Tests must pass on the main branch of every repo after every step. No merging red trees.
- Keep commit messages prose, why-over-what. No Co-Authored-By tags unless asked.

DELIVERABLES AT THE END
- 4 repos: dhvani-core + dhvani-record + dhvani-library + dhvani-admin.
- 3 staging URLs, all signed-in-accessible.
- A "cutover runbook" in `docs/CUTOVER.md` (in dhvani-core) detailing the DNS flip, redirect rules, rollback plan.
- A "post-split bill of materials" listing every feature and which app owns it.
- A single PR in the old monolith archiving it with a pointer to the new repos.

If anything in this plan is ambiguous, pause and ask before writing code. Do not guess at architecture decisions — they compound.
```

---

## Cost of splitting (be honest with leadership)

- ~6–8 engineering weeks for a two-person team to execute this plan responsibly.
- ~$150–300/month additional cloud cost from running 3 App Services instead of 1 (offset slightly by finer scaling).
- One-time DNS/redirect complexity — minor, but real user confusion during cutover.
- Ongoing cognitive overhead: shared-primitives versioning becomes a new class of problem.

## Benefits if the conditions are met

- Each team ships on its own cadence without conflict.
- Easier to reason about per-app compliance (e.g. admin may need stricter auth than record).
- Faster bug-fix roll-forward per app.
- Natural place for future "Dhvani Mobile", "Dhvani Teams Bot" or federated deployments to attach.

## If in doubt

Do **not** split. Keep the monolith, invest the same engineering weeks in Q2 roadmap items (speaker persistence, code-switch robustness, ITU vocabulary pack). A better monolith beats three okay apps nine times out of ten for a product this size.
