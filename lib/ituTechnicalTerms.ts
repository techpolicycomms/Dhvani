/**
 * Extended ITU technical terminology — a second-tier vocabulary list,
 * separate from ituVocabulary.ts so the primary domain terms stay
 * reviewable and tight.
 *
 * Sources (reference only — no live fetch)
 * ----------------------------------------
 * This list is a curated subset of terms found in:
 *
 *   • ITU BR/TSB Terms database
 *     https://www.itu.int/br_tsb_terms — ~30k terms across ITU-R and
 *     ITU-T Recommendations, published and recommended statuses.
 *   • UN Multilingual Terminology (UNTERM)
 *     https://unterm.un.org/unterm2/en/ — ~87k terms across the 6 UN
 *     official languages plus German/Portuguese.
 *   • ITU language tools index
 *     https://www.itu.int/en/general-secretariat/multilingualism/Pages/language-tools.aspx
 *
 * We pre-seed a curated slice (see `docs/VOCABULARY_INGESTION.md` for
 * the plan to ingest the full corpora offline). The prompt ceiling on
 * gpt-4o-transcribe is ~224 tokens, so we pick terms that:
 *   1. the model consistently mishears without priming, AND
 *   2. appear often enough in ITU meetings to be worth the token spend.
 *
 * Anything outside that intersection lives in the user's personal
 * vocabulary (/api/vocabulary) or is added per-Bureau by an admin.
 */

// Radio Regulations / ITU-R terms commonly misheard.
export const ITU_R_TECHNICAL_TERMS = [
  // Spectrum regulation
  "WRC-23",
  "WRC-27",
  "WRC-31",
  "Agenda Item",
  "AI",
  "CPM Report",
  "Recommendation ITU-R",
  "Resolution 123",
  "Resolution 764",
  "Opinion",
  "primary service",
  "secondary service",
  "co-primary",
  "no interference",
  "protection criteria",
  "harmful interference",
  // Bands & notation
  "MHz",
  "GHz",
  "kHz",
  "TDD",
  "FDD",
  "EIRP",
  "PFD",
  "EPFD",
  "uplink",
  "downlink",
  "feeder link",
  "service link",
  "C-band",
  "Ku-band",
  "Ka-band",
  "V-band",
  "Q-band",
  "E-band",
  "S-band",
  "L-band",
  "mmWave",
  "sub-6",
  "sub-THz",
  "THz",
  // Satellite systems
  "GSO satellite",
  "NGSO satellite",
  "LEO",
  "MEO",
  "HEO",
  "constellation",
  "footprint",
  "earth station",
  "gateway",
  "user terminal",
  "ESIM",
  "ESV",
  "ESAA",
  "aeronautical mobile-satellite",
  "fixed-satellite service",
  "mobile-satellite service",
  "broadcasting-satellite service",
  "radionavigation-satellite",
  "FSS",
  "MSS",
  "BSS",
  "RNSS",
  // Terrestrial systems
  "fixed service",
  "mobile service",
  "broadcasting",
  "amateur service",
  "amateur-satellite",
  "radiolocation",
  "radiodetermination",
  "meteorological aids",
  "earth exploration-satellite",
  "EESS",
  "space research",
  // HAPS / stratosphere
  "HAPS",
  "IMT-HAPS",
  "Article 5",
  "Appendix 30",
  "Appendix 30A",
  "Appendix 30B",
];

// ITU-T Standardization terms.
export const ITU_T_TECHNICAL_TERMS = [
  // Numbering & signaling
  "E.164",
  "E.212",
  "E.218",
  "E.118",
  "MCC",
  "MNC",
  "IMSI",
  "ICCID",
  "SS7",
  "SIP",
  "SIP-I",
  "Diameter",
  "ENUM",
  // Transport networks
  "SDH",
  "PDH",
  "OTN",
  "OTH",
  "ODU",
  "OTU",
  "FlexE",
  "FlexO",
  "MPLS-TP",
  "GMPLS",
  "PBB-TE",
  // Access
  "GPON",
  "XG-PON",
  "XGS-PON",
  "NG-PON",
  "NG-PON2",
  "50G-PON",
  "ADSL",
  "ADSL2+",
  "VDSL2",
  "G.fast",
  "G.mgfast",
  "DOCSIS",
  // Video / coding
  "H.264",
  "H.265",
  "H.266",
  "VVC",
  "HEVC",
  "AVC",
  "JPEG",
  "JPEG 2000",
  // QoS / performance
  "Y.1541",
  "Y.1540",
  "P.863",
  "POLQA",
  "PESQ",
  "G.711",
  "G.722",
  "G.729",
  "EVS",
  "AMR",
  "AMR-WB",
  // Emerging
  "IMT-2020 submission",
  "IMT-2030 framework",
  "URLLC",
  "eMBB",
  "mMTC",
  "network slicing",
  "edge computing",
  "network digital twin",
  "deterministic networking",
  "FGNET-2030",
  "Metaverse focus group",
  "AI ML",
  "ML5G",
  // Security / PKI
  "X.509",
  "X.1035",
  "X.1060",
  "X.1372",
  "Quantum key distribution",
  "QKD",
  "Post-quantum",
  "PQC",
  // Regulations / privacy
  "GDPR",
  "eIDAS",
  "NIS2",
  "KYC",
];

// Development-side (ITU-D) terms.
export const ITU_D_TECHNICAL_TERMS = [
  "Partner2Connect",
  "P2C",
  "Giga",
  "EQUALS",
  "Network of Women",
  "NoW",
  "Connect2030",
  "ITU Academy",
  "Centres of Excellence",
  "Smart Village",
  "Smart Island",
  "Smart City",
  "Universal Service Fund",
  "USF",
  "USAF",
  "National Broadband Plan",
  "NBP",
  "digital divide",
  "digital inclusion",
  "digital skills",
  "ICT Indicators",
  "Meaningful Connectivity",
  "affordability",
];

// UN-family multilingualism / governance terms (from UNTERM coverage).
export const UN_GOVERNANCE_TERMS = [
  "General Assembly",
  "Security Council",
  "ECOSOC",
  "UNCTAD",
  "UNESCAP",
  "UNECA",
  "UNECE",
  "UNECLAC",
  "UNESCWA",
  "regional economic commission",
  "Sustainable Development Goals",
  "SDG 4",
  "SDG 5",
  "SDG 9",
  "SDG 16",
  "Agenda 2030",
  "UN80 Initiative",
  "Our Common Agenda",
  "Global Digital Compact",
  "GDC",
  "High-Level Committee on Management",
  "HLCM",
  "Chief Executives Board",
  "CEB",
  "Summit of the Future",
];

/**
 * Flat, deduplicated list of extended technical terms, ready to be
 * merged by `buildTranscriptionPrompt`.
 */
export const ITU_EXTENDED_TECHNICAL_VOCABULARY: ReadonlyArray<string> =
  Array.from(
    new Set(
      [
        ...ITU_R_TECHNICAL_TERMS,
        ...ITU_T_TECHNICAL_TERMS,
        ...ITU_D_TECHNICAL_TERMS,
        ...UN_GOVERNANCE_TERMS,
      ]
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );
