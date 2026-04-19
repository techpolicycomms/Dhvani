# Dhvani — 100% Readiness Checklist

Honest inventory of what it takes to call Dhvani truly production-ready at ITU. Grouped by blocker type so the work can be parallelised.

Legend:
- [x] Done in this session
- [ ] Pending
- **(blocker: …)** means the reason it isn't done is external (credential, policy, decision, testing window), not engineering capacity.

---

## A. Shipped in this session (no further action needed)

- [x] ITU brand blue migrated to official `#009CD6` across every code path and asset
- [x] `/download` page rewritten in Tailwind, dark-mode safe, honest "Not available yet" state for missing artifacts
- [x] Silent chunk retry — 5 exponential-backoff attempts, no user-facing failure toasts, orphan-recovery picks up the rest
- [x] Azure Blob voice-audio scaffold (`lib/azureBlobAudio.ts` + `/api/audio/upload/route.ts`), OFF by default
- [x] Lucide line icons on Settings sections, transcript empty state
- [x] Two pre-existing `useCallback` lint warnings fixed — lint now 100% clean
- [x] `HANDOFF.md` updated for next session continuity
- [x] `docs/AZURE_BLOB_AUDIO_SETUP.md` — activation + privacy checklist
- [x] `docs/E2E_TESTING_PROMPT.md` — mega-prompt for desktop-GUI control agent
- [x] `docs/CIO_ISD_HANDOVER.md` — exec brief on scaling + ownership
- [x] `docs/ROADMAP.md` — 12-month outcome-based roadmap
- [x] `docs/STANDALONE_APPS_SPLIT.md` — leadership-option split mega-prompt
- [x] `docs/STRATEGIC_PLAN.md` — full product strategy document
- [x] `docs/presentation/Dhvani_Roadmap.pptx` — 18-slide executive deck
- [x] `docs/KNOWLEDGE_GRAPH/{graph.json, index.html, README.md, build_graph.py}` — 161 nodes, 393 edges, interactive viewer
- [x] **Native Electron Layer A** — `session.setDisplayMediaRequestHandler` with system-audio loopback (no virtual cable needed on macOS 13+ / Win 10+)
- [x] **Native Electron Layer B** — renderer uses standard `getDisplayMedia`, shared pipeline with tab-audio
- [x] **Native Electron cleanup** — deleted obsolete `electron/audioCapture.ts`, trimmed preload bridge
- [x] **Layer C — electron-builder** config in package.json (mac/win targets), `build/entitlements.mac.plist`
- [x] **Layer C — CI** `.github/workflows/release.yml` matrix (macOS + Windows), signing-optional, degrades gracefully without certs
- [x] `docs/ELECTRON_BUILD.md` — signing prerequisites + local unsigned-build instructions

**Status after session:** tsc clean, lint clean, browser pipeline unchanged, Electron build script runs locally unsigned.

---

## B. Must-do before tagging v1.0.0 (engineering work, unblocked)

- [ ] Create PR from `wip/reliability-and-easy-wins` → `main`; review, merge
- [ ] Tag `v1.0.0-rc1` after merge
- [ ] Turn on Azure Blob transcript storage in production env (set `AZURE_STORAGE_CONNECTION_STRING`)
- [ ] Build `build/icon.icns` + `build/icon.ico` from the existing SVG logo (10 min with ImageMagick)
- [ ] Smoke-test unsigned `.dmg` locally on the maintainer's Mac
- [ ] Smoke-test unsigned `.exe` locally on a Windows machine **(blocker: Windows box access)**
- [ ] Run `docs/E2E_TESTING_PROMPT.md` end-to-end against rc1 and triage findings

---

## C. Credentials needed (for signed, publicly distributable binaries)

- [ ] **Apple Developer Program enrollment** ($99/yr individual or org) **(blocker: ITU org decision)**
- [ ] Apple **Developer ID Application** certificate → export `.p12` → base64 → GitHub secret `CSC_LINK` + `CSC_KEY_PASSWORD`
- [ ] Apple notarization creds → `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` as GitHub secrets
- [ ] **Windows code-signing certificate** — EV ($300/yr, immediate SmartScreen reputation) or OV ($100/yr, accept warm-up) **(blocker: ISD security budget)**
- [ ] Windows cert `.pfx` → base64 → `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` GitHub secrets
- [ ] Self-hosted Windows runner if EV cert is on a hardware token (most are)

