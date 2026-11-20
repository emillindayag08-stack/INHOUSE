import { prisma } from "../prismaClient.js";
import { caseLabel } from "../utils/caseLabel.js";
import { CASE_PHASE_KEYS, CASE_PHASE_LABELS, casePhase } from "../utils/casePhase.js";

// Everything the Reports page shows is computed here from one pass over the
// case records. The caseload of a single CODI is small enough that pulling
// the cases with their related rows and aggregating in JS is simpler (and
// easier to audit) than a dozen hand-written SQL aggregates.

const DAY_MS = 24 * 60 * 60 * 1000;
// Reporting periods and month buckets follow Philippine time, not UTC, so a
// case filed at 7 a.m. on the 1st lands in the right month.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);
const PRE_VERIFICATION_STATUSES = new Set(["SUBMITTED", "RETURNED_FOR_CORRECTION"]);

export const OFFENSE_KEYS = ["LIGHT", "LESS_GRAVE", "GRAVE", "UNCLASSIFIED"];
export const RESPONDENT_TYPE_KEYS = ["STUDENT", "PERSONNEL"];
export const PATHWAY_KEYS = ["FORMAL_INVESTIGATION", "POSITION_PAPER", "NOT_YET_SET"];
export const CLOSURE_KEYS = ["LIABLE", "NOT_LIABLE", "NO_PRIMA_FACIE", "NONCOMPLIANCE", "ESCALATED", "OTHER"];

// Who is responsible for meeting each deadline (Deadline.stage values, see
// deadlineService.js). The FORMAL CHARGE deadline starts when the charge is
// sent, so it is the respondent's window to answer it.
const DEADLINE_OWNERS = {
  "NOTARIZED COMPLAINT": "Complainant",
  "RESPONDENT RESPONSE": "Respondent",
  "FORMAL CHARGE": "Respondent",
  "CODI REPORT": "Committee",
  "PRELIMINARY INVESTIGATION COMPLETION": "Committee",
  "PRESIDENT DECISION": "University President",
};

const STAGE_DURATIONS = [
  { key: "FILED_TO_VERIFIED", label: "Filing → Verification", from: "filedAt", to: "verifiedAt" },
  { key: "VERIFIED_TO_SHOW_CAUSE", label: "Verification → Show-cause order issued", from: "verifiedAt", to: "showCauseIssuedAt" },
  { key: "SHOW_CAUSE_TO_ANSWER", label: "Show-cause order → Respondent's answer", from: "showCauseIssuedAt", to: "answeredAt" },
  { key: "ANSWER_TO_PRIMA_FACIE", label: "Answer → Prima facie finding", from: "answeredAt", to: "primaFacieAt" },
  { key: "PRIMA_FACIE_TO_CHARGE", label: "Prima facie finding → Formal charge sent", from: "primaFacieAt", to: "formalChargeAt" },
  { key: "CHARGE_TO_DECISION", label: "Formal charge → Final decision", from: "formalChargeAt", to: "decidedAt" },
  { key: "FILED_TO_CLOSED", label: "Filing → Case closed (total)", from: "filedAt", to: "closedAt" },
];

// --- Filters ----------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENUM_FILTERS = {
  respondentType: new Set(RESPONDENT_TYPE_KEYS),
  offense: new Set(OFFENSE_KEYS),
  framework: new Set(["GBSH_CODE", "RACCS"]),
  pathway: new Set(PATHWAY_KEYS),
  caseStatus: new Set(["OPEN", "CLOSED"]),
};

// Turns query-string input into a validated filter object. Unknown or
// malformed values are dropped rather than rejected, so a stale bookmarked
// link still opens the report.
export function parseReportFilters(query) {
  const filters = {};
  if (DATE_RE.test(query.from || "")) filters.from = new Date(`${query.from}T00:00:00+08:00`);
  if (DATE_RE.test(query.to || "")) filters.to = new Date(`${query.to}T23:59:59.999+08:00`);
  if (filters.from && filters.to && filters.from > filters.to) {
    [filters.from, filters.to] = [new Date(`${query.to}T00:00:00+08:00`), new Date(`${query.from}T23:59:59.999+08:00`)];
  }
  if (typeof query.college === "string" && query.college.trim()) filters.college = query.college.trim();
  for (const [key, allowed] of Object.entries(ENUM_FILTERS)) {
    if (allowed.has(query[key])) filters[key] = query[key];
  }
  const stuckDays = Number.parseInt(query.stuckDays, 10);
  filters.stuckDays = Number.isFinite(stuckDays) && stuckDays > 0 && stuckDays <= 365 ? stuckDays : 30;
  return filters;
}

// Plain-language summary of the filters, used in the printed report header
// and in the audit log entry for every export.
export function describeFilters(filters) {
  const fmt = (d) => d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
  const parts = [];
  if (filters.from && filters.to) parts.push(`${fmt(filters.from)} – ${fmt(filters.to)}`);
  else if (filters.from) parts.push(`from ${fmt(filters.from)}`);
  else if (filters.to) parts.push(`until ${fmt(filters.to)}`);
  else parts.push("All time");
  if (filters.college) parts.push(`College: ${filters.college}`);
  if (filters.respondentType) parts.push(`Respondent: ${filters.respondentType === "STUDENT" ? "Student" : "Teaching or Non-Teaching Personnel"}`);
  if (filters.offense) parts.push(`Offense level: ${filters.offense.replace(/_/g, " ").toLowerCase()}`);
  if (filters.framework) parts.push(`Framework: ${filters.framework === "GBSH_CODE" ? "BulSU Anti-GBSH Code" : "RACCS 2025"}`);
  if (filters.pathway) parts.push(`Pathway: ${filters.pathway.replace(/_/g, " ").toLowerCase()}`);
  if (filters.caseStatus) parts.push(`Case status: ${filters.caseStatus === "OPEN" ? "Open" : "Closed"}`);
  return parts.join(" · ");
}

// --- Per-case facts ---------------------------------------------------------

function earliest(dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d));
  return valid.length ? new Date(Math.min(...valid)) : null;
}

function latest(dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d));
  return valid.length ? new Date(Math.max(...valid)) : null;
}

// Case.offenseClassification holds the Committee panel's combined score (or
// an override of it) — see riskScoringService.js. Records scored before that
// was kept up to date fall back to their newest assessment.
function effectiveOffense(caseRecord) {
  if (caseRecord.offenseClassification) return caseRecord.offenseClassification;
  const [newest] = [...caseRecord.riskAssessments].sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt));
  if (newest) return newest.overrideClassification || newest.classification;
  return "UNCLASSIFIED";
}

// Reduces a case and its related rows to the dated milestones the report
// needs. Status changes aren't stored with timestamps, so each milestone is
// read from the record that the corresponding action creates.
function caseFacts(c) {
  const logs = c.auditLogs;
  const firstShowCauseDraft = earliest(c.showCauseOrders.map((o) => o.issuedAt));
  const verificationLogs = logs
    .filter((l) => l.action === "COMPLAINT_VERIFICATION")
    .filter((l) => !firstShowCauseDraft || new Date(l.createdAt) <= firstShowCauseDraft);
  const nonComplianceLog = logs.find((l) => l.action === "CASE_DISMISSED_NONCOMPLIANCE");
  const wasVerified = !PRE_VERIFICATION_STATUSES.has(c.status) && !nonComplianceLog;
  // A returned complaint is verified again after correction, so the approving
  // entry is the last one before the first show-cause order was drafted.
  const verifiedAt = wasVerified || firstShowCauseDraft ? latest(verificationLogs.map((l) => l.createdAt)) : null;

  const [evaluation] = [...c.primaFacieEvals].sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt));
  const decision = c.decision;

  let closure = null;
  let closedAt = null;
  if (TERMINAL_STATUSES.has(c.status)) {
    if (decision) {
      closure = decision.outcome;
      closedAt = decision.decidedAt;
    } else if (c.status === "DISMISSED" && evaluation && !evaluation.found) {
      closure = "NO_PRIMA_FACIE";
      closedAt = evaluation.evaluatedAt;
    } else if (c.status === "DISMISSED" && nonComplianceLog) {
      closure = "NONCOMPLIANCE";
      closedAt = nonComplianceLog.createdAt;
    } else if (c.status === "ESCALATED") {
      closure = "ESCALATED";
      closedAt = c.updatedAt;
    } else {
      closure = "OTHER";
      closedAt = c.updatedAt;
    }
  }

  return {
    id: c.id,
    label: caseLabel(c),
    referenceNumber: c.referenceNumber,
    cpiNumber: c.cpiNumber,
    caseNumber: c.caseNumber,
    status: c.status,
    // One of the nine statuses people see; `status` is the detailed step.
    phase: casePhase(c.status, c.finalPathway),
    isAnonymous: c.isAnonymous,
    notEntertained: Boolean(c.notEntertainedAt),
    filedAt: new Date(c.filedAt),
    college: c.respondentCollegeAtFiling?.trim() || c.respondentUser?.department?.trim() || "Unspecified",
    respondentType: c.respondentTypeAtFiling || c.respondentUser?.userType || null,
    framework: c.governingFramework,
    offense: effectiveOffense(c),
    pathway: c.finalPathway || "NOT_YET_SET",
    verifiedAt,
    showCauseIssuedAt: earliest(
      c.showCauseOrders.filter((o) => o.status === "SERVED").map((o) => o.servedAt)
    ),
    answeredAt: earliest(c.respondentAnswers.filter((a) => a.stage === "SHOW_CAUSE").map((a) => a.submittedAt)),
    primaFacieAt: evaluation ? new Date(evaluation.evaluatedAt) : null,
    primaFacieFound: evaluation ? evaluation.found : null,
    formalChargeAt: earliest(c.formalCharges.map((f) => f.issuedAt)),
    decidedAt: decision ? new Date(decision.decidedAt) : null,
    outcome: decision?.outcome || null,
    penalty: decision?.penalty?.trim() || null,
    closure,
    closedAt: closedAt ? new Date(closedAt) : null,
    isOpen: !TERMINAL_STATUSES.has(c.status),
    lastActivityAt: latest([c.updatedAt, ...logs.map((l) => l.createdAt)]),
    deadlines: c.deadlines,
    hearings: c.hearings,
    primaFacieVotes: c.primaFacieVotes,
    riskAssessments: c.riskAssessments,
    schedulingRounds: c.schedulingRounds,
  };
}

