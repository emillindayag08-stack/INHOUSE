import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import CasesTable from "../components/CasesTable.jsx";
import CaseFilterPanel, { EMPTY_FILTERS } from "../components/CaseFilterPanel.jsx";
import { CASE_PHASE_ORDER, STATUS_LABELS, caseLabel } from "../lib/constants.js";
import { CASE_VIEWS, displayPhase } from "../lib/caseProgress.js";

// Complaints are only editable after the Secretariat returns them for
// correction (mirrors the backend rule on PATCH /cases/:id).
const EDITABLE_STATUSES = new Set(["RETURNED_FOR_CORRECTION"]);

// Only CODI staff can search by complainant/respondent name. Complainants
// and Respondents already only ever receive their own cases from the server
// (visibilityFilter in cases.routes.js) regardless of what they search.
const STAFF_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

const PAGE_SIZE = 10;

// Status sorts in workflow order, not alphabetically, so "ascending" reads as
// earliest stage first: by the status shown, then by the step within it.
const STEP_ORDER = Object.keys(STATUS_LABELS);

const SORTERS = {
  caseNo: (a, b) => caseLabel(a).localeCompare(caseLabel(b), undefined, { numeric: true }),
  status: (a, b) =>
    CASE_PHASE_ORDER.indexOf(displayPhase(a)) - CASE_PHASE_ORDER.indexOf(displayPhase(b)) ||
    STEP_ORDER.indexOf(a.status) - STEP_ORDER.indexOf(b.status),
};

function matchesFilters(c, filters, canSearchNames) {
  const q = filters.q.trim().toLowerCase();
  if (q) {
    const fields = [c.caseNumber, c.cpiNumber, c.referenceNumber];
    if (canSearchNames) {
      fields.push(c.complainant?.fullName, c.respondentUser?.fullName, c.claimedRespondentName);
      for (const r of c.respondents || []) fields.push(r.claimedName);
    }
    if (!fields.some((f) => f && f.toLowerCase().includes(q))) return false;
  }

  if (filters.year !== "ALL" && new Date(c.filedAt).getFullYear() !== Number(filters.year)) {
    return false;
  }

  if (filters.statusBucket !== "ALL" && displayPhase(c) !== filters.statusBucket) {
    return false;
  }

  if (filters.classification !== "ALL" && c.offenseClassification !== filters.classification) {
    return false;
  }

  if (filters.framework !== "ALL" && c.governingFramework !== filters.framework) {
    return false;
  }

  if (filters.filing !== "ALL" && !!c.isAnonymous !== (filters.filing === "ANONYMOUS")) {
    return false;
  }

  const filedAt = new Date(c.filedAt);
  if (filters.dateFrom && filedAt < new Date(filters.dateFrom)) return false;
  if (filters.dateTo && filedAt > new Date(`${filters.dateTo}T23:59:59.999`)) return false;

  return true;
}

export default function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(null); // { key: "caseNo" | "status", dir: "asc" | "desc" } or null; chosen in CaseFilterPanel
  // Arriving from a dashboard stat card: ?view=active|overdue|closed narrows
  // the list to what that figure counted, on top of the filters below.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewKey = searchParams.get("view");
  const view = CASE_VIEWS[viewKey] || null;

  function clearView() {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next, { replace: true });
  }

  const canSearchNames = STAFF_ROLES.has(user.role);

  useEffect(() => {
    api
      .get("/cases")
      .then((res) => setCases(res.data))
      .finally(() => setLoading(false));
  }, []);

  // Narrowing the filters can leave the user on a page that no longer
  // exists — jump back to the first page whenever the filter set changes.
  useEffect(() => {
    setPage(1);
  }, [filters, viewKey, sort]);

  const years = useMemo(() => {
    const set = new Set(cases.map((c) => new Date(c.filedAt).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [cases]);

  const filtered = useMemo(
    () =>
      cases.filter(
        (c) => (!view || view.matches(c)) && matchesFilters(c, filters, canSearchNames)
      ),
    [cases, filters, canSearchNames, view]
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const compare = SORTERS[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    // Ties fall back to the server's order (newest first), which sort() keeps.
    return [...filtered].sort((a, b) => dir * compare(a, b));
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paged = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const yearSuffix = filters.year !== "ALL" ? ` in ${filters.year}` : "";

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Cases</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Showing {paged.length} of {filtered.length} case{filtered.length === 1 ? "" : "s"}
          {yearSuffix}
        </p>
      </div>

      {view && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-maroon/10 px-3 py-1.5 text-xs font-medium text-maroon">
            {view.label}
            <button
              type="button"
              onClick={clearView}
              aria-label={`Show all cases instead of ${view.label.toLowerCase()}`}
              className="text-maroon/60 hover:text-maroon"
            >
              &times;
            </button>
          </span>
        </div>
      )}

      <CaseFilterPanel
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        years={years}
        searchPlaceholder={
          canSearchNames
            ? "Search by case or reference number, complainant, or respondent…"
            : "Search by case or reference number…"
        }
      />

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <CasesTable
              cases={paged}
              emptyMessage="No cases match your filters."
              showReview
              showClassification
              showLastUpdated
              rowAction={
                user.role === "PARTY"
                  ? (c) =>
                      EDITABLE_STATUSES.has(c.status) ? (
                        <Link
                          to={`/cases/${c.id}/edit`}
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
                        >
                          Edit
                        </Link>
                      ) : null
                  : null
              }
            />
            {filtered.length > 0 && totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage === 1}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-500">
                  Page {clampedPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage === totalPages}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
