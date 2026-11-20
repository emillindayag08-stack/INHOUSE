import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import Pagination from "../components/Pagination.jsx";
import { SearchIcon } from "../components/icons.jsx";
import { ROLE_LABELS } from "../lib/constants.js";
import { AFFILIATIONS, PURPOSES } from "../lib/privacyNotice.js";

// Read by the Chairperson and the Secretariat, like the audit log beside it.
// The server enforces this too (routes/audit.routes.js); this only decides
// what to draw.
const ALLOWED_ROLES = new Set(["CHAIRPERSON", "SECRETARIAT"]);

const FILTER_KEYS = ["q", "result", "from", "to"];

const selectClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

const REASON_LABELS = {
  UNKNOWN_EMAIL: "No account with this email",
  WRONG_PASSWORD: "Wrong password",
  ACCOUNT_LOCKED: "Account locked — too many wrong passwords",
  WRONG_UNLOCK_CODE: "Wrong unlock code",
  ACCOUNT_DEACTIVATED: "Account deactivated",
  MFA_PENDING: "Password correct — waiting for the emailed code",
  WRONG_MFA_CODE: "Wrong emailed code",
  ID_MISMATCH: "Student/employee number didn't match the account",
};

function apiParamsFrom(searchParams) {
  const params = {};
  for (const key of [...FILTER_KEYS, "page"]) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  return params;
}

// A rough "Browser on OS" from the user-agent string, enough to tell two
// devices apart without printing the whole header.
function deviceLabel(userAgent) {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Browser";
  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function LoginAttemptsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apiParams = useMemo(() => apiParamsFrom(searchParams), [searchParams]);
  const paramsKey = JSON.stringify(apiParams);
  const allowed = ALLOWED_ROLES.has(user.role);

  useEffect(() => {
    if (!allowed) return;
    // Ignore a slower, older response if the filters changed in the meantime.
    let current = true;
    setLoading(true);
    setError("");
    api
      .get("/audit/logins", { params: apiParams })
      .then((res) => current && setData(res.data))
      .catch((err) => current && setError(err.response?.data?.error || "Failed to load login attempts"))
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
          Login attempts are available to the CODI Chairperson and Secretariat.
        </p>
      </Layout>
    );
  }

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
        <h1 className="text-2xl font-bold text-neutral-900">Login Attempts</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Every sign-in attempt, successful or failed, newest first. Read-only — entries are never
          edited or removed.
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={searchParams.get("q") || ""} onChange={(v) => setFilter("q", v)} />
          <Field label="Result">
            <select
              value={searchParams.get("result") || ""}
              onChange={(e) => setFilter("result", e.target.value)}
              className={selectClass}
            >
              <option value="">All attempts</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              value={searchParams.get("from") || ""}
              onChange={(e) => setFilter("from", e.target.value)}
              className={selectClass}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={searchParams.get("to") || ""}
              onChange={(e) => setFilter("to", e.target.value)}
              className={selectClass}
            />
          </Field>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="pb-2 text-sm font-medium text-maroon hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <p className="mb-2 text-xs text-neutral-500">
        {loading && !data
          ? "Loading…"
          : total === 0
          ? "No attempts"
          : `Showing ${first}–${last} of ${total.toLocaleString()} attempt${total === 1 ? "" : "s"}` +
            (data.failedTotal ? ` · ${data.failedTotal.toLocaleString()} failed` : "")}
      </p>

      <div
        className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm transition ${
          loading ? "opacity-60" : ""
        }`}
      >
        {!data || total === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-neutral-500">
            {loading && !data
              ? "Loading…"
              : hasFilters
              ? "No attempts match these filters."
              : "No sign-ins have been recorded yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Account</th>
                <th className="px-5 py-3 font-medium">Result</th>
                <th className="px-5 py-3 font-medium">Privacy notice &amp; details</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">IP address</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Device</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((attempt) => (
                <tr key={attempt.id} className="border-b border-neutral-50 align-top last:border-0 hover:bg-neutral-50">
                  <td className="whitespace-nowrap px-5 py-3 text-neutral-600">
                    {new Date(attempt.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <p className="break-all font-medium text-neutral-800">{attempt.email}</p>
                    <p className="text-xs text-neutral-400">
                      {attempt.user
                        ? `${attempt.user.fullName} · ${ROLE_LABELS[attempt.user.role] || attempt.user.role}`
                        : "No matching account"}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        attempt.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {attempt.success ? "Successful" : "Failed"}
                    </span>
                    {!attempt.success && (
                      <p className="mt-1 text-xs text-neutral-500">
                        {REASON_LABELS[attempt.reason] || attempt.reason}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <PrivacyAck ack={attempt.privacyAck} />
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-neutral-600 md:table-cell">
                    {attempt.ipAddress || "—"}
                  </td>
                  <td className="hidden px-5 py-3 text-neutral-600 md:table-cell">{deviceLabel(attempt.userAgent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.pageCount > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageCount={data.pageCount}
            onChange={(next) => setFilter("page", next === 1 ? "" : String(next))}
            label="Login attempt pages"
          />
        </div>
      )}
    </Layout>
  );
}

// The privacy acknowledgment and the details given for this sign-in. Only
// successful sign-ins carry one; earlier records predate the notice.
function PrivacyAck({ ack }) {
  if (!ack) return <span className="text-xs text-neutral-400">—</span>;
  const purpose = ack.purpose === "OTHER" ? `Other: ${ack.purposeOther}` : PURPOSES[ack.purpose] || ack.purpose;
  return (
    <div className="text-xs text-neutral-600">
      <p className="font-medium text-neutral-800">{ack.fullName}</p>
      <p>
        {ack.idNumber}
        {ack.idMatches === true && <span className="ml-1 text-green-700">✓ matches account</span>}
        {ack.idMatches === null && <span className="ml-1 text-neutral-400">(staff — not checked)</span>}
      </p>
      <p>
        {AFFILIATIONS[ack.affiliation] || ack.affiliation} · {purpose}
      </p>
      <p className="text-neutral-400">
        Acknowledged notice v{ack.noticeVersion}, {new Date(ack.acknowledgedAt).toLocaleString()}
      </p>
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

// Typed locally and pushed to the URL once typing stops, as on the audit log.
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
          placeholder="Email, name, or IP address…"
          className={`${selectClass} w-72 pl-9`}
        />
      </span>
    </Field>
  );
}