Until (C) is complete: `.github/workflows/release.yml` emits unsigned builds with a warning. Internal beta testing works; public download does not.

---

## D. ISD production-readiness workstream (6-week plan in `docs/CIO_ISD_HANDOVER.md`)

- [ ] Entra app registration migrated to ISD-owned registry **(blocker: ISD Platform team)**
- [ ] All secrets moved to Azure Key Vault references (no plain env vars in App Service)
- [ ] Azure App Insights workspace created, dimensions wired:
  - [ ] userId hash, sessionId, chunkIndex, Azure region, model name, HTTP status, latency
- [ ] Five north-star metrics live on a dashboard:
  - [ ] Active users, successful-recording rate, time-to-first-entry, meeting-to-recap rate, cost/user-month
- [ ] Alert rules active:
  - [ ] 5xx rate on `/api/transcribe` > 2% over 5 min
  - [ ] Median transcription latency per chunk > 8s
  - [ ] Azure OpenAI quota > 80% of daily cap per region
- [ ] SLOs documented + agreed: 99.5% availability, p95 chunk latency <6s, ≥99% error-free sessions
- [ ] Runbooks drafted:
  - [ ] "Azure OpenAI rate-limited"
  - [ ] "Entra sign-in redirect loop"
  - [ ] "Azure Blob container missing"
  - [ ] "Chunk transcription queue backed up"
- [ ] On-call rotation established (2 people minimum — bus factor)

---

## E. Testing gaps (before GA)

- [ ] Full E2E suite (`docs/E2E_TESTING_PROMPT.md`) run and triaged
- [ ] **Native Electron on macOS**: 13, 14, 15 — first-run Screen Recording + Microphone permission flow
- [ ] **Native Electron on Windows**: 10, 11 — SmartScreen behaviour, WASAPI loopback
- [ ] **Teams native app** capture verification (both OSes) — no BlackHole, no VB-Cable
- [ ] **Zoom native app** capture verification (both OSes)
- [ ] **Phone-call capture** via system audio (AirPods on macOS, Bluetooth headset on Windows)
- [ ] **Older-macOS fallback** (macOS 12) — confirm graceful degradation to microphone or virtual cable
- [ ] **WCAG 2.2 AA audit** with an automated scanner + one screen-reader user walkthrough
- [ ] **Load test** at 100 concurrent recorders against staging
- [ ] **Mobile PWA** — full flow on iOS Safari 17, Chrome Android 13+
- [ ] **Crash-recovery** — force-quit during recording on each platform

---

## F. Privacy / legal (ITU-specific — voice-audio archival path)

Scaffolded, OFF by default. Do not flip on without:

- [ ] Privacy Impact Assessment completed (voice = biometric PII under UN common-system rules)
- [ ] **Consent UI** in Settings → Storage with explicit opt-in toggle + revocation
- [ ] **Meeting-participant notice** language drafted + legal-approved
- [ ] **Retention policy** locked (default 30 days), Azure Blob lifecycle rule configured
- [ ] **Deletion cascade** — transcript delete → audio delete in same transaction
- [ ] Soft-delete (7 days) enabled on the container for accidental-deletion recovery
- [ ] Admin report surfacing sessions approaching retention deadline

---

## G. ITU-native features — Phase 2 of roadmap (Weeks 5–12)

These are what turn Dhvani from "generic transcriber" into "ITU's tool":

- [ ] **Multilingual robustness**: per-chunk language hint (not per-session), mid-sentence code-switch detection, RTL Arabic tuned, Chinese rendering tuned
- [ ] **ITU vocabulary pack v1** — 150 hand-curated acronyms pre-loaded by default (SG, WG, CPM, PP, RRB, TD, each Study Group sub-number)
- [ ] **Delegate recognition** — auto-pull attendee list from Outlook invite on meeting start, map speaker turns to `Country (Role)`
- [ ] **Voice fingerprint** — opt-in, local, cross-meeting speaker persistence
- [ ] **Formal export templates** — ITU-T summary record, ITU-R CPM, ITU-D discussion notes, plenary verbatim, Bureau memo (each with ITU header, TOC, page numbers)
- [ ] **Meeting directory tagging** — saved transcripts auto-tagged with Study Group, Question, Bureau, mandate

