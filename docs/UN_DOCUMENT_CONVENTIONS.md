# Dhvani — UN Document Conventions

What Dhvani does to align exported meeting records with UN document
conventions, what it doesn't do yet, and the path to full conformance.

---

## What we emulate

### Akoma Ntoso for UN (AKN4UN / UNSIF-AKN4UN)

**Reference:** https://unsceb.org/unsif-akn4un

AKN4UN is the UN's structural XML schema for official documents. It
prescribes a three-part document model:

1. `<preface>` / `<preamble>` — document identity, date, authors,
   context.
2. `<body>` — the substantive content, in numbered `<section>` /
   `<article>` / `<paragraph>` elements with stable identifiers.
3. `<conclusions>` — signatures, attachments, metadata footer.

**What Dhvani does today** (`lib/docxExport.ts` Power mode):

- **Preamble mirrored in the document header:**
  - Document ID (Dhvani-issued stable id)
  - Bureau / Study Group tag
  - Meeting subject
  - Date & time range
  - Chair / organiser
  - Participants list
  - "Prepared by: Dhvani — ITU Innovation Hub" attribution line
  - Automated-transcription disclaimer

- **Body in numbered sections**: `1. Meeting Summary`, `2. Action Items`,
  `3. Transcript (verbatim)`. UN documents number sections throughout.

- **Paragraph-level addressability**: each transcript turn is prefixed
  with `¶N` so a reader can cite "¶12 of ITU-SG17-2026-04-20-rec42"
  and have a stable reference. Matches DGACM's machine-readability
  guidance.

- **Page break before transcript**: clean separation of the substantive
  summary from the raw record. Matches UN formal-record practice.

**What we DON'T do** (and why):

- We emit `.docx`, not `.xml` / AKN4UN. AKN4UN is XML-based; Word
  documents can structurally mirror it but cannot conform to the schema.
  Real AKN4UN output is a follow-up project — see "Roadmap" below.
- No Legal-Resource-Identifier (LRI) URIs. These require a UN-level
  identifier registry and are out of scope for a meeting transcription
  tool.
- No multilingual parallel text in a single document. Each transcript
  is exported in its source language. Parallel multilingual output
  would require the live-translation view (Q4 roadmap).

### UN DGACM machine-readability guidelines

**Reference:** https://www.un.org/dgacm/en/content/visualizations-and-machine-readability

DGACM is the Department for General Assembly and Conference
Management. Their guidance focuses on making UN documents parseable by
downstream systems.

**What Dhvani does:**

- **Consistent heading hierarchy** (Title → H1 → H2). No skipping
  levels, no orphan headings, no ambiguous styles.
- **Tabular-numerals for timestamps** so screen readers and machine
  parsers get a stable format.
- **Explicit attribution in the preamble**, not a hand-drawn footer.
- **Footer text is minimal prose, not decorative art** — indexable.
- **Section numbering is stable across re-exports** of the same
  transcript. Cite `¶12` and it still means the same turn next year.

**What we DON'T do:**

- No embedded semantic metadata (Dublin Core, PRISM). These need an
  AKN4UN-XML output path.
- No structured annexes. A single-document flat `.docx` is today's
  ceiling.

### UN-SCEB HLCM technical notes

**Reference:** https://unsceb-hlcm.github.io/

HLCM publishes technical-standards notes for the UN system. The
relevant pattern here is document-ID conventions — every UN body
follows a `<symbol>/<sub>/<serial>` shape so a document can be cited
unambiguously forever.

**What Dhvani does:**

- Emits a Dhvani-scope document id per transcript (see
  `documentId` field in the docx input). Shape:
  `ITU-<BUREAU>-<YYYY>-<MM>-<DD>-rec<hex>`.
- Stored alongside the transcript JSON in Azure Blob; survives
  container migration.

**What we DON'T do:**

- Our IDs are Dhvani-scoped, not UN-system-wide. A real HLCM-aligned
  identifier would be registered with the UN document registry.
  Out of scope for a transcription tool; appropriate for a future
  "publish to UN document management" integration.

---

## Quick reference table

| Convention area | UN source | Dhvani today | Gap to close |
|---|---|---|---|
| Document structure | AKN4UN | Numbered sections + preamble in docx | Emit real AKN4UN XML |
| Machine-readability | DGACM | Consistent hierarchy, stable ¶ ids | Dublin Core / PRISM metadata |
| Document identifiers | HLCM | Dhvani-scoped IDs | UN-system-wide registry integration |
| Terminology | BR/TSB + UNTERM | Curated 300-term prompt | Full corpus ingestion (see VOCABULARY_INGESTION.md) |
| Multilingual | UN 6 + PT / DE | Per-chunk language hint | Parallel output + live translation |

---

## Roadmap to full conformance

Ordered by ROI, not difficulty:

1. **Full vocabulary ingestion** — see `docs/VOCABULARY_INGESTION.md`.
   This is the single highest ROI for transcription quality.
2. **Per-meeting prompt targeting** — Bureau overlay + attendee
   priming already half-built (`primeSpeakers`). Extend to weight
   terms by Study Group.
3. **Multilingual parallel export** — one `.docx` per language, same
   `¶` numbering across all of them. Enables delegate review across
   languages without losing the cross-reference.
4. **AKN4UN XML export** — real XML, real schema conformance. Needed
   before any "publish to UN document management" integration. Two-
   to three-week eng project once we pick an AKN4UN serialisation
   library (or write one).
5. **Digital signatures + checksum** — for formal records, sign the
   exported document with Dhvani's org key so downstream consumers can
   verify provenance.
6. **HLCM document-ID registration** — only relevant if formal records
   leave ITU. A compliance step, not an engineering problem.

Items 1-2 land as part of the Phase 2 roadmap. Items 3-6 are Phase 3+
— they all require stakeholder alignment outside engineering before
the code matters.

---

## Files that embody these conventions

| File | Area |
|---|---|
| `lib/docxExport.ts` | `.docx` structure, numbering, preamble |
| `lib/ituVocabulary.ts` | Terminology pack (primary) |
| `lib/ituTechnicalTerms.ts` | Terminology pack (extended) |
| `lib/vocabularyStorage.ts` | Per-user vocab reader |
| `lib/exportUtils.ts` | Filename conventions |
| `components/ExportMenu.tsx` | User-facing export surface |

Anyone modifying export conventions must update this doc.
