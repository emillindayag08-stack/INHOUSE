import {
  GOVERNING_FRAMEWORK_LABELS,
  OFFENSE_CLASSIFICATION_LABELS,
  PATHWAY_LABELS,
  CASE_PHASE_LABELS,
} from "./constants.js";

// Shared by the Reports page and its printable version, so both read the
// same filters from the URL and label things the same way.

export const REPORT_ROLES = new Set([
  "SECRETARIAT",
  "CHAIRPERSON",
  "COMMITTEE",
  "DISCIPLINING_AUTHORITY",
]);
export const PARTICIPATION_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON"]);

export const FILTER_KEYS = [
  "period",
  "from",
  "to",
  "college",
  "respondentType",
  "offense",
  "framework",
  "pathway",
  "caseStatus",
  "stuckDays",
  "sections",
];

export const PERIOD_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
];

// Which sections the report includes. The Summary always shows; these can
// each be switched off so a report covers only what's needed.
export const SECTION_OPTIONS = [
  { key: "overview", label: "Case overview" },
  { key: "outcomes", label: "Outcomes" },
  { key: "speed", label: "Speed and deadlines" },
  { key: "workload", label: "Workload" },
];

// Every section shows unless "sections" names the ones to keep ("none" for
// all switched off — distinct from the param being absent, which means all).
export function visibleSections(searchParams) {
  const raw = searchParams.get("sections");
  if (!raw) return new Set(SECTION_OPTIONS.map((s) => s.key));
  if (raw === "none") return new Set();
  return new Set(raw.split(",").filter(Boolean));
}

export function periodRange() {
  return { from: "", to: "", name: "All time" };
}

// Filters as the page holds them (from the URL) → query params for the API.
export function apiParamsFrom(searchParams) {
  const period = searchParams.get("period") || "all";
  const params = {};
  if (period === "custom") {
    if (searchParams.get("from")) params.from = searchParams.get("from");
    if (searchParams.get("to")) params.to = searchParams.get("to");
  }
  for (const key of ["college", "respondentType", "offense", "framework", "pathway", "caseStatus", "stuckDays"]) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  return params;
}

export const RESPONDENT_TYPE_LABELS = {
  STUDENT: "Student",
  PERSONNEL: "Teaching or Non-Teaching Personnel",
};

export const CASE_STATUS_LABELS = {
  OPEN: "Open",
  CLOSED: "Closed",
};

export const OFFENSE_LABELS = { ...OFFENSE_CLASSIFICATION_LABELS, UNCLASSIFIED: "Not yet classified" };

export const REPORT_PATHWAY_LABELS = { ...PATHWAY_LABELS, NOT_YET_SET: "Not yet set" };

export const CLOSURE_LABELS = {
  LIABLE: "Found liable",
  NOT_LIABLE: "Found not liable",
  NO_PRIMA_FACIE: "Dismissed — no prima facie case",
  NONCOMPLIANCE: "Dismissed — notarized complaint not filed",
  ESCALATED: "Escalated",
  OTHER: "Closed — other",
};

export const DIMENSION_LABELS = {
  status: CASE_PHASE_LABELS,
  college: null,
  respondentType: RESPONDENT_TYPE_LABELS,
  framework: GOVERNING_FRAMEWORK_LABELS,
  offense: OFFENSE_LABELS,
  pathway: REPORT_PATHWAY_LABELS,
  closure: CLOSURE_LABELS,
};

export function labelFor(dimension, key) {
  return DIMENSION_LABELS[dimension]?.[key] || key;
}

// Series colors. Offense levels run green → amber → red by severity, with
// "not yet classified" in neutral gray.
export const OFFENSE_SERIES = [
  { key: "LIGHT", label: OFFENSE_LABELS.LIGHT, color: "bg-emerald-500" },
  { key: "LESS_GRAVE", label: OFFENSE_LABELS.LESS_GRAVE, color: "bg-amber-500" },
  { key: "GRAVE", label: OFFENSE_LABELS.GRAVE, color: "bg-red-600" },
  { key: "UNCLASSIFIED", label: OFFENSE_LABELS.UNCLASSIFIED, color: "bg-neutral-300" },
];

export const RESPONDENT_SERIES = [
  { key: "STUDENT", label: RESPONDENT_TYPE_LABELS.STUDENT, color: "bg-blue-500" },
  { key: "PERSONNEL", label: RESPONDENT_TYPE_LABELS.PERSONNEL, color: "bg-purple-500" },
];

export function monthLabel(key, opts = { month: "short", year: "numeric" }) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("en-PH", opts);
}

export function formatDays(days) {
  if (days === null || days === undefined) return "—";
  if (days < 1) return days === 0 ? "Same day" : "< 1 day";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatPct(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

// Colour for a percentage that measures how healthy something is: red below
// 40%, amber from 40% to 80%, green above 80%. null (no data) stays neutral.
export function healthTone(pct) {
  if (pct === null || pct === undefined) {
    return { text: "text-neutral-500", bg: "bg-neutral-300", pill: "bg-neutral-100 text-neutral-600", name: "none" };
  }
  if (pct > 80) return { text: "text-green-700", bg: "bg-green-500", pill: "bg-green-100 text-green-800", name: "good" };
  if (pct >= 40) return { text: "text-amber-700", bg: "bg-amber-500", pill: "bg-amber-100 text-amber-800", name: "warning" };
  return { text: "text-red-700", bg: "bg-red-500", pill: "bg-red-100 text-red-800", name: "critical" };
}
