import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import Pagination from "../components/Pagination.jsx";
import { ChevronDownIcon, FolderIcon, SearchIcon } from "../components/icons.jsx";
import { DOC_TYPE_LABELS, DOC_REVIEW_COLORS, docReviewLabel } from "../lib/constants.js";

// The listing crosses cases, so the per-side rules the case page applies have
// nothing to say here. Keeping parties out entirely is what makes that safe —
// the server enforces the same three roles.
const RECORDS_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

const FILTER_KEYS = ["q", "docType", "reviewStatus", "state", "caseId", "from", "to"];

const STATES = [
  { value: "current", label: "On the case" },
  { value: "archived", label: "Archived" },
  { value: "superseded", label: "Replaced" },
  { value: "eligible", label: "Eligible for disposal" },
  { value: "disposed", label: "Disposal approved" },
  { value: "all", label: "Everything" },
];

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

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RecordsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bundling, setBundling] = useState("");
  // Bumped after a disposal is approved so the list reloads.
  const [reload, setReload] = useState(0);

  const apiParams = useMemo(() => apiParamsFrom(searchParams), [searchParams]);
  const paramsKey = JSON.stringify(apiParams);
  const allowed = RECORDS_ROLES.has(user.role);
  const caseId = searchParams.get("caseId") || "";

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    api
      .get("/records/cases")
      .then((res) => current && setFolders(res.data.cases || []))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    // Ignore a slower, older response if the filters changed meanwhile.
    let current = true;
    setLoading(true);
    setError("");
    api
      .get("/records", { params: apiParams })
      .then((res) => current && setData(res.data))
      .catch((err) => current && setError(err.response?.data?.error || "Failed to load the records"))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, allowed, reload]);

  if (!allowed) {
    return (
      <Layout>
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          Records are available to CODI staff. Your own case documents are on the case page.
        </p>
      </Layout>
    );
  }

  // Narrowing the filters while on page 9 would otherwise strand the reader.
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  async function downloadBundle(id, label) {
    setBundling(id);
    setError("");
    try {
      const res = await api.get(`/records/case/${id}/bundle`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${label}-case-file.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError("Could not build the bundle for that case.");
    } finally {
      setBundling("");
    }
  }

  const page = data?.page ?? 1;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const openFolder = folders.find((f) => f.id === caseId);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Records</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Every file across every case. Nothing filed here is deleted — replaced files are kept as
          earlier versions, and withdrawn ones are archived with a reason.
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={searchParams.get("q") || ""} onChange={(v) => setFilter("q", v)} />

          <CaseFolderPicker
            folders={folders}
            caseId={caseId}
            onChange={(id) => setFilter("caseId", id)}
          />

          <Field label="Kind">
            <select
              value={searchParams.get("docType") || ""}
              onChange={(e) => setFilter("docType", e.target.value)}
              className={selectClass}
            >
              <option value="">Any kind</option>
              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Review">
            <select
              value={searchParams.get("reviewStatus") || ""}
              onChange={(e) => setFilter("reviewStatus", e.target.value)}
              className={selectClass}
            >
              <option value="">Any status</option>
              <option value="PENDING">Awaiting review</option>
              <option value="APPROVED">Approved</option>
              <option value="RETURNED">Sent back</option>
            </select>
          </Field>

          <Field label="Showing">
            <select
              value={searchParams.get("state") || "current"}
              onChange={(e) => setFilter("state", e.target.value)}
              className={selectClass}
            >
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
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
            <button
              type="button"
              onClick={resetFilters}
              className="pb-2 text-sm font-medium text-maroon hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            {loading && !data
              ? "Loading…"
              : total === 0
              ? "No files"
              : `Showing ${first}–${last} of ${total.toLocaleString()} file${total === 1 ? "" : "s"}`}
          </p>
          {openFolder && (
            <button
              type="button"
              onClick={() => downloadBundle(openFolder.id, caseLabel(openFolder))}
              disabled={bundling === openFolder.id}
              className="rounded-md border border-maroon/30 bg-maroon/5 px-3 py-1.5 text-xs font-medium text-maroon hover:bg-maroon/10 disabled:opacity-50"
            >
              {bundling === openFolder.id
                ? "Preparing…"
                : `Download ${caseLabel(openFolder)} as one file`}
            </button>
          )}
        </div>

        <div
          className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm transition ${
            loading ? "opacity-60" : ""
          }`}
        >
          {total === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutral-500">
              {hasFilters ? "No files match these filters." : "No files have been uploaded yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-5 py-3 font-medium">File</th>
                  <th className="px-5 py-3 font-medium">Case</th>
                  <th className="px-5 py-3 font-medium">Kind</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Filed by</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((doc) => (
                  <RecordRow
                    key={doc.id}
                    doc={doc}
                    retentionYears={data.retentionYears}
                    canApprove={user.role === "SECRETARIAT"}
                    onChanged={() => setReload((n) => n + 1)}
                  />
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
              label="Record pages"
            />
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        Visible to CODI staff only. Files are retained under the BulSU Anti-GBSH Code and the Data
        Privacy Act of 2012 (RA 10173).
      </p>
    </Layout>
  );
}

function RecordRow({ doc, retentionYears = 5, canApprove = false, onChanged = () => {} }) {
  const retention = doc.retention;
  return (
    <tr className="border-b border-neutral-50 align-top last:border-0 hover:bg-neutral-50">
      <td className="px-5 py-3">
        {/* Link evidence lives in the filer's own storage — there is nothing on
            this server to open, so the link is the file. */}
        {doc.externalUrl ? (
          <a
            href={doc.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-maroon hover:underline"
          >
            {doc.fileName} ↗
          </a>
        ) : (
          <Link
            to={`/cases/${doc.case?.id}`}
            className="font-medium text-neutral-800 hover:underline"
          >
            {doc.fileName}
          </Link>
        )}
        <p className="text-xs text-neutral-400">
          {new Date(doc.uploadedAt).toLocaleDateString()} ·{" "}
          {doc.externalUrl ? "External link" : formatSize(doc.fileSize)}
        </p>
        {doc.archivedAt && (
          <p className="mt-1 text-xs italic text-amber-700">
            Archived{doc.archivedBy ? ` by ${doc.archivedBy.fullName}` : ""}: {doc.archiveReason}
          </p>
        )}
        <RetentionNote
          doc={doc}
          retention={retention}
          retentionYears={retentionYears}
          canApprove={canApprove}
          onChanged={onChanged}
        />
      </td>
      <td className="whitespace-nowrap px-5 py-3">
        {doc.case ? (
          <Link to={`/cases/${doc.case.id}`} className="font-medium text-maroon hover:underline">
            {caseLabel(doc.case)}
          </Link>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-neutral-700">{DOC_TYPE_LABELS[doc.docType] || doc.docType}</td>
      <td className="whitespace-nowrap px-5 py-3">
        {retention?.eligibleForDisposal && (
          <span className="mb-1 flex w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            Eligible for disposal
          </span>
        )}
        {retention?.disposed && (
          <span className="mb-1 flex w-fit rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white">
            Disposal approved
          </span>
        )}
        {doc.archivedAt ? (
          <span className="inline-flex rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
            Archived
          </span>
        ) : doc.supersededAt ? (
          <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            Replaced
          </span>
        ) : (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              DOC_REVIEW_COLORS[doc.reviewStatus] || "bg-neutral-100 text-neutral-700"
            }`}
          >
            {docReviewLabel(doc)}
          </span>
        )}
      </td>
      <td className="hidden px-5 py-3 text-neutral-600 md:table-cell">
        {doc.uploadedBy?.fullName || "—"}
      </td>
    </tr>
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

