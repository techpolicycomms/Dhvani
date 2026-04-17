/**
 * Role profiles for ITU staff. The profile a user picks during
 * onboarding tunes AI summaries, follow-up emails, suggested
 * vocabulary, and search quick-filters.
 *
 * Shape is shared between client (selection UI, context) and server
 * (summarize + followup prompts) — keep this module free of
 * Node-only imports.
 */

export interface RoleProfile {
  id: string;
  label: string;
  sector: string;
  department: string;
  description: string;

  /** Domain-specific terms — surfaced to Whisper + LLM prompts. */
  vocabulary: string[];
  /** System-prompt instruction block used by /api/summarize. */
  summaryTemplate: string;
  /** Extra instruction for how action items should be formatted. */
  actionItemFormat: string;
  /** Tone guidance for /api/followup email drafting. */
  followUpTone: string;
  /** Short search filter buttons shown on the Transcripts page. */
  quickPhrases: string[];
  /** Meeting type hints (not used yet; reserved for autofill). */
  meetingTypes: string[];
  /** Metrics the role cares about (reserved for future dashboards). */
  kpis: string[];
  /** Working-language defaults for the language-hint dropdown. */
  languages: string[];
  /** Preferred export format order. */
  exportPreferences: string[];
  /** Which dashboard widgets the home page should surface. */
  dashboardWidgets: string[];
}