function matchesAttributes(fact, filters) {
  if (filters.college && fact.college !== filters.college) return false;
  if (filters.respondentType && fact.respondentType !== filters.respondentType) return false;
  if (filters.offense && fact.offense !== filters.offense) return false;
  if (filters.framework && fact.framework !== filters.framework) return false;
  if (filters.pathway && fact.pathway !== filters.pathway) return false;
  if (filters.caseStatus && (filters.caseStatus === "OPEN") !== fact.isOpen) return false;
  return true;
}

function filedWithin(fact, from, to) {
  if (from && fact.filedAt < from) return false;
  if (to && fact.filedAt > to) return false;
  return true;
}

async function loadCaseFacts() {
  const cases = await prisma.case.findMany({
    orderBy: { filedAt: "asc" },
    include: {
      respondentUser: { select: { department: true, userType: true } },
      riskAssessments: true,
      primaFacieEvals: true,
      primaFacieVotes: { select: { voterId: true } },
      showCauseOrders: { select: { status: true, issuedAt: true, reviewedAt: true, servedAt: true } },
      respondentAnswers: { select: { stage: true, submittedAt: true } },
      formalCharges: { select: { issuedAt: true } },
      hearings: { select: { type: true, scheduledAt: true } },
      decision: true,
      deadlines: true,
      auditLogs: { select: { action: true, createdAt: true } },
      schedulingRounds: {
        select: { id: true, status: true, slots: { select: { votes: { select: { voterId: true } } } } },
      },
    },
  });
  return cases.map(caseFacts);
}

// --- Aggregation helpers ----------------------------------------------------

const roundDays = (n) => Math.round(n);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

function countBy(items, keyFn, keys) {
  const counts = Object.fromEntries((keys || []).map((k) => [k, 0]));
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function toBreakdown(counts, total) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

function daysBetween(from, to) {
  return (to - from) / DAY_MS;
}

function summarizeDurations(values) {
  if (values.length === 0) return { count: 0, avgDays: null, medianDays: null, maxDays: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: values.length,
    avgDays: roundDays(values.reduce((s, v) => s + v, 0) / values.length),
    medianDays: roundDays(median),
    maxDays: roundDays(sorted[sorted.length - 1]),
  };
}

function monthKey(date) {
  return new Date(new Date(date).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 7);
}

// End of a "YYYY-MM" month, in Philippine time.
function monthEnd(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - MANILA_OFFSET_MS - 1);
}

