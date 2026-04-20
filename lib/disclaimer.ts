/**
 * Single source of truth for the AI-transcription disclaimer.
 *
 * Shown (a) in the in-app banner below every transcript, (b) in the
 * footer of every export format (.docx, .md, .txt, .srt, .json), and
 * (c) on the shared-transcript public view. Keeping the wording in
 * one place means a future legal review only touches this file.
 */

/** One-line version for tight surfaces (toolbar hints, tooltips). */
export const DISCLAIMER_SHORT =
  "AI-generated transcript — verify accuracy before use. ITU assumes no liability for errors.";

/** Two-line version for the in-app footer banner. */
export const DISCLAIMER_BANNER =
  "This transcript was produced by AI (Azure OpenAI gpt-4o-transcribe-diarize) and may contain errors, mistranscriptions, or misattributed speakers. " +
  "Users are responsible for verifying accuracy before relying on, citing, or acting on the content.";

/** Full legal paragraph for export footers + the /shared/<token> view. */
export const DISCLAIMER_FULL =
  "This transcript was generated automatically by an artificial-intelligence " +
  "transcription and diarization model (Azure OpenAI gpt-4o-transcribe-diarize). " +
  "The output may contain errors, omissions, mistranscriptions, or incorrect " +
  "attribution of speakers, and should not be treated as a verbatim or " +
  "authoritative record of the underlying conversation. Users are responsible " +
  "for verifying accuracy before relying on, citing, distributing, or acting on " +
  "the content. The International Telecommunication Union (ITU) makes no " +
  "representation or warranty as to completeness or correctness and accepts no " +
  "liability for any decision, action, or consequence arising from use of this " +
  "transcript.";
