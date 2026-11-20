import { respondentLabel } from "../lib/caseRespondents.js";

// A row of tabs, one per respondent, for cards that act on each respondent
// separately (voting, confirming a finding). The caller keeps every respondent's
// form mounted and hides the inactive ones, so nothing typed is lost on a switch.
export default function RespondentTabs({ rows, activeId, onChange, badge = null }) {
  return (
    <div role="tablist" aria-label="Respondents" className="mb-3 flex flex-wrap gap-1 border-b border-neutral-200">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          role="tab"
          aria-selected={row.id === activeId}
          onClick={() => onChange(row.id)}
          className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            row.id === activeId
              ? "border-maroon text-maroon"
              : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
          }`}
        >
          {respondentLabel(row)}
          {badge && badge(row)}
        </button>
      ))}
    </div>
  );
}