function monthRange(startDate, endDate) {
  const keys = [];
  let [y, m] = monthKey(startDate).split("-").map(Number);
  const last = monthKey(endDate);
  // Guard against pathological ranges; five years of months is plenty.
  while (keys.length < 60) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    keys.push(key);
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function deadlineBucket(deadline) {
  if (deadline.status === "MET") {
    return deadline.completedAt && new Date(deadline.completedAt) > new Date(deadline.dueAt) ? "late" : "onTime";
  }
  return deadline.status === "OVERDUE" ? "overdue" : "pending";
}

// Headline figures for one cohort — computed for the chosen period and, when
// the period has both ends, for the equally long period just before it.
function headline(cohort) {
  const closed = cohort.filter((f) => !f.isOpen);
  const evaluated = cohort.filter((f) => f.primaFacieFound !== null);
  const found = evaluated.filter((f) => f.primaFacieFound).length;
  const closeDurations = closed.filter((f) => f.closedAt).map((f) => daysBetween(f.filedAt, f.closedAt));
  const deadlines = cohort.flatMap((f) => f.deadlines).map(deadlineBucket);
  const decidedDeadlines = deadlines.filter((b) => b !== "pending");
  return {
    filed: cohort.length,
    closed: closed.length,
    open: cohort.length - closed.length,
    primaFacieRate: pct(found, evaluated.length),
    primaFacieFound: found,
    primaFacieEvaluated: evaluated.length,
    avgDaysToClose: closeDurations.length ? roundDays(closeDurations.reduce((s, v) => s + v, 0) / closeDurations.length) : null,
    deadlineComplianceRate: pct(decidedDeadlines.filter((b) => b === "onTime").length, decidedDeadlines.length),
    liableRate: pct(closed.filter((f) => f.closure === "LIABLE").length, closed.filter((f) => f.decidedAt).length),
  };
}

// --- The report -------------------------------------------------------------

export async function buildReport(filters, { includeParticipation = false } = {}) {
  const now = new Date();
  const facts = await loadCaseFacts();
  const matching = facts.filter((f) => matchesAttributes(f, filters));
  const cohort = matching.filter((f) => filedWithin(f, filters.from, filters.to));

  let previous = null;
  if (filters.from && filters.to) {
    const length = filters.to - filters.from;
    const prevTo = new Date(filters.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - length);
    previous = {
      from: prevFrom,
      to: prevTo,
      ...headline(matching.filter((f) => filedWithin(f, prevFrom, prevTo))),
    };
  }

  const total = cohort.length;
  const closed = cohort.filter((f) => !f.isOpen);

  // Months shown in the trend and workload charts: the chosen period, or from
  // the first filing to today when the report covers all time.
  const rangeStart = filters.from || (matching[0]?.filedAt ?? now);
  const rangeEnd = filters.to && filters.to < now ? filters.to : now;
  const months = monthRange(rangeStart, rangeEnd < rangeStart ? rangeStart : rangeEnd);

  const trend = months.map((month) => {
    const filedThisMonth = cohort.filter((f) => monthKey(f.filedAt) === month);
    return {
      month,
      total: filedThisMonth.length,
      byOffense: countBy(filedThisMonth, (f) => f.offense, OFFENSE_KEYS),
      byRespondentType: countBy(filedThisMonth, (f) => f.respondentType, RESPONDENT_TYPE_KEYS),
    };
  });

  // Anonymous complaints by the month filed, and how screening went: entertained
  // (verified), not entertained under Section 12, or still waiting. A rising
  // not-entertained share is the early sign of anonymous filing being misused.
  // A CPI number is only ever assigned at verification.
  const anonymousOutcome = (f) => (f.notEntertained ? "notEntertained" : f.verifiedAt || f.cpiNumber ? "entertained" : "pending");
  const anonymousCases = cohort.filter((f) => f.isAnonymous);
  const anonymous = {
    months: months.map((month) => {
      const filed = anonymousCases.filter((f) => monthKey(f.filedAt) === month);
      return { month, filed: filed.length, ...countBy(filed, anonymousOutcome, ["entertained", "notEntertained", "pending"]) };
    }),
    totals: { filed: anonymousCases.length, ...countBy(anonymousCases, anonymousOutcome, ["entertained", "notEntertained", "pending"]) },
  };

  // Workload counts activity *during* each month across every case that
  // matches the non-date filters — a case filed last year but closed this
  // month still counts as work closed this month.
  const workload = months.map((month) => {
    const end = monthEnd(month);
    const hearingsThisMonth = matching.flatMap((f) => f.hearings).filter((h) => monthKey(h.scheduledAt) === month);
    return {
      month,
      filed: matching.filter((f) => monthKey(f.filedAt) === month).length,
      closed: matching.filter((f) => f.closedAt && monthKey(f.closedAt) === month).length,
      openAtMonthEnd: matching.filter((f) => f.filedAt <= end && (!f.closedAt || f.closedAt > end)).length,
      preTrialHearings: hearingsThisMonth.filter((h) => h.type === "PRE_TRIAL").length,
      trialHearings: hearingsThisMonth.filter((h) => h.type === "TRIAL").length,
    };
  });

  const stageDurations = STAGE_DURATIONS.map((stage) => {
    const values = cohort
      .filter((f) => f[stage.from] && f[stage.to] && f[stage.to] >= f[stage.from])
      .map((f) => daysBetween(f[stage.from], f[stage.to]));
    return { key: stage.key, label: stage.label, ...summarizeDurations(values) };
  });

  const deadlineRows = {};
  for (const fact of cohort) {
    for (const deadline of fact.deadlines) {
      const row = (deadlineRows[deadline.stage] ||= {
        stage: deadline.stage,
        owner: DEADLINE_OWNERS[deadline.stage] || "—",
        total: 0,
        onTime: 0,
        late: 0,
        overdue: 0,
        pending: 0,
      });
      row.total += 1;
      row[deadlineBucket(deadline)] += 1;
    }
  }
  const deadlineCompliance = Object.values(deadlineRows).map((row) => ({
    ...row,
    complianceRate: pct(row.onTime, row.onTime + row.late + row.overdue),
  }));

  const stuckCases = cohort
    .filter((f) => f.isOpen && f.lastActivityAt)
    .map((f) => ({
      id: f.id,
      label: f.label,
      status: f.status,
      phase: f.phase,
      lastActivityAt: f.lastActivityAt,
      daysIdle: Math.floor(daysBetween(f.lastActivityAt, now)),
    }))
    .filter((row) => row.daysIdle >= filters.stuckDays)
    .sort((a, b) => b.daysIdle - a.daysIdle);

  const liable = closed.filter((f) => f.closure === "LIABLE");
  const sanctions = OFFENSE_KEYS.map((offense) => {
    const rows = liable.filter((f) => f.offense === offense);
    const penalties = countBy(rows, (f) => f.penalty || "Not specified");
    return {
      offense,
      count: rows.length,
      penalties: Object.entries(penalties)
        .map(([penalty, count]) => ({ penalty, count }))
        .sort((a, b) => b.count - a.count),
    };
  }).filter((row) => row.count > 0);

  const report = {
    generatedAt: now,
    filterSummary: describeFilters(filters),
    stuckDays: filters.stuckDays,
    signatories: await loadSignatories(),
    filterOptions: {
      colleges: [...new Set(facts.map((f) => f.college))].sort((a, b) => a.localeCompare(b)),
    },
    headline: headline(cohort),
    previous,
    byStatus: toBreakdown(countBy(cohort, (f) => f.phase, CASE_PHASE_KEYS), total).filter((row) => row.count > 0),
    byCollege: toBreakdown(countBy(cohort, (f) => f.college), total),
    byRespondentType: toBreakdown(countBy(cohort, (f) => f.respondentType, RESPONDENT_TYPE_KEYS), total),
    byFramework: toBreakdown(countBy(cohort, (f) => f.framework, ["GBSH_CODE", "RACCS"]), total),
    byOffense: toBreakdown(countBy(cohort, (f) => f.offense, OFFENSE_KEYS), total),
    byPathway: toBreakdown(countBy(cohort, (f) => f.pathway, PATHWAY_KEYS), total),
    outcomes: toBreakdown(countBy(closed, (f) => f.closure, CLOSURE_KEYS), closed.length),
    sanctions,
    trend,
    anonymous,
    workload,
    stageDurations,
    deadlineCompliance,
    stuckCases,
    // Reference numbers and categories only — no names — so the drill-down
    // lists stay within what every CODI staff member can already see.
    cases: cohort.map((f) => ({
      id: f.id,
      label: f.label,
      status: f.status,
      phase: f.phase,
      filedAt: f.filedAt,
      college: f.college,
      respondentType: f.respondentType,
      framework: f.framework,
      offense: f.offense,
      pathway: f.pathway,
      closure: f.closure,
      closedAt: f.closedAt,
      filedMonth: monthKey(f.filedAt),
      daysOpen: Math.floor(daysBetween(f.filedAt, f.closedAt || now)),
    })),
  };

  if (includeParticipation) {
    report.participation = await buildParticipation(cohort);
  }
  return report;
}

// The Secretariat prepares the printed report and the Chairperson notes it,
// whoever is actually viewing/printing it. There is normally one of each.
async function loadSignatories() {
  const [secretariat, chairperson] = await Promise.all([
    prisma.user.findFirst({ where: { role: "SECRETARIAT" }, orderBy: { fullName: "asc" }, select: { fullName: true } }),
    prisma.user.findFirst({ where: { role: "CHAIRPERSON" }, orderBy: { fullName: "asc" }, select: { fullName: true } }),
  ]);
  return { secretariat: secretariat?.fullName || null, chairperson: chairperson?.fullName || null };
}

// How much each Committee member and the Chairperson has taken part in the
// cases in the report: prima facie votes, meeting availability polls
// answered, and risk assessments.
async function buildParticipation(cohort) {
  const members = await prisma.user.findMany({
    where: { role: { in: ["COMMITTEE", "CHAIRPERSON"] } },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const casesPutToVote = cohort.filter((f) => f.primaFacieVotes.length > 0 || f.primaFacieAt).length;
  const rounds = cohort.flatMap((f) => f.schedulingRounds);

  return members.map((member) => {
    const votesCast = cohort.filter((f) => f.primaFacieVotes.some((v) => v.voterId === member.id)).length;
    const pollsAnswered = rounds.filter((r) =>
      r.slots.some((slot) => slot.votes.some((v) => v.voterId === member.id))
    ).length;
    return {
      id: member.id,
      fullName: member.fullName,
      role: member.role,
      primaFacieVotes: votesCast,
      casesPutToVote,
      meetingPollsAnswered: pollsAnswered,
      meetingPolls: rounds.length,
      riskAssessments: cohort.reduce(
        (sum, f) => sum + f.riskAssessments.filter((r) => r.evaluatedById === member.id).length,
        0
      ),
    };
  });
}

// --- CSV export ---------------------------------------------------------------

const CSV_STATUS = (s) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase());
const CLOSURE_LABELS = {
  LIABLE: "Liable",
  NOT_LIABLE: "Not liable",
  NO_PRIMA_FACIE: "Dismissed — no prima facie case",
  NONCOMPLIANCE: "Dismissed — non-compliance",
  ESCALATED: "Escalated",
  OTHER: "Closed — other",
};

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function reportCasesCsv(report) {
  const dateOnly = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : "");
  const header = [
    "Case / Reference No.",
    "Status",
    "Current step",
    "Filed on",
    "Respondent's college",
    "Respondent type",
    "Governing framework",
    "Offense level",
    "Pathway",
    "Outcome",
    "Closed on",
    "Days open",
  ];
  const rows = report.cases.map((c) => [
    c.label,
    CASE_PHASE_LABELS[c.phase],
    CSV_STATUS(c.status),
    dateOnly(c.filedAt),
    c.college,
    c.respondentType === "STUDENT" ? "Student" : c.respondentType === "PERSONNEL" ? "Teaching or Non-Teaching Personnel" : "",
    c.framework === "GBSH_CODE" ? "BulSU Anti-GBSH Code" : "RACCS 2025",
    c.offense === "UNCLASSIFIED" ? "Not yet classified" : CSV_STATUS(c.offense),
    c.pathway === "NOT_YET_SET" ? "" : CSV_STATUS(c.pathway),
    c.closure ? CLOSURE_LABELS[c.closure] : "Open",
    dateOnly(c.closedAt),
    c.daysOpen,
  ]);
  const lines = [
    [`CODI-IS case report — ${report.filterSummary}`],
    [`Generated ${new Date(report.generatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}. Confidential — for CODI use only.`],
    [],
    header,
    ...rows,
  ];
  // The BOM makes Excel open the file as UTF-8 (en dashes, ñ in names of colleges).
  return "﻿" + lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
}
