/**
 * ITU vocabulary pack v1 — terms the transcription model mishears
 * without priming.
 *
 * Why this exists
 * ---------------
 * Generic ASR models (including gpt-4o-transcribe-diarize) hear "SG-17"
 * as "sergeant 17", "CPM" as "see pm", and have no idea what a
 * "Rapporteur" or "TSAG" is. The Whisper / gpt-4o-transcribe API accepts
 * a `prompt` parameter — a short string of words it should bias toward.
 * It's not ground truth, but pre-seeding domain terms consistently
 * lifts accuracy on acronyms and proper nouns. At ITU the vocabulary
 * is dense enough to be worth shipping as a default.
 *
 * How it's used
 * -------------
 * The Azure OpenAI transcribe provider reads `getTranscriptionPrompt()`
 * and passes the result as the model's `prompt`. User-level vocabulary
 * (from /api/vocabulary) is concatenated after the defaults so a
 * Bureau-specific addition doesn't lose the baseline coverage.
 *
 * Maintenance
 * -----------
 * This list is v1. Iterate when:
 *  - A Study Group or Working Party adds a new workstream.
 *  - A commonly misheard term shows up in error reports.
 *  - Official ITU acronym registers change (ITU-T A-series, ITU-R
 *    constitution).
 *
 * Keep the list under ~250 terms total. The Azure prompt has a 224-token
 * soft ceiling; longer prompts truncate silently and hurt latency.
 */

/**
 * Canonical ITU terms. Kept as bare tokens (acronyms + proper nouns)
 * because the transcribe prompt is concatenated as a single string and
 * definitions would blow past the token budget.
 *
 * Grouped by domain for reviewability only — the getter flattens them.
 */
const ITU_ORGANIZATION = [
  // Core bodies
  "ITU",
  "ITU-T",
  "ITU-R",
  "ITU-D",
  "BDT", // Telecommunication Development Bureau
  "BR", // Radiocommunication Bureau
  "TSB", // Telecommunication Standardization Bureau
  "Plenipotentiary",
  "PP", // Plenipotentiary Conference
  "Council",
  "Secretariat",
  "Secretary-General",
  "Deputy Secretary-General",
  // Geography / common regional groups
  "CEPT",
  "CITEL",
  "APT",
  "ATU",
  "ASMG",
  "RCC",
];

const ITU_CONFERENCES_ASSEMBLIES = [
  "WTSA", // World Telecommunication Standardization Assembly
  "WTDC", // World Telecommunication Development Conference
  "WRC", // World Radiocommunication Conference
  "RA", // Radiocommunication Assembly
  "CPM", // Conference Preparatory Meeting
  "CWG", // Council Working Group
  "WTPF", // World Telecommunication / ICT Policy Forum
  "WSIS", // World Summit on the Information Society
  "GSR", // Global Symposium for Regulators
  "Kaleidoscope",
  "Telecom World",
];

const ITU_T_STUDY_GROUPS = [
  "SG-2",
  "SG-3",
  "SG-5",
  "SG-9",
  "SG-11",
  "SG-12",
  "SG-13",
  "SG-15",
  "SG-16",
  "SG-17",
  "SG-20",
  "SG-21",
  "TSAG", // Telecommunication Standardization Advisory Group
  "FG", // Focus Group
  "JCA", // Joint Coordination Activity
  "Rapporteur",
  "Rapporteurs",
  "Question",
  "Working Party",
  "WP",
];

const ITU_R_STUDY_GROUPS = [
  "SG-1",
  "SG-3",
  "SG-4",
  "SG-5",
  "SG-6",
  "SG-7",
  "CCV", // Coordination Committee for Vocabulary
  "RRB", // Radio Regulations Board
  "BR IFIC",
  "RR", // Radio Regulations
  "GE06", // Geneva 2006 Plan
  "ST61", // Stockholm 1961 Plan
];

const ITU_DOCUMENTS = [
  "TD", // Temporary Document
  "C-Doc", // Contribution Document
  "Liaison Statement",
  "Recommendation",
  "Resolution",
  "Decision",
  "Report",
  "Supplement",
  "Addendum",
  "Handbook",
  "Technical Paper",
  "LS", // Liaison Statement
  "DCAD", // Delegated Contribution Author Document
];

