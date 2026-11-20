import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import CasesTable from "../components/CasesTable.jsx";
import CaseAnalytics from "../components/CaseAnalytics.jsx";
import CaseProgressTracker from "../components/CaseProgressTracker.jsx";
import Pagination from "../components/Pagination.jsx";
import { CASE_VIEWS, CLOSED_STATUSES } from "../lib/caseProgress.js";
import { CasesIcon, AlertIcon, ClockIcon, CheckCircleIcon } from "../components/icons.jsx";

const CODI_STAFF_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);
const CASES_PER_PAGE = 5;

const ROLE_BLURB = {
  PARTY: "Cases you filed, and cases filed against you.",
  SECRETARIAT: "Verify incoming complaints and issue show-cause orders.",
  CHAIRPERSON: "Review findings, issue formal charges, and record decisions.",
  COMMITTEE: "Evaluate cases, schedule hearings, and record deliberations.",
  DISCIPLINING_AUTHORITY: "Approve formal charges and decide the cases CODI brings to you.",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  // The case list is paged rather than truncated, so every case is reachable
  // from the dashboard without leaving it.
  const [casePage, setCasePage] = useState(1);
  // The dashboard is about what is live. Resolved and dismissed cases are
  // history and belong on the Cases page.
  const openCases = useMemo(() => cases.filter((c) => !CLOSED_STATUSES.has(c.status)), [cases]);
  const casePageCount = Math.max(1, Math.ceil(openCases.length / CASES_PER_PAGE));
  const currentCasePage = Math.min(casePage, casePageCount);
  const pagedCases = useMemo(
    () => openCases.slice((currentCasePage - 1) * CASES_PER_PAGE, currentCasePage * CASES_PER_PAGE),
    [openCases, currentCasePage]
  );

  useEffect(() => {
    Promise.all([api.get("/dashboard/stats"), api.get("/cases")])
      .then(([statsRes, casesRes]) => {
        setStats(statsRes.data);
        setCases(casesRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Welcome, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">{ROLE_BLURB[user.role]}</p>
        </div>
      </div>

      {/* A university member sees where their own cases stand. Staff go
          straight to the caseload figures — their role is in the sidebar. */}
      {user.role === "PARTY" && (
        <CaseProgressTracker cases={cases} user={user} loading={loading} />
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Each figure opens the cases behind it (see CASE_VIEWS). */}
        <StatCard label="Total cases" value={stats?.total} icon={CasesIcon} tone="maroon" to="/cases" />
        <StatCard
          label="Open Cases"
          value={countActive(stats?.byStatus)}
          icon={ClockIcon}
          tone="blue"
          to="/cases?view=active"
        />
        <StatCard
          label="Closed"
          value={(stats?.byStatus?.RESOLVED || 0) + (stats?.byStatus?.DISMISSED || 0)}
          icon={CheckCircleIcon}
          tone="green"
          to="/cases?view=closed"
        />
        <StatCard
          label="Overdue deadlines"
          value={stats?.overdueDeadlines}
          icon={AlertIcon}
          tone="danger"
          to="/cases?view=overdue"
        />
      </div>

      {CODI_STAFF_ROLES.has(user.role) && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-800">Caseload at a glance</h2>
            <Link to="/reports" className="text-sm font-medium text-maroon hover:underline">
              Open full reports
            </Link>
          </div>
          <CaseAnalytics />
        </>
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-sm font-bold text-neutral-800">Open cases</h2>
          <div className="flex items-center gap-3">
            {openCases.length > CASES_PER_PAGE && (
              <span className="text-xs text-neutral-500">
                {(currentCasePage - 1) * CASES_PER_PAGE + 1}–
                {(currentCasePage - 1) * CASES_PER_PAGE + pagedCases.length} of {openCases.length}
              </span>
            )}
            <Link to="/cases" className="text-sm font-medium text-maroon hover:underline">
              View all
            </Link>
          </div>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <CasesTable
              cases={pagedCases}
              emptyMessage="No open cases. Closed ones are on the Cases page."
            />
            {casePageCount > 1 && (
              <div className="border-t border-neutral-100 px-5 py-3">
                <Pagination
                  page={currentCasePage}
                  pageCount={casePageCount}
                  onChange={setCasePage}
                  label="Case list pages"
                />
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function countActive(byStatus) {
  if (!byStatus) return 0;
  const terminal = new Set(["RESOLVED", "DISMISSED", "ESCALATED"]);
  return Object.entries(byStatus)
    .filter(([status]) => !terminal.has(status))
    .reduce((sum, [, count]) => sum + count, 0);
}

const TONE_STYLES = {
  maroon: "bg-maroon/10 text-maroon",
  blue: "bg-blue-50 text-blue-600",
  danger: "bg-red-50 text-red-600",
  green: "bg-green-50 text-green-600",
};

function StatCard({ label, value, icon: Icon, tone, to }) {
  const isDangerActive = tone === "danger" && value > 0;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 transition-colors group-hover:text-white/80">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors group-hover:bg-white/15 group-hover:text-white ${TONE_STYLES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-2 text-3xl font-bold transition-colors group-hover:text-white ${isDangerActive ? "text-red-600" : "text-neutral-900"}`}>
        {value ?? 0}
      </p>
    </>
  );
  const base = "group block rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm";

  // A figure with nothing behind it stays inert rather than opening an empty
  // list — and never looks clickable.
  if (!to || !value) return <div className={base}>{body}</div>;

  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}. View these cases`}
      className={`${base} transition hover:-translate-y-0.5 hover:border-maroon hover:bg-maroon hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2`}
    >
      {body}
      <span className="mt-1 block text-xs font-medium text-maroon opacity-0 transition group-hover:text-white group-hover:opacity-100">
        View cases
      </span>
    </Link>
  );
}
