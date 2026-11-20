import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { DEADLINE_STAGE_LABELS } from "../lib/constants.js";
import { CASE_PHASE_ORDER } from "../lib/constants.js";
import {
  OFFENSE_SERIES,
  REPORT_ROLES,
  apiParamsFrom,
  formatDate,
  formatDays,
  formatPct,
  labelFor,
  monthLabel,
  visibleSections,
} from "../lib/reports.js";
import { clearLastPageSpacer, placeAtLastPageBottom } from "../lib/lastPageStamp.js";

// Printable version of the Reports page, on the same letterhead as the
// printed complaint. "Print / Save as PDF" uses the browser's print dialog,
// and each use is recorded in the audit log.
export default function PrintReportPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const apiParams = useMemo(() => apiParamsFrom(searchParams), [searchParams]);
  const paramsKey = JSON.stringify(apiParams);

  useEffect(() => {
    if (!REPORT_ROLES.has(user.role)) return;
    api
      .get("/reports", { params: apiParams })
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load the report"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, user.role]);

  // The printed-by stamp sits at the bottom of the last printed page. The
  // spacer above it is sized just before printing (lib/lastPageStamp.js),
  // whether printing starts from the button or the browser's own Print.
  const sheetRef = useRef(null);
  const spacerRef = useRef(null);
  const stampRef = useRef(null);
  useEffect(() => {
    if (!report) return undefined;
    const before = () => placeAtLastPageBottom(sheetRef.current, spacerRef.current, stampRef.current);
    const after = () => clearLastPageSpacer(spacerRef.current);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [report]);

  const backHref = `/reports?${searchParams.toString()}`;

  if (!REPORT_ROLES.has(user.role)) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-neutral-600">
        Reports are only available to CODI and the Disciplining Authority.
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-red-600">
        {error} — <Link to={backHref} className="text-maroon underline">back to reports</Link>
      </div>
    );
  }
  if (!report) return <div className="mx-auto max-w-2xl p-8 text-sm text-neutral-500">Loading…</div>;

  const print = async () => {
    try {
      await api.post("/reports/export-log", apiParams);
    } catch {
      // Printing shouldn't be blocked if the log call fails.
    }
    window.print();
  };

  const h = report.headline;
  const p = report.previous;
  const monthsWithActivity = report.workload.filter(
    (m) => m.filed || m.closed || m.openAtMonthEnd || m.preTrialHearings || m.trialHearings
  );
  const sections = visibleSections(searchParams);
  const ROMAN = ["I", "II", "III", "IV", "V"];
  let romanIndex = 0;
  const nextRoman = () => ROMAN[romanIndex++];
  const generated = new Date(report.generatedAt);
  const generatedDate = generated.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const generatedTime = generated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
  // Who printed it and when: the last thing in the report, at the bottom of
  // the last printed page.
  const stampLines = [`Name: ${user.fullName}`, `Date: ${generatedDate}`, `Time: ${generatedTime}`];

  return (
    <div className="min-h-dvh bg-neutral-100 py-8 print:bg-white print:py-0">
      {/* The page size and margins here are what lib/lastPageStamp.js measures against. */}
      <style>{`@page { size: A4 landscape; margin: 14mm 16mm; } @media print { .avoid-break { break-inside: avoid; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[11in] items-center justify-between px-4 print:hidden">
        <Link to={backHref} className="text-sm text-maroon hover:underline">
          ← Back to reports
        </Link>
        <button onClick={print} className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light">
          Print / Save as PDF
        </button>
      </div>

      <div
        ref={sheetRef}
        className="mx-auto max-w-[11in] bg-white p-10 text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="flex items-center justify-center gap-4 border-b-2 border-neutral-800 pb-4 text-center">
          <img src="/bulsu-logo.png" alt="Bulacan State University" className="h-16 w-16 object-contain" />
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-600">Republic of the Philippines</p>
            <p className="text-base font-bold">BULACAN STATE UNIVERSITY</p>
            <p className="text-xs text-neutral-600">City of Malolos, Bulacan</p>
            <p className="mt-1 text-xs font-medium text-neutral-800">Committee on Decorum and Investigation (CODI)</p>
          </div>
        </header>

        <h1 className="mt-6 text-center text-lg font-bold tracking-wide">CODI CASELOAD REPORT</h1>
        <p className="mt-1 text-center text-sm text-neutral-600">{report.filterSummary}</p>
        <p className="mx-auto mt-3 max-w-xl border border-neutral-400 px-3 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-neutral-700">
          Confidential — for official CODI use only. Contains no names.
        </p>

        <Section title={`${nextRoman()}. Summary`}>
          <Table
            head={["Measure", "This period", p ? "Previous period" : null].filter(Boolean)}
            rows={[
              ["Cases filed", h.filed, p?.filed],
              ["Closed", h.closed, p?.closed],
              ["Still open", h.open, p?.open],
              ["Prima facie rate", `${formatPct(h.primaFacieRate)} (${h.primaFacieFound} of ${h.primaFacieEvaluated})`, p ? formatPct(p.primaFacieRate) : undefined],
              ["Average days to close", h.avgDaysToClose ?? "—", p ? p.avgDaysToClose ?? "—" : undefined],
              ["Deadlines met on time", formatPct(h.deadlineComplianceRate), p ? formatPct(p.deadlineComplianceRate) : undefined],
              ["Found liable (of cases decided)", formatPct(h.liableRate), p ? formatPct(p.liableRate) : undefined],
            ].map((row) => (p ? row : row.slice(0, 2)))}
          />
          {p && (
            <p className="mt-1 text-xs text-neutral-500">
              Previous period: {formatDate(p.from)} – {formatDate(p.to)}.
            </p>
          )}
        </Section>

        {sections.has("overview") && (
          <Section title={`${nextRoman()}. Case Overview`}>
            <CaseOverviewTable cases={report.cases} />
            {report.trend.some((m) => m.total > 0) && (
              <div className="mt-5 avoid-break">
                <SubTitle>Cases filed per month, by offense level</SubTitle>
                <Table
                  head={["Month", ...OFFENSE_SERIES.map((s) => s.label), "Total"]}
                  rows={report.trend
                    .filter((m) => m.total > 0)
                    .map((m) => [monthLabel(m.month), ...OFFENSE_SERIES.map((s) => m.byOffense[s.key]), m.total])}
                />
              </div>
            )}
          </Section>
        )}

        {sections.has("outcomes") && (
          <Section title={`${nextRoman()}. Outcomes`}>
            <div className="grid grid-cols-2 gap-6">
              <Breakdown title="How closed cases ended" rows={report.outcomes} dimension="closure" />
              <Breakdown title="Pathway chosen" rows={report.byPathway} dimension="pathway" />
            </div>
            <div className="mt-5 avoid-break">
              <SubTitle>Sanctions by offense level</SubTitle>
              {report.sanctions.length === 0 ? (
                <None>No sanctions imposed.</None>
              ) : (
                <Table
                  head={["Offense level", "Cases", "Penalties imposed"]}
                  leftCols={[0, 2]}
                  rows={report.sanctions.map((s) => [
                    labelFor("offense", s.offense),
                    s.count,
                    s.penalties.map((x) => `${x.penalty} (${x.count})`).join("; "),
                  ])}
                />
              )}
            </div>
          </Section>
        )}

        {sections.has("speed") && (
          <Section title={`${nextRoman()}. Speed and Deadlines`}>
            <SubTitle>Time per stage</SubTitle>
            <p className="mb-1.5 -mt-1 text-[10px] italic text-neutral-500">
              Total filing-to-close time is in the Summary table above.
            </p>
            <Table
              head={["Stage", "Cases", "Average", "Median", "Longest"]}
              rows={report.stageDurations
                .filter((s) => s.key !== "FILED_TO_CLOSED")
                .map((s) => [
                  s.label,
                  s.count,
                  s.count ? formatDays(s.avgDays) : "—",
                  s.count ? formatDays(s.medianDays) : "—",
                  s.count ? formatDays(s.maxDays) : "—",
                ])}
            />
            <div className="mt-5 avoid-break">
              <SubTitle>Deadline compliance</SubTitle>
              {report.deadlineCompliance.length === 0 ? (
                <None>No deadlines in this period.</None>
              ) : (
                <Table
                  head={["Deadline", "Responsible", "On time", "Late", "Overdue", "Pending", "Met on time"]}
                  leftCols={[0, 1]}
                  rows={report.deadlineCompliance.map((d) => [
                    DEADLINE_STAGE_LABELS[d.stage] || d.stage,
                    d.owner,
                    d.onTime,
                    d.late,
                    d.overdue,
                    d.pending,
                    formatPct(d.complianceRate),
                  ])}
                />
              )}
            </div>
            <div className="mt-5 avoid-break">
              <SubTitle>Open cases with no activity for {report.stuckDays}+ days</SubTitle>
              {report.stuckCases.length === 0 ? (
                <None>None.</None>
              ) : (
                <Table
                  head={["Case / Ref. No.", "Status", "Last activity", "Days idle"]}
                  leftCols={[0, 1, 2]}
                  rows={report.stuckCases.map((c) => [c.label, labelFor("status", c.phase), formatDate(c.lastActivityAt), c.daysIdle])}
                />
              )}
            </div>
          </Section>
        )}

        {sections.has("workload") && (
          <Section title={`${nextRoman()}. Workload`}>
            {monthsWithActivity.length === 0 ? (
              <None>No activity in this period.</None>
            ) : (
              <Table
                head={["Month", "Filed", "Closed", "Open at month end", "Pre-Trial hearings", "Trial hearings"]}
                rows={monthsWithActivity.map((m) => [
                  monthLabel(m.month),
                  m.filed,
                  m.closed,
                  m.openAtMonthEnd,
                  m.preTrialHearings,
                  m.trialHearings,
                ])}
              />
            )}
            {report.participation && (
              <div className="mt-5 avoid-break">
                <SubTitle>Committee participation</SubTitle>
                <Table
                  head={["Member", "Prima facie votes cast", "Meeting polls answered", "Risk assessments"]}
                  rows={report.participation.map((r) => [
                    `${r.fullName} (${r.role === "CHAIRPERSON" ? "Chairperson" : "Committee"})`,
                    r.primaFacieVotes === null ? "—" : `${r.primaFacieVotes} of ${r.casesPutToVote}`,
                    `${r.meetingPollsAnswered} of ${r.meetingPolls}`,
                    r.riskAssessments,
                  ])}
                />
              </div>
            )}
          </Section>
        )}

        <div className="avoid-break mt-12 grid grid-cols-2 gap-10 text-sm">
          <Signature caption="Prepared by" name={report.signatories?.secretariat} role="CODI Secretariat" />
          <Signature caption="Noted by" name={report.signatories?.chairperson} role="CODI Chairperson" />
        </div>

        <div ref={spacerRef} aria-hidden="true" />
        <div ref={stampRef} className="avoid-break mt-6 flex justify-end">
          <div className="text-right text-[9px] leading-tight text-neutral-500">
            {stampLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function SubTitle({ children }) {
  return <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-600">{children}</h3>;
}

function None({ children }) {
  return <p className="text-xs italic text-neutral-500">{children}</p>;
}

// Columns at indexes in leftCols hold text and stay left-aligned; everything
// else is a number and is right-aligned with tabular figures.
function Table({ head, rows, leftCols = [0] }) {
  const isLeft = (i) => leftCols.includes(i);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              className={`border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-medium print:bg-white ${isLeft(i) ? "text-left" : "text-right"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={`border border-neutral-300 px-2 py-1.5 ${isLeft(i) ? "text-left" : "text-right tabular-nums"}`}
              >
                {cell ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// One row per case — Case Status and Case Category repeat for consecutive
// cases in the same group, so their cells are left blank after the first
// row of each group (College/Offense/Respondent are per-case detail and
// always shown).
function CaseOverviewTable({ cases }) {
  if (!cases || cases.length === 0) {
    return <None>No cases in this period.</None>;
  }

  const phaseOrder = Object.fromEntries(CASE_PHASE_ORDER.map((key, i) => [key, i]));
  const rows = cases
    .map((c) => ({
      // The `cases` list doesn't carry `isOpen` directly; `closedAt` is only
      // ever set once a case reaches a terminal status, so its presence is
      // the same signal.
      statusLabel: c.closedAt ? "Closed" : "Open",
      categoryLabel: labelFor("status", c.phase),
      college: c.college,
      offenseLabel: labelFor("offense", c.offense),
      respondentLabel: c.respondentType ? labelFor("respondentType", c.respondentType) : "—",
      frameworkLabel: labelFor("framework", c.framework),
      phaseRank: phaseOrder[c.phase] ?? 99,
    }))
    .sort((a, b) => {
      if (a.statusLabel !== b.statusLabel) return a.statusLabel === "Closed" ? -1 : 1;
      if (a.phaseRank !== b.phaseRank) return a.phaseRank - b.phaseRank;
      return a.college.localeCompare(b.college);
    });

  let prev = null;
  const displayRows = rows.map((row) => {
    const statusSame = prev !== null && row.statusLabel === prev.statusLabel;
    const categorySame = statusSame && row.categoryLabel === prev.categoryLabel;
    prev = row;
    return [
      statusSame ? "" : row.statusLabel,
      categorySame ? "" : row.categoryLabel,
      row.college,
      row.offenseLabel,
      row.respondentLabel,
      row.frameworkLabel,
    ];
  });

  return (
    <div className="avoid-break">
      <Table
        head={["Case Status", "Case Category", "College", "Offense Level", "Respondent Type", "Governing Rules"]}
        leftCols={[0, 1, 2, 3, 4, 5]}
        rows={displayRows}
      />
      <p className="mt-1 text-right text-[10px] text-neutral-500">
        {cases.length} case{cases.length === 1 ? "" : "s"} total
      </p>
    </div>
  );
}

function Breakdown({ title, rows, dimension }) {
  const visible = rows.filter((r) => r.count > 0);
  const total = visible.reduce((s, r) => s + r.count, 0);
  return (
    <div className="avoid-break">
      <SubTitle>{title}</SubTitle>
      {visible.length === 0 ? (
        <None>No cases.</None>
      ) : (
        <Table
          head={["Category", "Cases", "Share"]}
          rows={[...visible.map((r) => [labelFor(dimension, r.key), r.count, `${r.pct}%`]), ["Total", total, "100%"]]}
        />
      )}
    </div>
  );
}

function Signature({ caption, name, role }) {
  return (
    <div>
      <p className="text-xs text-neutral-600">{caption}:</p>
      <div className="mt-10 border-b border-neutral-800" />
      <p className="mt-1 font-medium">{name || " "}</p>
      <p className="text-xs text-neutral-600">{role}</p>
    </div>
  );
}
