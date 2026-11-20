import {
  CASE_PHASES,
  OFFENSE_CLASSIFICATION_LABELS,
  GOVERNING_FRAMEWORK_LABELS,
} from "../lib/constants.js";
import { SearchIcon } from "./icons.jsx";

export const EMPTY_FILTERS = {
  q: "",
  year: "ALL",
  statusBucket: "ALL",
  classification: "ALL",
  framework: "ALL",
  // "ALL", "ANONYMOUS" or "NAMED": how the complaint was filed.
  filing: "ALL",
  dateFrom: "",
  dateTo: "",
};

const selectClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";
const dateClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

// Sort choices for the case list. The value is "key:dir", or "" for the
// default order (newest filed first, as the server returns them).
const SORT_OPTIONS = [
  { value: "caseNo:asc", label: "Case no. (lowest first)" },
  { value: "caseNo:desc", label: "Case no. (highest first)" },
  { value: "status:asc", label: "Status (earliest stage first)" },
  { value: "status:desc", label: "Status (latest stage first)" },
];

export default function CaseFilterPanel({
  filters,
  onChange,
  years,
  searchPlaceholder,
  sort = null, // { key, dir } — with onSortChange, adds a "Sort by" dropdown
  onSortChange = null,
}) {
  function set(patch) {
    onChange({ ...filters, ...patch });
  }

  const isDefault = Object.keys(EMPTY_FILTERS).every((k) => filters[k] === EMPTY_FILTERS[k]);

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-11 pr-4 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.year}
          onChange={(e) => set({ year: e.target.value })}
          className={selectClass}
        >
          <option value="ALL">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={filters.statusBucket}
          onChange={(e) => set({ statusBucket: e.target.value })}
          className={selectClass}
        >
          <option value="ALL">All statuses</option>
          {CASE_PHASES.map((phase) => (
            <option key={phase.key} value={phase.key}>
              {phase.label}
            </option>
          ))}
        </select>

        <select
          value={filters.classification}
          onChange={(e) => set({ classification: e.target.value })}
          className={selectClass}
        >
          <option value="ALL">All classifications</option>
          {Object.entries(OFFENSE_CLASSIFICATION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.framework}
          onChange={(e) => set({ framework: e.target.value })}
          className={selectClass}
        >
          <option value="ALL">All frameworks</option>
          {Object.entries(GOVERNING_FRAMEWORK_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="How the complaint was filed"
          value={filters.filing}
          onChange={(e) => set({ filing: e.target.value })}
          className={selectClass}
        >
          <option value="ALL">Anonymous and named</option>
          <option value="ANONYMOUS">Anonymous only</option>
          <option value="NAMED">Named only</option>
        </select>

        {onSortChange && (
          <select
            aria-label="Sort by"
            value={sort ? `${sort.key}:${sort.dir}` : ""}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              onSortChange(key ? { key, dir } : null);
            }}
            className={selectClass}
          >
            <option value="">Sort by: Newest filed</option>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => set({ dateFrom: e.target.value })}
            className={dateClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => set({ dateTo: e.target.value })}
            className={dateClass}
          />
        </label>

        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-auto rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
