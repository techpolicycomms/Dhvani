# Dhvani — Handover brief to ITU CIO & ISD Team

**Audience:** CIO, ISD leadership, ISD platform engineering.
**Purpose:** Bring Dhvani into the ISD-maintained digital-products portfolio from the Innovation Hub.
**Status of product:** Feature-complete for internal meeting transcription. Dark-mode ready, Personal/Power dual UX, Azure-OpenAI-server-side. Not yet audited for ISD production standards — gaps listed below.
**Bottom line up front:**

> Dhvani is ready to hand over **once ISD completes a four-workstream uplift**: (1) identity + secrets rotation, (2) observability + SLOs, (3) CI/CD + release pipeline for desktop binaries, (4) privacy/legal review of voice-audio archival. Everything else in the stack is mainstream (Next.js, NextAuth, Azure Blob, Azure OpenAI) and within ISD's existing operating envelope. Target transition window: **6 working weeks** from ISD staffing the takeover.

---

## What ISD is taking on

| Asset | Shape | Notes |
|---|---|---|
| Web app | Next.js 14 on Azure App Service (Linux, Node 20) | Stateless; scales horizontally once Azure Blob transcript storage is turned on. |
| Desktop app | Electron wrapper (macOS + Windows) | Source in `electron/`. No release pipeline yet. |
| Chrome extension | MV3 side-panel companion | In `extension/`, optional, not in the critical path. |
| Auth | Microsoft Entra ID (app registration in ITU tenant) | Secrets in App Service Config. |
| LLM | Azure OpenAI — `gpt-4o-transcribe-diarize` (SWC), `gpt-4.1-mini` (EUW) | Server-side only. Per-user quota + cost tracking implemented. |
| Storage | Local disk default; Azure Blob optional for transcripts; Azure Blob scaffolded (off) for raw voice audio | See `docs/AZURE_BLOB_AUDIO_SETUP.md`. |
| Data classification | Transcripts = PII; raw voice = biometric PII. | Retention not yet fixed in policy — TBD with ISD Privacy. |

---

## Production-readiness gaps (ordered by risk)

### 1. Identity, secrets, and access (RED — blocker)

- Entra app registration must move from the Innovation Hub tenant to the ISD-owned app registry, with production-appropriate redirect URIs, scopes, and a rotation schedule for the client secret.
- Azure OpenAI keys, Azure Storage connection strings, NEXTAUTH secrets are currently in App Service Configuration only — rotate and move behind an Azure Key Vault reference so rotation doesn't require a redeploy.
- Admin allowlist (who can see `/admin`) is enforced server-side; move the allowlist definition into a config document owned by ISD, not hard-coded in env.

### 2. Observability, SLOs, and runbooks (RED — blocker)

- No structured logging today beyond `console.warn`. Add Azure Application Insights:
  - Dimensions: userId hash, sessionId, chunk index, Azure region, model name, HTTP status, latency.
  - Sample rate: 10% on success, 100% on errors.
- Metrics to alert on:
  - 5xx rate on `/api/transcribe` > 2% over 5 minutes.
  - Median transcription latency per chunk > 8s.
  - Azure OpenAI quota burn rate > 80% of daily cap for any region.
- SLOs (recommended starting point):
  - **Availability** 99.5% measured at `/api/health`.
  - **Transcription latency** p95 per chunk < 6s.
  - **Error-free recording** ≥ 99% of sessions complete without user-visible failure.
- Runbooks needed: "Azure OpenAI rate-limited", "Entra sign-in redirect loop", "Azure Blob container missing", "Chunk transcription queue backed up".

### 3. CI/CD + release pipeline (AMBER)

