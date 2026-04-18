/**
 * Mode-aware .docx export. Forks template on Personal vs Power:
 *   Personal → minimal, no ITU branding, first-person headings
 *   Power    → ITU footer, third-person headings, denser layout
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
  Paragraph,
  TextRun,
} from "docx";
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
  /** Total duration in minutes; surfaced in the meta line. */
  durationMin?: number;
  /** Optional recap markdown (from MeetingSummary) — included before the transcript. */
  recapMarkdown?: string;
  /** Optional action-items list (Power: "Action Items", Personal: "My follow-ups"). */
  actionItems?: string[];
};

export async function generateDocx(
  input: DocxExportInput,
  mode: Mode
): Promise<Uint8Array> {
  const copy = COPY[mode];
  const children: Paragraph[] = [];
  const title = input.title || "Untitled recording";

  children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));

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

  // Recap section (if generated)
  if (input.recapMarkdown?.trim()) {
    children.push(
      new Paragraph({ text: copy.recapHeading, heading: HeadingLevel.HEADING_1 })
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
    children.push(
      new Paragraph({ text: copy.followUpsHeading, heading: HeadingLevel.HEADING_2 })
    );
    for (const item of input.actionItems) {
      children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Transcript section
  children.push(
    new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_1 })
  );
  for (const entry of input.transcript) {
    const speaker = input.resolveSpeaker
      ? input.resolveSpeaker(entry.rawSpeaker)
      : entry.speaker;
    const heading = speaker
      ? `${speaker} · ${entry.timestamp}`
      : entry.timestamp;
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
