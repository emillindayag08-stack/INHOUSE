import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  BarList,
  CaseDrawer,
  EmptyNote,
  KpiTile,
  MonthChart,
  Panel,
  ReportSection,
  Toggle,
} from "../components/ReportCharts.jsx";
import { ColumnChart, DonutChart, LineChart } from "../components/ChartKinds.jsx";
import { DEADLINE_STAGE_LABELS, GOVERNING_FRAMEWORK_LABELS } from "../lib/constants.js";
import {
  healthTone,
  FILTER_KEYS,
  CASE_STATUS_LABELS,
  OFFENSE_LABELS,
  OFFENSE_SERIES,
  PERIOD_OPTIONS,
  REPORT_PATHWAY_LABELS,
  REPORT_ROLES,
  RESPONDENT_SERIES,
  RESPONDENT_TYPE_LABELS,
  SECTION_OPTIONS,
  apiParamsFrom,
  formatDate,
  formatDays,
  formatPct,
  labelFor,
  monthLabel,
  visibleSections,
} from "../lib/reports.js";

const STUCK_OPTIONS = [15, 30, 60, 90];

export default function ReportsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [trendBy, setTrendBy] = useState("offense");
  const [drill, setDrill] = useState(null);
  const [exporting, setExporting] = useState(false);

  const apiParams = useMemo(() => apiParamsFrom(searchParams), [searchParams]);
  const paramsKey = JSON.stringify(apiParams);

  useEffect(() => {
    if (!REPORT_ROLES.has(user.role)) return;
    // Ignore a slower, older response if the filters changed in the meantime.
    let current = true;
    setLoading(true);
    setError("");
    api
      .get("/reports", { params: apiParams })
      .then((res) => current && setReport(res.data))
      .catch((err) => current && setError(err.response?.data?.error || "Failed to load the report"))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, user.role]);

  if (!REPORT_ROLES.has(user.role)) {
    return (
      <Layout>
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          Reports are only available to CODI and the Disciplining Authority.
        </p>
      </Layout>
    );
  }

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "period" && value !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = FILTER_KEYS.some((k) => k !== "stuckDays" && searchParams.get(k));

  const openDrill = (title, predicate) => {
    if (!report) return;
    setDrill({ title, cases: report.cases.filter(predicate) });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.get("/reports/export.csv", { params: apiParams, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CODI-Case-Report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("The export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const period = searchParams.get("period") || "all";
  const printHref = `/reports/print?${searchParams.toString()}`;
  const sections = visibleSections(searchParams);
  const toggleSection = (key) => {
    const next = new Set(sections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const value = next.size === SECTION_OPTIONS.length ? "" : next.size === 0 ? "none" : [...next].join(",");
    setFilter("sections", value);
  };

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reports</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Caseload, outcomes, and timeliness of CODI proceedings.
            {report && <span className="ml-1 text-neutral-400">Showing: {report.filterSummary}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !report}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export to Excel (CSV)"}
          </button>
          <Link
            to={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light"
          >
            Print / Save as PDF
          </Link>
        </div>
      </div>

      <FilterBar
        searchParams={searchParams}
        period={period}
        colleges={report?.filterOptions.colleges || []}
        onChange={setFilter}
        onReset={hasFilters ? resetFilters : null}
        sections={sections}
        onToggleSection={toggleSection}
      />

      <p className="mb-6 flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-600">
        <span aria-hidden="true">🔒</span>
        <span>
          Confidential — for CODI and the Disciplining Authority. Reports show counts, never names. Every
          export is recorded in the audit log (Data Privacy Act of 2012, RA 10173).
        </span>
      </p>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {!report ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50" />
          ))}
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Headline report={report} />
          {sections.has("speed") && (
            <TimelinessSection
              report={report}
              stuckDays={report.stuckDays}
              onStuckDaysChange={(v) => setFilter("stuckDays", v === 30 ? "" : String(v))}
            />
          )}
          {sections.has("overview") && (
            <OverviewSection report={report} trendBy={trendBy} setTrendBy={setTrendBy} openDrill={openDrill} />
          )}
          {sections.has("outcomes") && <OutcomesSection report={report} openDrill={openDrill} />}
          {sections.has("workload") && <WorkloadSection report={report} />}
        </div>
      )}

      <CaseDrawer title={drill?.title} cases={drill?.cases || []} onClose={() => setDrill(null)} />
    </Layout>
  );
}

// --- Filters -------------------------------------------------------------------