- Today: no automated build for desktop `.dmg`/`.exe`. The `/download` page gracefully shows "Not available yet" when GitHub Releases has no asset — but we should make that transient.
- Needed:
  - GitHub Actions pipeline on tag `v*`:
    - macOS runner: `electron-builder --mac --universal` → notarize (needs ITU Apple Developer ID) → upload `.dmg` to the release.
    - Windows runner: `electron-builder --win` → codesign (ISD's EV cert) → upload `.exe`.
  - Web App deploy pipeline: build → type-check → lint → test → stage deploy → prod-gated deploy with manual approval. Currently done ad hoc.
- Secrets needed in Actions: Apple Developer ID, Windows codesign cert, Azure credentials.

### 4. Privacy + legal (AMBER, voice audio only)

- Transcripts: already covered by user-initiated save ("Save transcript" button). Retention = indefinite pending policy.
- **Voice audio archival is scaffolded but OFF** (`lib/azureBlobAudio.ts`). Before flipping on:
  - Privacy impact assessment — voice is biometric PII under UN common-system guidance.
  - Consent UI — explicit opt-in, revocable, with clear wording about participant notice.
  - Retention policy, default 30 days (configurable), enforced via Azure Blob lifecycle rule.
  - Deletion cascade — when a transcript is deleted, the paired audio must be deleted in the same transaction.
  - Guidance on non-recorder participants.

### 5. Testing (AMBER)

- Unit tests: minimal (some utils).
- Integration: none.
- End-to-end: nothing automated — but a pasted-prompt mega-spec for a GUI-control agent is documented at `docs/E2E_TESTING_PROMPT.md`.
- Recommendation: before declaring production-ready, run the E2E suite once per release candidate; automate the critical path (auth → record → transcribe → save → export) in Playwright.

### 6. Accessibility (AMBER)

- Colours hit WCAG AA on the white and dark backgrounds (validated against `#009CD6` ITU blue).
- Keyboard: Cmd+R record, Cmd+, settings, Esc closes — ShortcutDiscoverability low.
- Screen readers: ARIA labels present on primary controls but not audited end-to-end.
- Recommended: one cycle of WCAG 2.2 AA audit with a screen-reader user before rollout.

### 7. Performance + scale (GREEN — comfortable for current load)

- Architecture is stateless; scale-out on App Service by simply increasing instance count once Azure Blob transcript storage is active.
- Azure OpenAI is the realistic scale ceiling — per-region TPM limits. Dhvani already load-balances across two regions (SWC + EUW). For > 500 concurrent recorders, request a TPM increase.
- Storage cost: ≤ $30/month even with 1k users + voice archival for 30 days.

### 8. Documentation (GREEN)

- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, `docs/ENTRA_SETUP.md`, `docs/SECURITY.md`, `docs/deployment.md`, `HANDOFF.md` (live, updated this session).
- Delta needed: ISD runbooks (operating, not developer-facing).

---

## Scaling plan

**User tier: 100 → 1,000 → 10,000.**

| Dimension | 100 users | 1,000 | 10,000 |
|---|---|---|---|
| App Service | B2 (1 instance) | P1v3 (2–3 instances, autoscale on CPU) | P1v3 (8–16 instances, autoscale on queue depth) |
| Storage | Local disk | **Azure Blob ON** (transcripts) | Azure Blob + GRS replication; optional CDN for exports |
| Azure OpenAI TPM | Defaults | Raise to 500 K TPM per region | Dedicated PTU (provisioned throughput) |
| Monitoring | App Insights default | + custom alert rules | + dashboard reviewed in weekly ops |
| Backups | N/A (local wipes on redeploy) | Blob soft-delete 7 days | Blob soft-delete 14 days + cross-region copy |
| Cost (approx, USD/mo) | $100 | $800 | $5,000–8,000 |

The biggest unknown is Azure OpenAI cost per user-minute. At gpt-4o-transcribe rates, a 30-min meeting is ~$0.30. 1,000 users × 20 meetings/month = $6,000/month in LLM costs alone at 10,000 active users. Start with a per-user daily cap and a monthly org cap; tighten with data.

---

## Proposed handover timeline

| Week | Owner | Workstream |
|---|---|---|
| 0 | Innovation Hub | Tag `v1.0.0-rc` on `main`; freeze non-critical changes. |
| 1 | ISD Platform | Take over Entra app registration; rotate all secrets into Key Vault. |
| 2 | ISD Platform | App Insights instrumentation + alert rules + /api/health check. |
| 2–3 | ISD Release Eng | GitHub Actions release pipeline for desktop + web. |
| 3 | ISD Privacy | Privacy impact assessment for voice archival; lock retention policy. |
| 4 | ISD QA | First end-to-end suite run per `docs/E2E_TESTING_PROMPT.md`; triage findings. |
| 4–5 | ISD Platform + Eng | Fix E2E blockers; accessibility audit. |
| 6 | CIO + ISD Director | Go/no-go gate; tag `v1.0.0`; flip DNS to ISD-owned. |

---

## Handover deliverables

- [x] Source repo transferred to ISD org (or a mirrored branch with write access).
- [x] `HANDOFF.md` live and current.
- [x] Architecture + Security + Deploy docs.
- [x] Production readiness gap list (this doc).
- [x] E2E testing prompt.
- [x] Product roadmap (`docs/ROADMAP.md`).
- [x] Standalone-apps-split decision memo (`docs/STANDALONE_APPS_SPLIT.md`).
- [ ] Secrets migrated to Key Vault (ISD).
- [ ] Azure App Insights workspace + dashboard (ISD).
- [ ] Release pipeline (ISD).
- [ ] Privacy sign-off on voice archival (ISD Privacy).

---

## Risks the CIO should be aware of

1. **LLM cost drift.** A single user with a 4-hour meeting costs ~$2.40. Without per-user daily caps and meaningful admin dashboards, costs scale with user enthusiasm, not user count. The cost telemetry exists; the caps exist. Enforcement is active and logged.
2. **Voice archival is a policy decision, not a technical one.** The code is ready; the organization's position on recording isn't yet. Dhvani does not record audio to the cloud today. When ISD flips the switch, it should be a leadership decision, not an engineer's.
3. **Desktop binaries will need codesigning certificates.** Budget a few thousand USD per year (Apple Developer + EV Windows cert).
4. **Shared responsibility with Microsoft.** Azure OpenAI is subject to Microsoft's terms + sub-processor list; ISD should document this under the existing Microsoft EA data-processing annex.
5. **Bus factor.** Innovation Hub transfer to ISD is a one-time event; during the 6-week window, keep an escalation path back to the Hub engineer who built it.

---

## Success criteria (12 weeks post-handover)

- ≥ 200 active weekly users without a P1 incident.
- Transcription p95 latency under 8 seconds per chunk globally.
- Cost per user-month < $1.50 at current usage patterns.
- 90-day incident-free on auth + storage.
- First roadmap item (`docs/ROADMAP.md` §Q3) delivered by ISD on their own, with the Hub advising.

If all five are green at the 12-week mark, Dhvani has successfully graduated to the ISD portfolio.
