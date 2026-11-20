import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import Pagination from "../components/Pagination.jsx";
import { SearchIcon } from "../components/icons.jsx";
import {
  AUDIT_ACTION_GROUPS,
  ROLE_LABELS,
  auditActionLabel,
} from "../lib/constants.js";

// Oversight is the Chairperson's; the Secretariat keeps the record. The server
// enforces this too (requireRole in routes/audit.routes.js) — this only decides
// what to draw.
const AUDIT_ROLES = new Set(["CHAIRPERSON", "SECRETARIAT"]);

const FILTER_KEYS = ["q", "action", "userId", "from", "to"];

const selectClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

function apiParamsFrom(searchParams) {
  const params = {};
  for (const key of [...FILTER_KEYS, "page"]) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  return params;
}

function caseLabel(c) {
  return c?.caseNumber || c?.cpiNumber || c?.referenceNumber || "";
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ actions: [], actors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiParams = useMemo(() => apiParamsFrom(searchParams), [searchParams]);
  const paramsKey = JSON.stringify(apiParams);
  const allowed = AUDIT_ROLES.has(user.role);

  // The dropdowns list what is actually on record, so they are fetched once
  // rather than rebuilt as the filters change.
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    api
      .get("/audit/filters")
      .then((res) => current && setOptions(res.data))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    // Ignore a slower, older response if the filters changed in the meantime.
    let current = true;
    setLoading(true);
    setError("");
    api
      .get("/audit", { params: apiParams })
      .then((res) => current && setData(res.data))
      .catch(
        (err) => current && setError(err.response?.data?.error || "Failed to load the audit log")
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, allowed]);

  if (!allowed) {
    return (
      <Layout>
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          The audit log is available to the CODI Chairperson and Secretariat.
        </p>
      </Layout>
    );
  }

  // Narrowing the filters while on page 9 would otherwise strand the reader on
  // a page that no longer exists.
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 50;
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Audit Log</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Every recorded action across every case, newest first. Read-only — entries are never
          edited or removed.
        </p>
      </div>

      <AuditFilterBar
        searchParams={searchParams}
        options={options}
        onChange={setFilter}
        onReset={resetFilters}
        hasFilters={hasFilters}
      />

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <p className="mb-2 text-xs text-neutral-500">
        {loading && !data
          ? "Loading…"
          : total === 0
          ? "No entries"
          : `Showing ${first}–${last} of ${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}`}
      </p>

      {loading && !data ? (
        <Skeleton />
      ) : (
        <div
          className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm transition ${
            loading ? "opacity-60" : ""
          }`}
        >
          {total === 0 ? (
            <Empty hasFilters={hasFilters} onReset={resetFilters} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Who</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Case</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageCount={data.pageCount}
            onChange={(next) => setFilter("page", next === 1 ? "" : String(next))}
            label="Audit log pages"
          />
        </div>
      )}

      <p className="mt-4 text-xs text-neutral-400">
        Visible to the CODI Secretariat and Chairperson only. The trail supports oversight under the
        BulSU Anti-GBSH Code and the Data Privacy Act of 2012 (RA 10173).
      </p>
    </Layout>
  );
}

function AuditRow({ entry }) {
  const { user: actor, case: caseRef } = entry;
  return (
    <tr className="border-b border-neutral-50 align-top last:border-0 hover:bg-neutral-50">
      <td className="whitespace-nowrap px-5 py-3 text-neutral-600">
        {new Date(entry.createdAt).toLocaleString()}
      </td>
      <td className="px-5 py-3">
        <p className="font-medium text-neutral-800">{actor?.fullName || "Unknown"}</p>
        <p className="text-xs text-neutral-400">{ROLE_LABELS[actor?.role] || actor?.role}</p>
      </td>
      <td className="px-5 py-3 text-neutral-800">{auditActionLabel(entry.action)}</td>
      <td className="whitespace-nowrap px-5 py-3">
        {caseRef ? (
          <Link to={`/cases/${caseRef.id}`} className="font-medium text-maroon hover:underline">
            {caseLabel(caseRef)}
          </Link>
        ) : (
          <span className="text-xs text-neutral-400">System-wide</span>
        )}
      </td>
      <td className="hidden max-w-md break-words px-5 py-3 text-neutral-600 md:table-cell">
        {entry.details || <span className="text-neutral-300">—</span>}
      </td>
    </tr>
  );
}

// Two different silences: nothing has happened yet, or nothing matches. Saying
// the wrong one sends the reader looking for a bug that isn't there.
function Empty({ hasFilters, onReset }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-neutral-500">
        {hasFilters ? "No entries match these filters." : "No activity has been recorded yet."}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-sm font-medium text-maroon hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-neutral-100" />
      ))}
    </div>
  );
}

function AuditFilterBar({ searchParams, options, onChange, onReset, hasFilters }) {
  // Only the actions actually on record, slotted into the order a case moves
  // through. Anything the label map doesn't know about still appears, under
  // "Other" — the server's action column is free-form by design.
  const present = new Set(options.actions.map((a) => a.action));
  const grouped = AUDIT_ACTION_GROUPS.map((group) => ({
    label: group.label,
    actions: group.actions.filter((action) => present.has(action)),
  })).filter((group) => group.actions.length > 0);
  const known = new Set(AUDIT_ACTION_GROUPS.flatMap((group) => group.actions));
  const other = options.actions.map((a) => a.action).filter((action) => !known.has(action));
  if (other.length) grouped.push({ label: "Other", actions: other });

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox value={searchParams.get("q") || ""} onChange={(v) => onChange("q", v)} />

        <Field label="Who">
          <select
            value={searchParams.get("userId") || ""}
            onChange={(e) => onChange("userId", e.target.value)}
            className={selectClass}
          >
            <option value="">Anyone</option>
            {options.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.fullName} ({actor.count})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Action">
          <select
            value={searchParams.get("action") || ""}
            onChange={(e) => onChange("action", e.target.value)}
            className={selectClass}
          >
            <option value="">Any action</option>
            {grouped.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabel(action)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="From">
          <input
            type="date"
            value={searchParams.get("from") || ""}
            onChange={(e) => onChange("from", e.target.value)}
            className={selectClass}
          />
        </Field>

        <Field label="To">
          <input
            type="date"
            value={searchParams.get("to") || ""}
            onChange={(e) => onChange("to", e.target.value)}
            className={selectClass}
          />
        </Field>

        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className="pb-2 text-sm font-medium text-maroon hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

// Typed locally and pushed to the URL once typing stops: a request and a
// history entry per keystroke would be neither.
function SearchBox({ value, onChange }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <Field label="Search">
      <span className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Detail, person, or case number…"
          className={`${selectClass} w-72 pl-9`}
        />
      </span>
    </Field>
  );
}