// The folder view, folded into the filters: a button showing the open folder,
// and a window listing every case with files when it's clicked.
function CaseFolderPicker({ folders, caseId, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const selected = folders.find((f) => f.id === caseId);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? folders.filter((f) => caseLabel(f).toLowerCase().includes(needle))
    : folders;

  function pick(id) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  const itemClass = (active) =>
    `flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
      active ? "bg-maroon/10 font-medium text-maroon" : "text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-500">Case folder</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${selectClass} flex w-52 items-center gap-2 text-left`}
      >
        <FolderIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        <span className="flex-1 truncate">{selected ? caseLabel(selected) : "All cases"}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Case folders"
          className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
        >
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Case folders
          </p>
          {folders.length > 6 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a case…"
              autoFocus
              className={`${selectClass} mb-2 w-full`}
            />
          )}
          <div className="max-h-80 overflow-y-auto">
            <button type="button" onClick={() => pick("")} className={itemClass(!caseId)}>
              All cases
            </button>
            {shown.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => pick(folder.id)}
                className={itemClass(caseId === folder.id)}
              >
                <span className="truncate">{caseLabel(folder)}</span>
                <span className="shrink-0 text-xs font-normal text-neutral-400">
                  {folder.documentCount} file{folder.documentCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
            {folders.length === 0 && (
              <p className="px-3 py-2 text-xs text-neutral-500">No case has files yet.</p>
            )}
            {folders.length > 0 && shown.length === 0 && (
              <p className="px-3 py-2 text-xs text-neutral-500">No case matches “{query}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Typed locally, pushed to the URL once typing stops.
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
          placeholder="File name, case, or who filed it…"
          className={`${selectClass} w-64 pl-9`}
        />
      </span>
    </Field>
  );
}

// Retention under the file name: when it becomes eligible, and — for the
// Secretariat, once it is — the explicit approval. Nothing is deleted here or
// anywhere: approval records who approved it and why, archives the file, and is
// written to the audit log.
function RetentionNote({ doc, retention, retentionYears, canApprove, onChanged }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!retention) return null;

  if (retention.disposed) {
    return (
      <p className="mt-1 text-xs text-neutral-600">
        Disposal approved{doc.disposalApprovedBy ? ` by ${doc.disposalApprovedBy.fullName}` : ""} on{" "}
        {new Date(doc.disposalApprovedAt).toLocaleDateString()}: {doc.disposalNote}
      </p>
    );
  }

  if (!retention.eligibleForDisposal) {
    return (
      <p className="mt-1 text-xs text-neutral-400">
        {retention.eligibleOn
          ? `Kept until at least ${new Date(retention.eligibleOn).toLocaleDateString()} (${retentionYears} years after the case closed).`
          : `Kept at least ${retentionYears} years after its case closes.`}
      </p>
    );
  }

  async function approve() {
    if (!note.trim()) {
      setError("State the reason for the disposal.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post(`/records/${doc.id}/disposal`, { approve: true, note: note.trim() });
      setOpen(false);
      setNote("");
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || "Could not record the approval");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <p className="text-xs text-amber-800">
        Past the {retentionYears}-year retention period — eligible for disposal since{" "}
        {new Date(retention.eligibleOn).toLocaleDateString()}. Nothing is deleted automatically.
      </p>
      {canApprove && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
        >
          Review for disposal…
        </button>
      )}
      {canApprove && open && (
        <div className="mt-2 rounded-md border border-maroon/30 bg-maroon/[0.03] p-3">
          <p className="text-xs font-medium text-neutral-800">
            Approve disposal of “{doc.fileName}”?
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            This archives the file and records your approval in the audit log. The file itself is not
            deleted by the system.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Reason for disposal (required)"
            className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
            >
              {busy ? "Recording…" : "Yes, approve disposal"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              disabled={busy}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