---

## H. Workflow integrations — Phase 3 of roadmap (Weeks 13–26)

- [ ] **Outlook add-in** — "Transcribe this meeting" button on calendar invites
- [ ] **Teams bot** — joins meetings as passive participant **(blocker: CIO / M365 admin policy approval)**
- [ ] **SharePoint sync** — transcripts + action items land in Bureau-owned libraries
- [ ] **Planner / Tasks** — action items become assigned tasks with due dates
- [ ] **Email digest** — morning email: yesterday's meetings, action items, decisions
- [ ] **Document pipeline** — export into ITU-T/R/D document systems as draft TDs
- [ ] **Mobile-native polish** — phone-first record flow, bottom-sheet settings, proper PWA install prompt

---

## I. Intelligence layer — Phase 4 of roadmap (Weeks 27–52)

- [ ] **Library fuzzy search + filter chips** (Fuse.js, client-side, per-user)
- [ ] **Ask Dhvani** — personal RAG over your meeting history, with citations
- [ ] **Meeting analytics per Bureau** — talk-time equity, decision velocity, topic trends
- [ ] **Live translation view** — French speaker → English subtitles during live recording
- [ ] **Automatic decision log** per Study Group, curated from all its transcripts
- [ ] **Live captions** in the recording view (accessibility)
- [ ] **Federated Dhvani** (stretch) — SSO for other UN agencies (UNDP, UNICEF, WHO)

---

## J. UI/UX polish (high-impact, low-effort wins)

- [ ] 60-second onboarding flow with first-record confetti moment
- [ ] `Cmd+K` command palette (hooks into existing shortcut infrastructure)
- [ ] Big circular breathing Record button with live waveform + speaker-color highlighting
- [ ] Country-flag + role speaker pills (`🇰🇪 Kenya`, `🇫🇷 France · Chair`)
- [ ] Formal-document recap preview — looks like an ITU TD, not raw Markdown
- [ ] Empty states with subtle ITU-blue line illustrations (not just icons)
- [ ] Dark mode as a designed product, not colour-inverted
- [ ] Install-to-home-screen prompt after third successful recording
- [ ] Microcopy pass — plain language everywhere

---

## K. Distribution + change management

- [ ] Executive briefing pack distributed (use `docs/presentation/Dhvani_Roadmap.pptx`)
- [ ] Champions program — one named advocate per Bureau + large Study Group
- [ ] **Leadership seeding** — 10 senior meeting owners use Dhvani for 30 days
- [ ] Office hours weekly for the first 90 days post-GA
- [ ] Monthly metrics dashboard shared with Bureau directors
- [ ] 90-day exit survey → feedback loop

---

## L. Leadership decisions needed

Five unblocks that make the full 12-month plan real:

- [ ] **Budget approval** — 2 engineers + 0.5 designer × 9 months (~$400k all-in)
- [ ] **Azure OpenAI TPM** raise to 500K per region
- [ ] **Entra app registration** migration approved (ISD owned)
- [ ] **Privacy sign-off pathway** opened for voice archival
- [ ] **Named Bureau director** as executive sponsor and first champion

---

## Can we call it "100% ready" today?

**No — and saying yes would be dishonest.** The honest status:

- **Ready for internal beta** after items in Section B are done (a couple of days).
- **Ready for public download** after Section C (signing certs, ~2 weeks once approvals land).
- **Ready for General Availability** after Sections D + E + F land (6–10 weeks, gated on ISD).
- **The de-facto ITU transcription tool** is the 12-month outcome described in `docs/ROADMAP.md` and `docs/STRATEGIC_PLAN.md`, gated on Section G + H + J.

The foundation — what ships today — is real, tested against the engineering bar, and ready to hand to ISD. Everything beyond that is a decision, a credential, or a testing window.

Use this file as the project board. When every checkbox is green, Dhvani is done.
