/**
 * Mode-aware .docx export.
 *
 *   Personal → minimal, first-person, no ITU branding
 *   Power    → UN-document-conventions structure, ITU footer,
 *              third-person, numbered sections
 *
 * The Power-mode layout is modelled on UN document conventions with
 * reference to:
 *
 *   - Akoma Ntoso 4 UN (UNSIF-AKN4UN, https://unsceb.org/unsif-akn4un):
 *     the UN's legal/legislative XML schema. We can't emit AKN4UN from
 *     .docx (it's an XML format), but we mirror its structural pattern:
 *     preamble (metadata) → main body in numbered sections → attribution.
 *     Full AKN4UN XML output is on the roadmap — see
 *     docs/UN_DOCUMENT_CONVENTIONS.md.
 *
 *   - UN DGACM machine-readability guidelines
 *     (https://www.un.org/dgacm/en/content/visualizations-and-machine-readability):
 *     consistent heading hierarchy, stable section numbering, explicit
 *     attribution, metadata visible and parseable.
 *
 *   - UN-SCEB HLCM technical notes
 *     (https://unsceb-hlcm.github.io/): document ID conventions
 *     (we emit a Dhvani-issued stable identifier).
 *
 * Returns a Uint8Array so callers can trigger a Blob download in the
 * browser without writing to disk.
 */

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";
import { DISCLAIMER_FULL } from "./disclaimer";
import { COPY, type Mode } from "./mode";
import type { TranscriptEntry } from "./constants";
import type { SpeakerResolver } from "./exportUtils";

export type DocxExportInput = {
  transcript: TranscriptEntry[];
  resolveSpeaker?: SpeakerResolver;
  /** Title shown as the document heading. Falls back to "Untitled recording". */
  title?: string;
  /** ISO start timestamp; rendered as a friendly date. */
  startedAt?: string;
  /** ISO end timestamp; shown in metadata block if present. */
  endedAt?: string;
  /** Total duration in minutes; surfaced in the meta line. */
  durationMin?: number;
  /** Stable transcript id for the preamble (mirrors a UN document symbol). */
  documentId?: string;
  /** Meeting subject shown in the preamble. */
  meetingSubject?: string;
  /** ITU Bureau / Study Group / domain tag for filing conventions. */
  bureau?: string;
  /** Participant names pulled from the calendar invite + diarization. */
  participants?: string[];
  /** Organizer/chair name, if known. */
  organizer?: string;
  /** Optional recap markdown (from MeetingSummary) — included before the transcript. */
  recapMarkdown?: string;
  /** Optional action-items list (Power: "Action Items", Personal: "My follow-ups"). */
  actionItems?: string[];
};

function metaLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 18, color: "555555" }),
      new TextRun({ text: value, size: 18, color: "333333" }),
    ],
  });
}