export const ROLE_PROFILES: RoleProfile[] = [
  // ==============================================================
  // RADIOCOMMUNICATION BUREAU (BR) — ITU-R
  // ==============================================================
  {
    id: "br-spectrum-engineer",
    label: "Spectrum Engineer",
    sector: "ITU-R",
    department: "Radiocommunication Bureau",
    description:
      "Frequency coordination, interference analysis, Radio Regulations",
    vocabulary: [
      "Radio Regulations", "RR", "frequency assignment", "spectrum allocation",
      "harmful interference", "coordination arc", "API", "CR/C", "MIFR",
      "BR IFIC", "due diligence", "ITU-R Study Group", "WRC", "CPM",
      "IMT-2030", "IMT-2020", "5G NR", "6G", "non-GSO", "GSO",
      "power flux density", "PFD", "equivalent power flux density", "EPFD",
      "antenna gain", "feeder loss", "EIRP", "coordination contour",
      "Article 4", "Article 5", "Article 9", "Article 11", "Article 21",
      "Resolution 907", "No. 9.7", "No. 11.31", "Appendix 30", "Appendix 30A",
      "terrestrial services", "space services", "BSS", "FSS", "MSS",
      "Earth station", "space station", "uplink", "downlink", "C-band",
      "Ku-band", "Ka-band", "L-band", "S-band", "UHF", "VHF", "HF",
      "ITU Region 1", "ITU Region 2", "ITU Region 3",
    ],
    summaryTemplate:
      "Structure the meeting summary as:\n" +
      "1. REGULATORY DECISIONS: Any decisions related to Radio Regulations, frequency assignments, or coordination procedures.\n" +
      "2. TECHNICAL FINDINGS: Interference analysis results, propagation studies, compatibility assessments.\n" +
      "3. COORDINATION STATUS: Status of ongoing coordination cases (bilateral/multilateral).\n" +
      "4. WRC PREPARATION: Any items related to upcoming World Radiocommunication Conference agenda.\n" +
      "5. ACTION ITEMS: With clear assignment to administration or BR department.\n" +
      "6. DEADLINES: Filing deadlines, coordination deadlines, regulatory milestones.",
    actionItemFormat:
      "Include: responsible administration/entity, Radio Regulations article reference, deadline, and coordination case number if applicable.",
    followUpTone:
      'Formal diplomatic — goes to national administrations. Use "the Administration of [Country]" not casual names. Reference RR articles.',
    quickPhrases: [
      "harmful interference",
      "frequency coordination",
      "due diligence",
      "BR IFIC",
      "Article 9 examination",
    ],
    meetingTypes: [
      "WRC Preparatory Meeting",
      "Study Group 1",
      "Study Group 4",
      "Study Group 5",
      "Study Group 7",
      "RRB Session",
      "Coordination Meeting",
      "CPM Chapter Meeting",
    ],
    kpis: [
      "Coordination cases processed",
      "Interference cases resolved",
      "MIFR entries updated",
    ],
    languages: ["en", "fr", "es", "ar", "zh", "ru"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "keywordCloud",
    ],
  },
  {
    id: "br-satellite-engineer",
    label: "Satellite Systems Engineer",
    sector: "ITU-R",
    department: "Space Services Department",
    description:
      "Satellite orbit coordination, non-GSO/GSO filing, Appendix 30/30A",
    vocabulary: [
      "non-GSO constellation", "GSO arc", "orbital slot", "coordination arc",
      "Appendix 30", "Appendix 30A", "Appendix 30B", "Article 22",
      "equivalent power flux density", "aggregate interference",
      "Starlink", "OneWeb", "Kuiper", "O3b", "SES", "Intelsat",
      "LEO", "MEO", "GEO", "HEO", "inclination", "orbital period",
      "de-orbiting", "space debris", "collision avoidance",
      "API filing", "CR/C notification", "advance publication",
      "cost recovery", "milestones", "bringing into use",
      "due diligence", "Resolution 35", "Resolution 85",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. FILING STATUS: New/modified satellite network filings discussed.\n" +
      "2. COORDINATION: Bilateral coordination progress with specific administrations.\n" +
      "3. TECHNICAL PARAMETERS: Key orbital/spectrum parameters discussed.\n" +
      "4. REGULATORY COMPLIANCE: Resolution 35/85 milestone compliance.\n" +
      "5. ACTION ITEMS: With filing reference numbers.",
    actionItemFormat:
      "Include satellite network name, filing reference, administration, and milestone deadline.",
    followUpTone:
      "Formal technical — reference filing identifiers and RR provisions.",
    quickPhrases: [
      "satellite filing",
      "orbital position",
      "coordination request",
      "EPFD limits",
      "bringing into use deadline",
    ],
    meetingTypes: [
      "SSD Coordination Meeting",
      "RRB Session",
      "SG 4 Meeting",
      "Bilateral Coordination",
    ],
    kpis: [
      "Filings processed",
      "Coordination agreements completed",
      "Milestone compliance rate",
    ],
    languages: ["en", "fr"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: ["meetingCalendar", "recentTranscripts", "actionTracker"],
  },

  // ==============================================================
  // STANDARDIZATION BUREAU (TSB) — ITU-T
  // ==============================================================
  {
    id: "tsb-standards-expert",
    label: "Standardization Expert",
    sector: "ITU-T",
    department: "Telecommunication Standardization Bureau",
    description:
      "Development of ITU-T Recommendations, Study Group work, WTSA preparation",
    vocabulary: [
      "ITU-T Recommendation", "Recommendation", "Study Group", "SG",
      "WTSA", "TSAG", "Focus Group", "Rapporteur Group",
      "consent", "determination", "AAP", "TAP",
      "Contribution", "TD", "liaison statement", "living document",
      "SG2", "SG3", "SG5", "SG9", "SG11", "SG12", "SG13", "SG15",
      "SG16", "SG17", "SG20",
      "Y-series", "G-series", "H-series", "X-series", "Q-series",
      "IMT", "NGN", "IoT", "smart cities", "DLT", "blockchain",
      "AI/ML standards", "quantum computing", "e-health",
      "security standards", "identity management", "PKI",
      "optical transport", "OTN", "DWDM", "PON", "GPON",
      "quality of service", "QoS", "QoE", "mean opinion score",
      "Revised text", "new Question", "work programme",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. RECOMMENDATIONS: New/revised Recommendations discussed, status (consent/determination/AAP).\n" +
      "2. STUDY QUESTIONS: Progress on active Questions, new Questions proposed.\n" +
      "3. CONTRIBUTIONS: Key contributions reviewed (by document number).\n" +
      "4. LIAISON: Liaison statements sent/received (to/from which body).\n" +
      "5. EDITORIAL: Text changes agreed, editor assignments.\n" +
      "6. NEXT STEPS: Rapporteur meetings, interim working, contribution deadlines.",
    actionItemFormat:
      "Include: Recommendation number or Question number, responsible Rapporteur, contribution deadline, and meeting reference.",
    followUpTone:
      "Technical and precise. Reference document numbers (TD xxx, C xxx). Use ITU-T terminology correctly.",
    quickPhrases: [
      "consent procedure",
      "liaison statement",
      "Rapporteur meeting",
      "revised Recommendation",
      "new Question",
    ],
    meetingTypes: [
      "Study Group Plenary",
      "Working Party Meeting",
      "Rapporteur Group",
      "TSAG",
      "Focus Group",
      "WTSA Preparatory",
    ],
    kpis: [
      "Recommendations consented",
      "Contributions processed",
      "Liaison statements",
    ],
    languages: ["en", "fr", "es", "ar", "zh", "ru"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "contributionDeadlines",
    ],
  },

  // ==============================================================
  // DEVELOPMENT BUREAU (BDT) — ITU-D
  // ==============================================================
  {
    id: "bdt-programme-officer",
    label: "Programme Officer",
    sector: "ITU-D",
    department: "Telecommunication Development Bureau",
    description:
      "Project coordination, capacity building, regional development activities",
    vocabulary: [
      "WTDC", "TDAG", "Action Plan", "regional initiative",
      "RPM", "Regional Preparatory Meeting", "Kigali Action Plan",
      "ITU-D Study Group 1", "ITU-D Study Group 2",
      "digital inclusion", "digital transformation", "ICT4SDG",
      "universal access", "broadband development", "digital skills",
      "cybersecurity capacity building", "emergency telecommunications",
      "LDC", "LLDC", "SIDS", "developing countries",
      "project document", "project proposal", "donor agreement",
      "resource mobilization", "partnership", "MoU",
      "technical assistance", "country profile", "ICT statistics",
      "Global Connectivity Report", "ICT Development Index",
      "regional office", "area office", "field mission",
      "gender mainstreaming", "digital gender divide",
      "smart village", "smart island", "e-waste",
      "OSEE", "Digital Public Goods", "DPG",
      "Connect 2030 Agenda", "Partner2Connect",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. PROJECT STATUS: Updates on active projects (by project code/name).\n" +
      "2. REGIONAL ACTIVITIES: Country/region-specific developments.\n" +
      "3. PARTNERSHIPS: New/ongoing partnerships, donor engagement, MoU status.\n" +
      "4. CAPACITY BUILDING: Training programmes, workshops planned/completed.\n" +
      "5. RESOURCE MOBILIZATION: Funding secured/needed, proposal status.\n" +
      "6. MEMBER STATE REQUESTS: New requests from administrations.\n" +
      "7. ACTION ITEMS: With responsible officer, region, and timeline.",
    actionItemFormat:
      "Include: project code, responsible officer name, regional office (if applicable), deadline, budget implication (if any).",
    followUpTone:
      'Professional but warm. Development sector is people-focused. Mention Member State names, acknowledge contributions. Use "assistance" not "aid".',
    quickPhrases: [
      "project implementation",
      "capacity building",
      "regional initiative",
      "technical assistance",
      "resource mobilization",
    ],
    meetingTypes: [
      "Project Review Meeting",
      "Regional Preparatory Meeting",
      "TDAG",
      "Donor Coordination",
      "Country Consultation",
      "Study Group 1",
      "Study Group 2",
    ],
    kpis: [
      "Projects delivered",
      "Countries assisted",
      "Funds mobilized",
      "Training participants",
    ],
    languages: ["en", "fr", "es", "ar"],
    exportPreferences: ["pdf", "txt", "json"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "projectTimeline",
      "regionMap",
    ],
  },
  {
    id: "bdt-regional-officer",
    label: "Regional Programme Officer",
    sector: "ITU-D",
    department: "Regional Office",
    description:
      "Field operations, country engagement, regional project delivery",
    vocabulary: [
      "regional office", "area office", "field mission",
      "country assessment", "national ICT plan", "regulatory framework",
      "telecom regulator", "ministry of ICT", "Member State",
      "administration", "focal point", "national consultation",
      "broadband plan", "universal service fund", "USF",
      "spectrum management", "licensing framework",
      "emergency telecommunications", "disaster response",
      "digital identity", "digital financial services",
      "mobile broadband", "last mile connectivity",
      "community networks", "rural connectivity",
      "public-private partnership", "PPP",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. COUNTRY UPDATES: Activities per country discussed.\n" +
      "2. PROJECT DELIVERY: Implementation progress in the field.\n" +
      "3. STAKEHOLDER ENGAGEMENT: Meetings with government, regulators, operators.\n" +
      "4. CHALLENGES: Obstacles encountered, support needed from HQ.\n" +
      "5. UPCOMING MISSIONS: Travel plans, field visits scheduled.\n" +
      "6. ACTION ITEMS: With country, responsible person, timeline.",
    actionItemFormat:
      "Include: country name, local counterpart, Geneva support needed (if any), deadline.",
    followUpTone:
      "Warm and collaborative. Often with national government officials. Use appropriate titles (Minister, Director General, Commissioner).",
    quickPhrases: [
      "country mission",
      "national consultation",
      "regulatory reform",
      "broadband deployment",
      "stakeholder meeting",
    ],
    meetingTypes: [
      "Country Consultation",
      "Donor Meeting",
      "Regional Forum",
      "National Workshop",
      "Area Office Coordination",
    ],
    kpis: [
      "Countries visited",
      "Projects launched in field",
      "Stakeholders engaged",
    ],
    languages: ["en", "fr", "es", "ar", "pt"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "regionMap",
      "actionTracker",
    ],
  },
  {
    id: "bdt-cybersecurity",
    label: "Cybersecurity Officer",
    sector: "ITU-D",
    department: "Digital Networks & Environment",
    description:
      "National cybersecurity capacity building, GCI, CIRTs, child online protection",
    vocabulary: [
      "Global Cybersecurity Index", "GCI", "CIRT", "CERT", "CSIRT",
      "national cybersecurity strategy", "NCS", "cyber drill",
      "child online protection", "COP", "cybersecurity maturity",
      "critical infrastructure protection", "CIP",
      "incident response", "threat intelligence", "malware analysis",
      "capacity building", "cyber hygiene", "awareness campaign",
      "Budapest Convention", "AU Malabo Convention",
      "ITU-T X.1205", "ITU-T X.509", "PKI", "zero trust",
      "ransomware", "phishing", "DDoS", "supply chain attack",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. THREAT LANDSCAPE: Any cyber threats or incidents discussed.\n" +
      "2. CAPACITY BUILDING: Training programmes, workshops, cyber drills.\n" +
      "3. NATIONAL STRATEGIES: Country-specific cybersecurity strategy progress.\n" +
      "4. GCI: Global Cybersecurity Index related activities.\n" +
      "5. TECHNICAL ASSISTANCE: CIRT development, incident response support.\n" +
      "6. ACTION ITEMS: With urgency level for security items.",
    actionItemFormat:
      "Include urgency (critical/high/medium/low), responsible team, country if applicable, deadline.",
    followUpTone:
      "Professional and security-aware. Never include sensitive vulnerability details in transcripts or summaries.",
    quickPhrases: [
      "cyber capacity building",
      "national CIRT",
      "GCI assessment",
      "cyber drill",
      "incident response",
    ],
    meetingTypes: [
      "Cybersecurity Coordination",
      "Cyber Drill Planning",
      "GCI Review",
      "CIRT Assessment",
      "SG17 Session",
    ],
    kpis: [
      "Countries with national strategy",
      "CIRTs established",
      "Training participants",
    ],
    languages: ["en", "fr", "es"],
    exportPreferences: ["pdf"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "securityAlerts",
    ],
  },

  // ==============================================================
  // GENERAL SECRETARIAT
  // ==============================================================
  {
    id: "gs-policy-analyst",
    label: "Policy Analyst / Advisor",
    sector: "General Secretariat",
    department: "Strategic Planning & Membership",
    description:
      "Policy analysis, PP resolutions, Council working groups, strategic planning",
    vocabulary: [
      "Plenipotentiary Conference", "PP", "Council", "Council Working Group",
      "CWG", "Resolution", "Decision", "strategic plan",
      "Connect 2030 Agenda", "WSIS", "WSIS+20", "GDC",
      "Global Digital Compact", "digital cooperation",
      "Secretary-General", "Deputy Secretary-General",
      "Member State", "Sector Member", "Associate", "Academia",
      "contribution", "proposal", "amendment",
      "financial plan", "budget", "cost recovery",
      "governance", "reform", "institutional framework",
      "UN system coordination", "UNGIS", "CEB",
      "data governance", "AI governance", "ethics",
      "digital sovereignty", "cross-border data flows",
      "human rights", "freedom of expression",
      "multilingualism", "accessibility",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. POLICY POSITIONS: Positions expressed by Member States or groups.\n" +
      "2. RESOLUTIONS: Status of relevant PP/Council resolutions.\n" +
      "3. STRATEGIC ITEMS: Connect 2030 Agenda, WSIS+20, GDC updates.\n" +
      "4. GOVERNANCE: Institutional reform, Council working group progress.\n" +
      "5. COORDINATION: Inter-agency coordination (UN system, WSIS stakeholders).\n" +
      "6. POLITICAL DYNAMICS: Notable shifts in Member State positions (handle sensitively).\n" +
      "7. ACTION ITEMS: With political sensitivity flag if needed.",
    actionItemFormat:
      "Include: relevant Resolution number, responsible department, political sensitivity (low/medium/high), deadline.",
    followUpTone:
      'Highly diplomatic. These summaries may be read by ambassadors and senior officials. Neutral language. "The delegation of [Country] expressed the view that..." not "Country X wants..."',
    quickPhrases: [
      "Member State position",
      "Council resolution",
      "strategic plan implementation",
      "WSIS follow-up",
      "governance reform",
    ],
    meetingTypes: [
      "Council Session",
      "CWG Meeting",
      "PP Preparatory",
      "WSIS Forum",
      "UNGIS Coordination",
      "Senior Management Team",
    ],
    kpis: [
      "Resolutions implemented",
      "Member State engagement",
      "Strategic plan milestones",
    ],
    languages: ["en", "fr", "es", "ar", "zh", "ru"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "resolutionTracker",
    ],
  },
  {
    id: "gs-finance",
    label: "Finance & Budget Officer",
    sector: "General Secretariat",
    department: "Financial Resources Management",
    description:
      "Budget planning, IPSAS reporting, cost recovery, financial oversight",
    vocabulary: [
      "IPSAS", "biennial budget", "financial plan", "cost recovery",
      "assessed contribution", "voluntary contribution", "arrears",
      "extra-budgetary", "trust fund", "special account",
      "allotment", "obligation", "expenditure", "commitment",
      "budget performance", "variance analysis", "cash flow",
      "financial statements", "audit", "external auditor",
      "internal audit", "OIOS", "JIU",
      "procurement", "contract", "purchase order",
      "staff costs", "post adjustment", "common system",
      "exchange rate", "Swiss franc", "US dollar",
      "ERP", "SAP", "IRIS",
      "Run-Grow-Transform", "ICT investment",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. BUDGET STATUS: Current budget execution rate, variances.\n" +
      "2. FINANCIAL DECISIONS: Approvals, reallocations, new commitments.\n" +
      "3. REPORTING: IPSAS compliance, audit findings, management responses.\n" +
      "4. PROCUREMENT: Contract awards, procurement actions.\n" +
      "5. COST RECOVERY: Revenue vs expenditure for cost-recovery activities.\n" +
      "6. RISK: Financial risks identified, mitigation measures.\n" +
      "7. ACTION ITEMS: With budget code/allotment reference if applicable.",
    actionItemFormat:
      "Include: budget code, amount (CHF/USD), responsible officer, deadline, approval status.",
    followUpTone:
      "Precise and formal. Reference budget codes and IPSAS standards. Numbers must be exact.",
    quickPhrases: [
      "budget execution",
      "variance analysis",
      "IPSAS compliance",
      "cost recovery",
      "financial statements",
    ],
    meetingTypes: [
      "Budget Committee",
      "Finance Meeting",
      "Audit Review",
      "Procurement Board",
      "IPSAS Steering",
    ],
    kpis: [
      "Budget execution rate",
      "Audit recommendations closed",
      "Arrears collected",
    ],
    languages: ["en", "fr"],
    exportPreferences: ["pdf", "json"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "budgetSnapshot",
    ],
  },
  {
    id: "gs-hr",
    label: "Human Resources Officer",
    sector: "General Secretariat",
    department: "Human Resources Management",
    description:
      "Recruitment, staff development, performance management, workforce planning",
    vocabulary: [
      "vacancy notice", "job opening", "recruitment", "selection",
      "competency-based interview", "CBI", "assessment centre",
      "staff regulations", "staff rules", "ICSC",
      "P-level", "G-level", "D-level", "ASG", "USG",
      "fixed-term", "short-term", "consultant", "secondment",
      "JPO", "Young Professionals Programme", "YPP",
      "performance management", "PMS", "work plan", "KPI",
      "training", "learning and development", "e-learning",
      "gender parity", "geographical representation",
      "duty station", "hardship", "mobility",
      "AMRS", "rebuttal", "appeal", "ILOAT",
      "separation", "retirement", "UNJSPF",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. RECRUITMENT: Active vacancies, selection decisions, candidate pools.\n" +
      "2. STAFF MATTERS: Contract actions, promotions, mobility.\n" +
      "3. POLICY: HR policy updates, staff regulation changes.\n" +
      "4. PERFORMANCE: PMS cycle updates, training initiatives.\n" +
      "5. DIVERSITY: Gender parity, geographical representation metrics.\n" +
      "6. SENSITIVE ITEMS: Flag any items requiring confidential handling.\n" +
      "7. ACTION ITEMS: With HR reference number if applicable.",
    actionItemFormat:
      "Include: vacancy/case reference number, responsible HR officer, confidentiality flag, deadline.",
    followUpTone:
      "Professional and confidential. HR matters are sensitive. Never include names of candidates in summaries unless explicitly authorized.",
    quickPhrases: [
      "vacancy notice",
      "selection decision",
      "performance review",
      "training programme",
      "gender parity",
    ],
    meetingTypes: [
      "Selection Board",
      "HR Committee",
      "Staff-Management Coordination",
      "Training Planning",
      "Workforce Planning",
    ],
    kpis: [
      "Vacancies filled",
      "Time to hire",
      "Gender parity ratio",
      "Training hours",
    ],
    languages: ["en", "fr"],
    exportPreferences: ["pdf"],
    dashboardWidgets: ["meetingCalendar", "recentTranscripts", "actionTracker"],
  },
  {
    id: "gs-it-innovation",
    label: "IT / Digital Transformation Officer",
    sector: "General Secretariat",
    department: "Information Services / Innovation Hub",
    description:
      "IT infrastructure, digital transformation, innovation programmes, AI tools",
    vocabulary: [
      "digital transformation", "innovation", "AI", "machine learning",
      "Copilot", "Microsoft 365", "Power Platform", "Power BI",
      "Power Apps", "Power Automate", "SharePoint", "Teams",
      "Azure", "cloud", "SaaS", "infrastructure",
      "cybersecurity", "identity management", "Entra ID",
      "ERP", "IRIS", "SAP", "CRM",
      "service desk", "ITSM", "incident management",
      "UN80", "data strategy", "data governance",
      "automation", "workflow", "process improvement",
      "Green ICT", "sustainability", "carbon footprint",
      "user adoption", "change management", "training",
      "Dhvani", "transcription", "AI governance",
      "Run-Grow-Transform", "ICT investment portfolio",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. SYSTEMS STATUS: IT infrastructure updates, incidents, deployments.\n" +
      "2. TRANSFORMATION: Digital transformation programme progress.\n" +
      "3. AI/INNOVATION: New AI tools, Copilot adoption, innovation initiatives.\n" +
      "4. SECURITY: Cybersecurity posture, incidents, patches.\n" +
      "5. USER IMPACT: Adoption metrics, user feedback, training needs.\n" +
      "6. VENDOR/PROCUREMENT: Licensing, contract renewals, vendor meetings.\n" +
      "7. ACTION ITEMS: With IT priority (P1-P4), responsible team, deadline.",
    actionItemFormat:
      "Include: IT priority (P1-P4), system/platform affected, responsible team, deadline, ticket number if applicable.",
    followUpTone:
      "Technical but accessible. These often go to non-technical stakeholders (CIO, directors). Explain impact in business terms.",
    quickPhrases: [
      "system deployment",
      "user adoption",
      "Copilot rollout",
      "security patch",
      "digital transformation",
    ],
    meetingTypes: [
      "ICT Committee",
      "Innovation Hub Weekly",
      "IT Steering",
      "Security Review",
      "Vendor Meeting",
      "UN80 Working Group",
    ],
    kpis: [
      "System uptime",
      "User adoption rate",
      "Tickets resolved",
      "AI tool usage",
    ],
    languages: ["en", "fr"],
    exportPreferences: ["pdf", "json", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "systemStatus",
      "adoptionMetrics",
    ],
  },
  {
    id: "gs-events-conferences",
    label: "Conference / Events Officer",
    sector: "General Secretariat",
    department: "Conferences & Publications",
    description:
      "Event logistics, documentation, interpretation, delegate services",
    vocabulary: [
      "Plenipotentiary", "World Conference", "Council",
      "Study Group", "Working Party", "Rapporteur Group",
      "plenary", "committee", "sub-committee",
      "document", "contribution", "input document",
      "DT", "TD", "addendum", "corrigendum",
      "interpretation", "translation", "documentation",
      "registration", "credentials", "delegation",
      "head of delegation", "observer", "fellowship",
      "CICG", "Varembé", "Montbrillant", "Tower",
      "side event", "exhibition", "high-level segment",
      "virtual participation", "hybrid meeting",
      "rapporteur", "chairman", "vice-chairman",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. LOGISTICS: Venue, room setup, technical requirements.\n" +
      "2. DOCUMENTATION: Documents status (in production, translated, distributed).\n" +
      "3. REGISTRATION: Delegate numbers, credential issues.\n" +
      "4. PROGRAMME: Session schedule, speakers confirmed, changes.\n" +
      "5. INTERPRETATION: Language requirements, interpreter assignments.\n" +
      "6. ISSUES: Any problems to escalate (AV, catering, security).\n" +
      "7. ACTION ITEMS: With responsible unit and timing (often urgent).",
    actionItemFormat:
      "Include: event name, session/room, responsible unit, deadline (often same-day), urgency flag.",
    followUpTone:
      "Operational and clear. Time-sensitive. Use bullet points for quick scanning.",
    quickPhrases: [
      "room setup",
      "documentation deadline",
      "interpretation",
      "registration",
      "delegate badge",
    ],
    meetingTypes: [
      "Event Planning",
      "Conference Coordination",
      "Documentation Meeting",
      "AV Technical Check",
    ],
    kpis: [
      "Events delivered",
      "Documents published on time",
      "Delegate satisfaction",
    ],
    languages: ["en", "fr", "es", "ar", "zh", "ru"],
    exportPreferences: ["pdf", "txt"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "eventCountdown",
    ],
  },
  {
    id: "gs-legal",
    label: "Legal Advisor",
    sector: "General Secretariat",
    department: "Legal Affairs",
    description:
      "Legal opinions, agreements, privileges and immunities, dispute resolution",
    vocabulary: [
      "Constitution", "Convention", "Radio Regulations",
      "host country agreement", "headquarters agreement",
      "privileges and immunities", "MoU", "cooperation agreement",
      "contractual dispute", "arbitration", "mediation",
      "intellectual property", "copyright", "data protection",
      "GDPR", "staff regulation", "staff rule",
      "appeal", "ILOAT", "rebuttal",
      "procurement", "due diligence", "compliance",
      "ethics", "conflicts of interest", "disclosure",
      "delegation of authority", "power of attorney",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. LEGAL OPINIONS: Questions raised and legal advice provided.\n" +
      "2. AGREEMENTS: Status of agreements under negotiation/review.\n" +
      "3. DISPUTES: Active disputes or potential litigation (CONFIDENTIAL).\n" +
      "4. COMPLIANCE: Regulatory compliance issues.\n" +
      "5. POLICY: Legal implications of proposed policies.\n" +
      "6. SENSITIVE: Flag items requiring legal professional privilege.\n" +
      "7. ACTION ITEMS: With legal risk level (low/medium/high/critical).",
    actionItemFormat:
      "Include: matter reference, legal risk level, deadline, confidentiality flag.",
    followUpTone:
      'Formal and precise. Legal language. Always flag confidentiality requirements. Use "legal privilege" marking where appropriate.',
    quickPhrases: [
      "legal opinion",
      "MoU review",
      "compliance",
      "dispute resolution",
      "privileges and immunities",
    ],
    meetingTypes: [
      "Legal Review",
      "Contract Negotiation",
      "Compliance Meeting",
      "Ethics Committee",
    ],
    kpis: [
      "Agreements finalized",
      "Disputes resolved",
      "Legal opinions delivered",
    ],
    languages: ["en", "fr"],
    exportPreferences: ["pdf"],
    dashboardWidgets: ["meetingCalendar", "recentTranscripts", "actionTracker"],
  },

  // ==============================================================
  // CROSS-CUTTING
  // ==============================================================
  {
    id: "cross-communications",
    label: "Communications / Public Information Officer",
    sector: "General Secretariat",
    department: "Communication & Media",
    description:
      "Press, social media, publications, public outreach, advocacy",
    vocabulary: [
      "press release", "media advisory", "talking points",
      "social media", "X/Twitter", "LinkedIn", "Instagram",
      "website", "news article", "blog post", "op-ed",
      "media inquiry", "interview", "press conference",
      "publication", "flagship report", "infographic",
      "brand guidelines", "visual identity", "tone of voice",
      "stakeholder engagement", "advocacy", "campaign",
      "World Telecommunication Day", "WTISD",
      "Girls in ICT Day", "GDC", "WSIS",
      "photography", "videography", "podcast",
      "analytics", "engagement rate", "reach",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. MEDIA: Press coverage, media inquiries, interview requests.\n" +
      "2. PUBLICATIONS: Status of reports, articles, blog posts in production.\n" +
      "3. CAMPAIGNS: Active campaigns, social media metrics.\n" +
      "4. EVENTS: Communication support for upcoming events.\n" +
      "5. MESSAGING: Key messages agreed, talking points developed.\n" +
      "6. CRISIS: Any crisis communication needs (flag immediately).\n" +
      "7. ACTION ITEMS: With publication/post deadline.",
    actionItemFormat:
      "Include: content type (press release/social/web), target publication date, reviewer, approval chain.",
    followUpTone:
      "Clear and engaging. Communications officers write for external audiences — summaries should reflect that mindset.",
    quickPhrases: [
      "press release",
      "social media",
      "talking points",
      "media inquiry",
      "campaign launch",
    ],
    meetingTypes: [
      "Editorial Meeting",
      "Campaign Planning",
      "Media Briefing Prep",
      "Website Review",
      "Crisis Communication",
    ],
    kpis: ["Media mentions", "Social media reach", "Publications delivered"],
    languages: ["en", "fr"],
    exportPreferences: ["txt", "pdf"],
    dashboardWidgets: [
      "meetingCalendar",
      "recentTranscripts",
      "actionTracker",
      "mediaMonitor",
    ],
  },
  {
    id: "cross-general",
    label: "General / Other",
    sector: "All",
    department: "General",
    description: "Default profile — works for any role",
    vocabulary: [
      "ITU", "Member State", "Sector Member",
      "meeting", "conference", "workshop",
      "decision", "recommendation", "resolution",
      "action item", "follow-up", "deadline",
    ],
    summaryTemplate:
      "Structure as:\n" +
      "1. KEY DECISIONS: Main decisions or agreements reached.\n" +
      "2. DISCUSSION POINTS: Key topics discussed.\n" +
      "3. ACTION ITEMS: Tasks assigned with responsible person and deadline.\n" +
      "4. NEXT MEETING: Date and agenda for follow-up.",
    actionItemFormat:
      "Include: task description, responsible person, deadline.",
    followUpTone: "Professional and clear.",
    quickPhrases: ["follow-up", "action item", "next steps", "deadline"],
    meetingTypes: ["Team Meeting", "Coordination Meeting", "Review Meeting"],
    kpis: [],
    languages: ["en", "fr"],
    exportPreferences: ["txt", "pdf"],
    dashboardWidgets: ["meetingCalendar", "recentTranscripts", "actionTracker"],
  },
];

/**
 * Lookup by id. Returns the "cross-general" fallback when the id
 * doesn't match — safe to call on untrusted input.
 */
export function findRoleProfile(id: string | null | undefined): RoleProfile {
  if (id) {
    const match = ROLE_PROFILES.find((r) => r.id === id);
    if (match) return match;
  }
  return ROLE_PROFILES.find((r) => r.id === "cross-general")!;
}

/** Group profiles by sector for the onboarding UI. */
export function profilesBySector(): Record<string, RoleProfile[]> {
  const out: Record<string, RoleProfile[]> = {};
  for (const p of ROLE_PROFILES) {
    (out[p.sector] ??= []).push(p);
  }
  return out;
}
