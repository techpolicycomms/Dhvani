# Dhvani — Vocabulary Ingestion Plan

How we feed ITU- and UN-specific vocabulary into the transcription
pipeline. Covers what's shipped today, what's queued for a follow-up
ingestion pass, and the legal / ops constraints.

---

## Shipped today

### Inline curated pack

- `lib/ituVocabulary.ts` — ~150 terms covering ITU organisation names,
  conferences and assemblies, Study Groups (T / R / D), document types,
  high-frequency technical acronyms, common proper nouns, and UN family
  agencies.
- `lib/ituTechnicalTerms.ts` — ~200 second-tier technical terms
  curated from the BR/TSB Recommendations + UNTERM coverage areas
  (Radio Regulations, Resolutions, satellite services, transport
  networks, access, video coding, QoS, IMT-2030, PQC, governance).
- `lib/vocabularyStorage.ts` — shared read path for per-user vocabulary
  entries created via `/api/vocabulary`.
- `lib/ituVocabulary.ts#buildTranscriptionPrompt()` — merges defaults +
  user terms, de-duplicates, soft-caps at 1200 chars (well under the
  ~224-token prompt ceiling on `gpt-4o-transcribe`).
- `/api/transcribe` now passes that prompt as the transcription model's
  priming context on every chunk.

Total coverage in the shipped pack, after dedup: ~300 unique terms.
Chosen as the intersection of "commonly misheard" × "appears often in
ITU meetings." Anything outside that intersection goes in the user's
personal vocabulary, or via a Bureau-admin bulk upload (planned).

---

## Queued: full corpus ingestion

Three external sources are worth pulling in bulk, once — **offline**, at
build time or via a scheduled job, never live per transcription.

### 1. ITU BR/TSB Terms

**URL:** https://www.itu.int/br_tsb_terms
**Coverage:** ~30k terms across ITU-R + ITU-T Recommendations, status
filter (Recommended / Historical), six UN languages.
**Access pattern:** searchable web UI. No public REST API documented
as of 2026-04. Scraping would require a rate-limited crawler.
**Value:** authoritative definitions; domain accuracy for standards
discussions.
**Constraints:**
- Copyright resides with ITU (see site footer). Redistribution as a
  public dataset needs a licensing conversation with TSB.
- For **internal Dhvani use** (an ITU tool inside the ITU tenant),
  ingestion is within scope. ISD Legal to confirm.

### 2. UN Multilingual Terminology (UNTERM)

**URL:** https://unterm.un.org/unterm2/en/
**Coverage:** ~87k terms across EN / FR / ES / AR / RU / ZH plus
PT / DE. Attribution, usage notes, and definitions.
**Access pattern:** UNTERM has bulk export in TBX (TermBase eXchange)
format for authorised users. ITU is a UN specialised agency with
standing UNTERM contributor status — Secretariat can request the dump.
**Value:** foundation for multilingual transcription quality; needed
for Q4 live-translation view.
**Constraints:**
- TBX is XML; we'd parse into the same term-list shape.
- UNTERM terms-of-use restrict redistribution outside the UN system.
  For Dhvani this is fine (internal ITU tool). External share of any
  derivative dataset is OUT of scope.

### 3. ITU language tools index

**URL:** https://www.itu.int/en/general-secretariat/multilingualism/Pages/language-tools.aspx
**Coverage:** curated links — not a corpus. Useful for discovery
(Spanish/French/Russian translation guides, style guides, previously
unknown glossaries).
**Access pattern:** manual scan. One-off.
**Value:** low-effort secondary enrichment.

---

## Proposed ingestion pipeline

Scheduled, not live. Pattern mirrors the Azure Blob transcript-archival
pattern — an opt-in backend with its own container + lifecycle rules.

```
scripts/vocab-ingest/
  ├── fetch-br-tsb.ts       # Puppeteer + polite rate-limit
  ├── fetch-unterm.ts       # TBX parser, requires UN creds
  ├── fetch-itu-toolkits.ts # manual curation, commit as data/
  ├── merge.ts              # dedup + classify by Study Group/Bureau
  └── build-index.ts        # emits lib/generated/ituVocabulary.gen.ts
```

Output is a TypeScript module committed to the repo so the transcribe
route stays synchronous. Re-generate quarterly, or after any major
Radio Regulations revision (WRC outcome, new Recommendation batch).

Bureau-level overlays (SG-17 wants "PQC" stronger-weighted than "QoS")
go in a separate `lib/generated/bureauVocabularies/` folder, selected
per meeting based on the calendar-event tag.

**Non-goal**: live fetch per transcription. Round-trip to BR/TSB at
every chunk would add 300+ ms latency, rate-limit us off the source,
and leak ITU-internal transcript context to the search system. Don't
do it.

---

## Why this is enough to ship

The 300-term curated pack we have today is the **intersection** of
what the model mishears and what ITU staff say most. Expanding to
30k + 87k terms is strictly diminishing returns because:

1. The prompt has a hard ~224-token ceiling. We can't fit 100k terms
   in the prompt regardless of corpus size.
2. Long prompts degrade model latency measurably.
3. The best accuracy lift comes from *per-meeting* priming (attendees +
   meeting subject + Bureau overlay), not from a longer generic prompt.

The right next step after this ingestion pipeline lands:

- **Per-meeting prompt targeting**: build the prompt from the calendar
  event's subject + Bureau + attendee names + the top 100 terms for
  that Bureau's Study Group.
- **Fine-tuned ASR**: longer-term, bake the vocabulary into a
  fine-tuned Whisper variant so it's always there, no prompt overhead.
  Needs an Azure custom-model deployment + compliance sign-off.

---

## Files that depend on this

If you change the shape of the vocabulary module, update all of:

- `lib/ituVocabulary.ts` — main API
- `lib/ituTechnicalTerms.ts` — second-tier pack
- `lib/vocabularyStorage.ts` — per-user reader
- `lib/providers/azure-openai.ts` — passes `prompt` through
- `lib/providers/ai.ts` — `TranscribeOptions.prompt` field
- `app/api/transcribe/route.ts` — assembles the prompt per request
- `app/api/vocabulary/route.ts` — user-facing CRUD
- `components/VocabularyManager.tsx` — settings UI

Running `tsc --noEmit` after any edit catches drift.