export async function generateDocx(
  input: DocxExportInput,
  mode: Mode
): Promise<Uint8Array> {
  const copy = COPY[mode];
  const children: Paragraph[] = [];
  const title = input.title || "Untitled recording";
  const isPower = mode === "power";

  // ---------------------------------------------------------------
  // PREAMBLE — document identity
  // Akoma Ntoso calls this the <preamble>. DGACM calls it the
  // document header. Either way, it's the machine- and human-readable
  // "what is this document, for whom, about what, when" block.
  // ---------------------------------------------------------------
  children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));

  if (isPower) {
    if (input.documentId) children.push(metaLine("Document ID", input.documentId));
    if (input.bureau) children.push(metaLine("Bureau / Group", input.bureau));
    if (input.meetingSubject)
      children.push(metaLine("Meeting", input.meetingSubject));
    if (input.startedAt) {
      const start = new Date(input.startedAt);
      const end = input.endedAt ? new Date(input.endedAt) : null;
      const range = end
        ? `${start.toLocaleString()} – ${end.toLocaleTimeString()}`
        : start.toLocaleString();
      children.push(metaLine("Date & time", range));
    }
    if (typeof input.durationMin === "number") {
      children.push(metaLine("Duration", `${input.durationMin.toFixed(0)} min`));
    }
    if (input.organizer) children.push(metaLine("Chair", input.organizer));
    if (input.participants && input.participants.length > 0) {
      children.push(
        metaLine("Participants", input.participants.join(", "))
      );
    }
    children.push(metaLine("Prepared by", "Dhvani — ITU Innovation Hub"));
    children.push(
      metaLine(
        "Notice",
        "Automated transcription. Treat as a working aid, not a verbatim record."
      )
    );
    children.push(new Paragraph({ text: "" }));
  } else {
    // Personal mode — the humble meta line is kept.
    const metaParts: string[] = [];
    if (input.startedAt) {
      metaParts.push(new Date(input.startedAt).toLocaleString());
    }
    if (typeof input.durationMin === "number") {
      metaParts.push(`${input.durationMin.toFixed(0)} min`);
    }
    if (metaParts.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: metaParts.join(" · "),
              italics: true,
              color: "666666",
            }),
          ],
        })
      );
    }
    children.push(new Paragraph({ text: "" }));
  }

  // ---------------------------------------------------------------
  // MAIN BODY — numbered sections
  // AKN4UN numbers top-level sections. DGACM says every heading gets
  // a stable number. We use "1. / 2. / 3." for Power, and skip
  // numbering entirely for Personal so the tone stays informal.
  // ---------------------------------------------------------------
  const section = (n: number, label: string) =>
    isPower ? `${n}. ${label}` : label;

  let sectionNo = 0;

  // Recap section (if generated)
  if (input.recapMarkdown?.trim()) {
    sectionNo += 1;
    children.push(
      new Paragraph({
        text: section(sectionNo, copy.recapHeading),
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const line of input.recapMarkdown.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        children.push(new Paragraph({ text: "" }));
        continue;
      }
      // Convert leading "- " or "* " into a bullet for nicer rendering.
      const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (bulletMatch) {
        children.push(
          new Paragraph({ text: bulletMatch[1] ?? "", bullet: { level: 0 } })
        );
      } else if (trimmed.startsWith("##")) {
        children.push(
          new Paragraph({
            text: trimmed.replace(/^#+\s*/, ""),
            heading: HeadingLevel.HEADING_2,
          })
        );
      } else {
        children.push(new Paragraph({ text: trimmed }));
      }
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Action items section (if any)
  if (input.actionItems && input.actionItems.length > 0) {
    sectionNo += 1;
    children.push(
      new Paragraph({
        text: section(sectionNo, copy.followUpsHeading),
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const item of input.actionItems) {
      children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Transcript section. Power mode paginates it so printed docs have
  // a clean break between recap + actions and the full transcript.
  sectionNo += 1;
  if (isPower) {
    children.push(
      new Paragraph({ children: [new PageBreak()] })
    );
  }
  children.push(
    new Paragraph({
      text: section(sectionNo, isPower ? "Transcript (verbatim)" : "Transcript"),
      heading: HeadingLevel.HEADING_1,
    })
  );

  // Each turn gets a stable 1-based index so Power-mode documents can
  // be cited as "¶12 of ITU-SG17-2026-04-20-rec42". DGACM-adjacent.
  let turnNo = 0;
  for (const entry of input.transcript) {
    turnNo += 1;
    const speaker = input.resolveSpeaker
      ? input.resolveSpeaker(entry.rawSpeaker)
      : entry.speaker;
    const heading = speaker
      ? `${isPower ? `¶${turnNo} · ` : ""}${speaker} · ${entry.timestamp}`
      : `${isPower ? `¶${turnNo} · ` : ""}${entry.timestamp}`;
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${heading}`, bold: true, size: 18, color: "555555" }),
        ],
      })
    );
    children.push(new Paragraph({ text: entry.text }));
    children.push(new Paragraph({ text: "" }));
  }

  // AI-transcription disclaimer. Always appended as the final block so
  // the legal copy travels with every exported .docx. Wording lives in
  // lib/disclaimer.ts; edits to ITU's institutional liability stance
  // flow through one file.
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: "Disclaimer" })],
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: DISCLAIMER_FULL,
          italics: true,
          color: "555555",
          size: 18,
        }),
      ],
    })
  );

  const footerText =
    mode === "power"
      ? "ITU · Internal working notes"
      : "Private notes — Dhvani";

  const doc = new Document({
    creator: "Dhvani",
    title,
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: footerText, size: 16, color: "999999" }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Mode-aware filename prefix for any export. Personal mode keeps the
 * humble "recap-…" naming; Power mode uses the institutional convention.
 */
export function exportFilename(
  mode: Mode,
  ext: string,
  title?: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const prefix = COPY[mode].exportPrefix;
  const base = slug ? `${prefix}-${slug}-${date}` : `${prefix}-${date}`;
  return `${base}.${ext}`;
}