const ITU_TECHNICAL_TERMS = [
  // Radiocommunication + spectrum
  "IMT",
  "IMT-2020",
  "IMT-2030",
  "5G",
  "6G",
  "HAPS", // High Altitude Platform Stations
  "NGSO", // Non-Geostationary Satellite Orbit
  "GSO", // Geostationary Satellite Orbit
  "spectrum",
  "allocation",
  "apportionment",
  "coordination",
  "footnote",
  "Article 5",
  "Appendix 30",
  // Standardization / networking
  "OSI",
  "QoS",
  "QoE",
  "IoT",
  "NGN",
  "IPv6",
  "DPI",
  "MPLS",
  "SDN",
  "NFV",
  "IMSI",
  "ENUM",
  "SMP",
  "ONT",
  "OTN",
  "GPON",
  "PON",
  "OSS",
  "BSS",
  // Security
  "PQC", // Post-Quantum Cryptography
  "X.509",
  "CVE",
  "IOCs",
  // Development / deployment
  "USF", // Universal Service Fund
  "USAF", // Universal Service Access Fund
  "NRI", // National Regulatory Index
  "Meaningful Connectivity",
  "Partner2Connect",
  "Giga",
  "EQUALS",
];

const ITU_COMMON_PROPER_NOUNS = [
  "Geneva",
  "Palais des Nations",
  "Popov room",
  "Member State",
  "Sector Member",
  "Associate",
  "Academia",
  "delegate",
  "delegation",
  "plenary",
  "Bureau",
];

const ITU_UN_FAMILY = [
  "UN",
  "UNDP",
  "UNESCO",
  "UNICEF",
  "WHO",
  "ITU",
  "WIPO",
  "WMO",
  "ICAO",
  "IMO",
  "UPU",
  "ILO",
  "FAO",
  "UN-Women",
  "UNOPS",
  "UN DESA",
  "UNCTAD",
  "UN Global Compact",
  "SDG",
  "SDGs",
];

import { ITU_EXTENDED_TECHNICAL_VOCABULARY } from "./ituTechnicalTerms";

const ALL_TERMS: string[] = [
  ...ITU_ORGANIZATION,
  ...ITU_CONFERENCES_ASSEMBLIES,
  ...ITU_T_STUDY_GROUPS,
  ...ITU_R_STUDY_GROUPS,
  ...ITU_DOCUMENTS,
  ...ITU_TECHNICAL_TERMS,
  ...ITU_COMMON_PROPER_NOUNS,
  ...ITU_UN_FAMILY,
  // Second-tier technical vocabulary from the BR/TSB Recommendations +
  // UNTERM coverage areas. Prompt builder truncates to the ~1200-char
  // cap if this pushes the total over the model's soft token ceiling.
  ...ITU_EXTENDED_TECHNICAL_VOCABULARY,
];

/**
 * Flat, deduped list of default terms. Order preserved for stability —
 * some models weight earlier terms slightly higher.
 */
export const ITU_DEFAULT_VOCABULARY: ReadonlyArray<string> = Array.from(
  new Set(ALL_TERMS.map((t) => t.trim()).filter((t) => t.length > 0))
);

/**
 * Build the prompt string passed to the transcribe model. Accepts any
 * number of extra user terms (from /api/vocabulary) and appends them
 * after the defaults so a deployment can't lose baseline coverage by
 * adding its own list.
 *
 * Soft-caps at `maxChars` (default 1200, well under the 224-token prompt
 * ceiling) — additional terms are dropped to keep latency predictable.
 */
export function buildTranscriptionPrompt(
  userTerms: string[] = [],
  maxChars = 1200
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (t: string) => {
    const term = t.trim();
    if (!term) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(term);
  };
  ITU_DEFAULT_VOCABULARY.forEach(push);
  userTerms.forEach(push);
  let joined = out.join(", ");
  if (joined.length > maxChars) {
    // Truncate at the last full term boundary before the cap.
    const trimmed = joined.slice(0, maxChars);
    const lastSep = trimmed.lastIndexOf(", ");
    joined = lastSep > 0 ? trimmed.slice(0, lastSep) : trimmed;
  }
  return joined;
}
