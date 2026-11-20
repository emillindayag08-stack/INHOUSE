import { CASE_PHASE_COLORS, CASE_PHASE_LABELS } from "../lib/constants.js";

// One of the nine case statuses (CASE_PHASES). Pass displayPhase(case) from
// lib/caseProgress.js, not the raw status.
export default function StatusBadge({ phase }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        CASE_PHASE_COLORS[phase] || "bg-neutral-200 text-neutral-800"
      }`}
    >
      {CASE_PHASE_LABELS[phase] || phase}
    </span>
  );
}