function FilterBar({ searchParams, period, colleges, onChange, onReset, sections, onToggleSection }) {
  const selectClass =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-maroon focus:outline-none focus:ring-2 focus:ring-maroon/20";

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <Field label="Period">
          <select value={period} onChange={(e) => onChange("period", e.target.value === "all" ? "" : e.target.value)} className={selectClass}>
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="College">
          <select value={searchParams.get("college") || ""} onChange={(e) => onChange("college", e.target.value)} className={selectClass}>
            <option value="">All colleges</option>
            {colleges.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <EnumSelect label="Respondent type" param="respondentType" allLabel="All respondents" labels={RESPONDENT_TYPE_LABELS} searchParams={searchParams} onChange={onChange} className={selectClass} />
        <EnumSelect label="Offense level" param="offense" allLabel="All levels" labels={OFFENSE_LABELS} searchParams={searchParams} onChange={onChange} className={selectClass} />
        <EnumSelect label="Governing rules" param="framework" allLabel="Both" labels={GOVERNING_FRAMEWORK_LABELS} searchParams={searchParams} onChange={onChange} className={selectClass} />
        <EnumSelect label="Pathway" param="pathway" allLabel="All pathways" labels={REPORT_PATHWAY_LABELS} searchParams={searchParams} onChange={onChange} className={selectClass} />
        <EnumSelect label="Case status" param="caseStatus" allLabel="Open and closed" labels={CASE_STATUS_LABELS} searchParams={searchParams} onChange={onChange} className={selectClass} />
      </div>

      {period === "custom" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="From">
            <input type="date" value={searchParams.get("from") || ""} onChange={(e) => onChange("from", e.target.value)} className={selectClass} />
          </Field>
          <Field label="To">
            <input type="date" value={searchParams.get("to") || ""} onChange={(e) => onChange("to", e.target.value)} className={selectClass} />
          </Field>
        </div>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <span className="mb-1.5 block text-xs font-medium text-neutral-600">Sections to include</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SECTION_OPTIONS.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={sections.has(s.key)}
                onChange={() => onToggleSection(s.key)}
                className="h-4 w-4 rounded border-neutral-300 text-maroon focus:ring-maroon/30"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
        <span>Figures cover cases filed within the period, unless a chart says otherwise. Click a bar to see its cases.</span>
        {onReset && (
          <button type="button" onClick={onReset} className="font-medium text-maroon hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

function EnumSelect({ label, param, allLabel, labels, searchParams, onChange, className }) {
  return (
    <Field label={label}>
      <select value={searchParams.get(param) || ""} onChange={(e) => onChange(param, e.target.value)} className={className}>
        <option value="">{allLabel}</option>
        {Object.entries(labels).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

// --- Headline figures ------------------------------------------------------------

function Headline({ report }) {
  const h = report.headline;
  const p = report.previous;
  return (
    <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <KpiTile label="Cases filed" value={h.filed} previous={p?.filed} />
      <KpiTile label="Still open" value={h.open} hint={`${h.closed} closed`} />
      <KpiTile label="Closed" value={h.closed} previous={p?.closed} goodWhen="up" />
      <KpiTile
        label="Prima facie rate"
        value={h.primaFacieRate}
        display={formatPct(h.primaFacieRate)}
        previous={p?.primaFacieRate}
        unit=" pts"
        hint={h.primaFacieEvaluated ? `${h.primaFacieFound} of ${h.primaFacieEvaluated} evaluated` : "None evaluated yet"}
      />
      <KpiTile
        label="Average days to close"
        value={h.avgDaysToClose}
        display={h.avgDaysToClose === null ? "—" : h.avgDaysToClose}
        previous={p?.avgDaysToClose}
        goodWhen="down"
        unit=" days"
      />
      <KpiTile
        label="Deadlines met on time"
        value={h.deadlineComplianceRate}
        display={formatPct(h.deadlineComplianceRate)}
        previous={p?.deadlineComplianceRate}
        goodWhen="up"
        unit=" pts"
        health={h.deadlineComplianceRate}
      />
    </div>
  );
}

// --- 1. Case overview ------------------------------------------------------------

function OverviewSection({ report, trendBy, setTrendBy, openDrill }) {
  const total = report.headline.filed;
  const drillBy = (dimension, field = dimension) => (key, label) =>
    openDrill(label, (c) => c[field] === key);
  const series = trendBy === "offense" ? OFFENSE_SERIES : RESPONDENT_SERIES;

  return (
    <ReportSection title="Case overview" description="Where the cases in this period stand and who they involve.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Case status">
          <DonutChart rows={report.byStatus} dimension="status" total={total} onSelect={drillBy("status", "phase")} />
        </Panel>
        <Panel title="Incidents by college" subtitle={`The respondent's college. Total: ${total}.`}>
          <BarList
            rows={report.byCollege}
            dimension="college"
            total={total}
            color="bg-blue-500/70"
            onSelect={drillBy("college")}
          />
        </Panel>
        <Panel title="Offense level" subtitle="The Committee's classification from the risk assessment.">
          <ColumnChart rows={report.byOffense} dimension="offense" total={total} onSelect={drillBy("offense")} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Respondent type">
            <DonutChart rows={report.byRespondentType} dimension="respondentType" total={total} onSelect={drillBy("respondentType")} />
          </Panel>
          <Panel title="Governing rules">
            <DonutChart rows={report.byFramework} dimension="framework" total={total} onSelect={drillBy("framework")} />
          </Panel>
        </div>
        <Panel title="Filing trend" subtitle="Cases filed per month. Click a month to see its cases." className="lg:col-span-2">
          <div className="mb-3">
            <Toggle
              label="Break down the trend by"
              value={trendBy}
              onChange={setTrendBy}
              options={[
                { value: "offense", label: "By offense level" },
                { value: "respondentType", label: "By respondent type" },
              ]}
            />
          </div>
          {total === 0 ? (
            <EmptyNote />
          ) : (
            <MonthChart
              months={report.trend}
              series={series}
              valueFor={(m, key) => (trendBy === "offense" ? m.byOffense[key] : m.byRespondentType[key])}
              onSelectMonth={(month) => openDrill(`Filed in ${monthLabel(month, { month: "long", year: "numeric" })}`, (c) => c.filedMonth === month)}
            />
          )}
        </Panel>
      </div>
    </ReportSection>
  );
}

// How anonymous complaints fared at screening, by the month they were filed.
// A rising "not entertained" share is the early sign of anonymous filing
// being misused (limits in server/src/services/anonymousGuard.js).
function AnonymousScreeningPanel({ anonymous }) {
  if (!anonymous) return null;
  const { totals } = anonymous;
  const months = anonymous.months.filter((m) => m.filed > 0);
  const share = (n) => (totals.filed ? `${Math.round((n / totals.filed) * 100)}%` : "—");
  const stats = [
    { label: "Filed", value: totals.filed, note: "anonymous complaints" },
    { label: "Entertained", value: totals.entertained, note: `${share(totals.entertained)} verified` },
    { label: "Not entertained", value: totals.notEntertained, note: `${share(totals.notEntertained)} under Section 12` },
    { label: "Awaiting screening", value: totals.pending, note: "not yet decided" },
  ];

  return (
    <Panel
      title="Anonymous complaints"
      subtitle="How anonymous complaints fared at Section 12 screening, by the month they were filed."
      className="lg:col-span-3"
    >
      {totals.filed === 0 ? (
        <EmptyNote>No anonymous complaints in this period.</EmptyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-neutral-200 p-3">
                <p className="text-xs text-neutral-500">{s.label}</p>
                <p className="text-2xl font-bold tabular-nums text-neutral-900">{s.value}</p>
                <p className="text-xs text-neutral-400">{s.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="py-2 pr-4 font-medium">Month filed</th>
                  <th className="py-2 pr-4 text-right font-medium">Filed</th>
                  <th className="py-2 pr-4 text-right font-medium">Entertained</th>
                  <th className="py-2 pr-4 text-right font-medium">Not entertained</th>
                  <th className="py-2 text-right font-medium">Awaiting screening</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-neutral-50">
                    <td className="py-2 pr-4 text-neutral-700">{monthLabel(m.month, { month: "long", year: "numeric" })}</td>
                    <td className="py-2 pr-4 text-right text-neutral-700">{m.filed}</td>
                    <td className="py-2 pr-4 text-right text-neutral-700">{m.entertained}</td>
                    <td className={`py-2 pr-4 text-right ${m.notEntertained ? "font-medium text-amber-700" : "text-neutral-700"}`}>
                      {m.notEntertained}
                    </td>
                    <td className="py-2 text-right text-neutral-700">{m.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

// --- 2. Outcomes -------------------------------------------------------------------

function OutcomesSection({ report, openDrill }) {
  const closedTotal = report.headline.closed;
  const decided = report.outcomes.filter((o) => o.key === "LIABLE" || o.key === "NOT_LIABLE").reduce((s, o) => s + o.count, 0);
  const pathwayChosen = report.byPathway.filter((p) => p.key !== "NOT_YET_SET");
  const pathwayTotal = pathwayChosen.reduce((s, p) => s + p.count, 0);

  return (
    <ReportSection title="Outcomes" description="How closed cases ended and which route cases took.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="How closed cases ended" subtitle={`${closedTotal} closed case${closedTotal === 1 ? "" : "s"}.`}>
          <DonutChart
            rows={report.outcomes}
            dimension="closure"
            total={closedTotal}
            onSelect={(key, label) => openDrill(label, (c) => c.closure === key)}
          />
        </Panel>

        <Panel title="Prima facie findings" subtitle="Of the answered cases the Committee voted on.">
          {report.headline.primaFacieEvaluated === 0 ? (
            <EmptyNote>No prima facie findings yet.</EmptyNote>
          ) : (
            <div>
              <p className="text-3xl font-bold tabular-nums text-neutral-900">{formatPct(report.headline.primaFacieRate)}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {report.headline.primaFacieFound} of {report.headline.primaFacieEvaluated} went on to a formal charge
              </p>
              <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full bg-maroon/80" style={{ width: `${report.headline.primaFacieRate}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-neutral-500">
                <span>Prima facie case found</span>
                <span>Dismissed</span>
              </div>
              {decided > 0 && (
                <p className="mt-5 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                  Of the {decided} case{decided === 1 ? "" : "s"} decided on the merits,{" "}
                  <span className="font-medium">{formatPct(report.headline.liableRate)}</span> found the respondent liable.
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Pathway chosen" subtitle="Formal Investigation vs Position Paper, once set.">
          <DonutChart
            rows={pathwayChosen}
            dimension="pathway"
            total={pathwayTotal}
            onSelect={(key, label) => openDrill(label, (c) => c.pathway === key)}
          />
          {pathwayTotal > 0 && (
            <p className="mt-3 text-xs text-neutral-400">
              {report.byPathway.find((p) => p.key === "NOT_YET_SET")?.count || 0} other case(s) haven't reached this stage.
            </p>
          )}
        </Panel>

        <AnonymousScreeningPanel anonymous={report.anonymous} />

        <Panel title="Sanctions by offense level" subtitle="Penalties imposed on respondents found liable." className="lg:col-span-3">
          {report.sanctions.length === 0 ? (
            <EmptyNote>No sanctions have been imposed in this period.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500">
                  <tr className="border-b border-neutral-200">
                    <th className="py-2 pr-4 font-medium">Offense level</th>
                    <th className="py-2 pr-4 font-medium">Cases</th>
                    <th className="py-2 font-medium">Penalties imposed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.sanctions.map((row) => (
                    <tr key={row.offense}>
                      <td className="py-2.5 pr-4 text-neutral-800">{labelFor("offense", row.offense)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{row.count}</td>
                      <td className="py-2.5">
                        <ul className="flex flex-wrap gap-1.5">
                          {row.penalties.map((p) => (
                            <li key={p.penalty} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700">
                              {p.penalty} <span className="text-neutral-400">×{p.count}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </ReportSection>
  );
}

// --- 3. Speed and deadlines ----------------------------------------------------------

function TimelinessSection({ report, stuckDays, onStuckDaysChange }) {
  const maxAvg = Math.max(1, ...report.stageDurations.map((s) => s.avgDays || 0));

  return (
    <ReportSection title="Speed and deadlines" description="How long each stage takes and whether the time limits under the rules are met.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Average time per stage" subtitle="Only cases that completed both ends of a stage are counted.">
          <ul className="space-y-3">
            {report.stageDurations.map((stage) => (
              <li key={stage.key} className={stage.key === "FILED_TO_CLOSED" ? "border-t border-neutral-100 pt-3" : ""}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className={stage.key === "FILED_TO_CLOSED" ? "font-medium text-neutral-800" : "text-neutral-700"}>
                    {stage.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-700">
                    {stage.count === 0 ? (
                      <span className="text-neutral-400">No cases yet</span>
                    ) : (
                      <>
                        <span className="font-medium">{formatDays(stage.avgDays)}</span>
                        <span className="ml-1.5 text-neutral-400">
                          median {formatDays(stage.medianDays)} · n={stage.count}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-maroon/70" style={{ width: `${((stage.avgDays || 0) / maxAvg) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Deadline compliance" subtitle="Grouped by stage and by who is responsible for meeting it.">
          {report.deadlineCompliance.length === 0 ? (
            <EmptyNote>No deadlines in this period.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-500">
                  <tr className="border-b border-neutral-200">
                    <th className="py-2 pr-3 font-medium">Deadline</th>
                    <th className="py-2 pr-3 text-right font-medium text-emerald-700">On time</th>
                    <th className="py-2 pr-3 text-right font-medium text-amber-700">Late</th>
                    <th className="py-2 pr-3 text-right font-medium text-red-700">Overdue</th>
                    <th className="py-2 pr-3 text-right font-medium">Pending</th>
                    <th className="py-2 text-right font-medium">Met on time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.deadlineCompliance.map((row) => (
                    <tr key={row.stage}>
                      <td className="py-2.5 pr-3">
                        <p className="text-neutral-800">{DEADLINE_STAGE_LABELS[row.stage] || row.stage}</p>
                        <p className="text-xs text-neutral-400">Responsible: {row.owner}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{row.onTime}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{row.late}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{row.overdue}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-500">{row.pending}</td>
                      <td className="py-2.5 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${healthTone(row.complianceRate).pill}`}>
                          {formatPct(row.complianceRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-neutral-800">Cases with no recent activity</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Open cases where nothing has been recorded for a while.</p>
            </div>
            <Toggle
              label="No activity for at least"
              value={stuckDays}
              onChange={onStuckDaysChange}
              options={STUCK_OPTIONS.map((d) => ({ value: d, label: `${d}+ days` }))}
            />
          </div>
          {report.stuckCases.length === 0 ? (
            <EmptyNote>No open case has gone {stuckDays} days without activity.</EmptyNote>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {report.stuckCases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Link to={`/cases/${c.id}`} className="font-mono text-sm font-medium text-maroon hover:underline">
                      {c.label}
                    </Link>
                    <StatusBadge phase={c.phase} />
                  </div>
                  <span className="text-xs text-neutral-500">
                    <span className="font-medium text-red-700">{c.daysIdle} days</span> since last activity ({formatDate(c.lastActivityAt)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </ReportSection>
  );
}

// --- 4. Workload -------------------------------------------------------------------------

function WorkloadSection({ report }) {
  const hasActivity = report.workload.some((m) => m.filed || m.closed || m.openAtMonthEnd || m.preTrialHearings || m.trialHearings);

  return (
    <ReportSection
      title="Workload"
      description="Activity during each month across all matching cases — including cases filed before the period."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Filed vs closed">
          {hasActivity ? (
            <LineChart
              months={report.workload}
              series={[
                { key: "filed", label: "Filed", color: "#7f1d1d" },
                { key: "closed", label: "Closed", color: "#059669" },
              ]}
              valueFor={(m, key) => m[key]}
            />
          ) : (
            <EmptyNote />
          )}
        </Panel>
        <Panel title="Open cases at month end">
          {hasActivity ? (
            <LineChart
              months={report.workload}
              series={[{ key: "openAtMonthEnd", label: "Open cases", color: "#2563eb" }]}
              valueFor={(m, key) => m[key]}
            />
          ) : (
            <EmptyNote />
          )}
        </Panel>
        <Panel title="Hearings">
          {report.workload.some((m) => m.preTrialHearings || m.trialHearings) ? (
            <MonthChart
              months={report.workload}
              series={[
                { key: "preTrialHearings", label: "Pre-Trial", color: "bg-purple-400" },
                { key: "trialHearings", label: "Trial", color: "bg-purple-700" },
              ]}
              valueFor={(m, key) => m[key]}
            />
          ) : (
            <EmptyNote>No hearings in this period.</EmptyNote>
          )}
        </Panel>

        {report.participation && (
          <Panel
            title="Committee participation"
            subtitle="Visible to the Secretariat and the Chairperson only."
            className="lg:col-span-3"
          >
            <ParticipationTable rows={report.participation} />
          </Panel>
        )}
      </div>
    </ReportSection>
  );
}

function ParticipationTable({ rows }) {
  if (rows.length === 0) return <EmptyNote>No Committee members on record.</EmptyNote>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-neutral-500">
          <tr className="border-b border-neutral-200">
            <th className="py-2 pr-4 font-medium">Member</th>
            <th className="py-2 pr-4 text-right font-medium">Prima facie votes cast</th>
            <th className="py-2 pr-4 text-right font-medium">Meeting polls answered</th>
            <th className="py-2 text-right font-medium">Risk assessments</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2.5 pr-4">
                <p className="text-neutral-800">{r.fullName}</p>
                <p className="text-xs text-neutral-400">{r.role === "CHAIRPERSON" ? "Chairperson" : "Committee member"}</p>
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                {r.primaFacieVotes === null ? <span className="text-neutral-400">Doesn't vote</span> : <Ratio part={r.primaFacieVotes} whole={r.casesPutToVote} />}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">
                <Ratio part={r.meetingPollsAnswered} whole={r.meetingPolls} />
              </td>
              <td className="py-2.5 text-right tabular-nums">{r.riskAssessments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ratio({ part, whole }) {
  if (!whole) return <span className="text-neutral-400">—</span>;
  return (
    <span>
      {part} <span className="text-neutral-400">of {whole}</span>
    </span>
  );
}

