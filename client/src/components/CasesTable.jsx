import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge.jsx";
import {
  CASE_SIDE_LABELS,
  GOVERNING_FRAMEWORK_LABELS,
  DOC_REVIEW_LABELS,
  DOC_REVIEW_COLORS,
  OFFENSE_CLASSIFICATION_LABELS,
  OFFENSE_CLASSIFICATION_COLORS,
  caseLabel,
} from "../lib/constants.js";
import { displayPhase } from "../lib/caseProgress.js";

// Rolls a case's documents up into one review state for display. The
// requirement is a single approved complaint document, so: one APPROVED doc
// satisfies it; otherwise any PENDING doc means CODI is still reviewing;
// all sent back means RETURNED.
function aggregateReview(allDocuments) {
  // Optional evidence never goes through this review.
  const documents = (allDocuments || []).filter((d) => d.docType !== "EVIDENCE");
  if (documents.length === 0) return null; // nothing uploaded yet
  const statuses = documents.map((d) => d.reviewStatus);
  if (statuses.includes("APPROVED")) return "APPROVED";
  if (statuses.includes("PENDING")) return "PENDING";
  return "RETURNED";
}

function ReviewCell({ documents }) {
  const status = aggregateReview(documents);
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
        No document
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${DOC_REVIEW_COLORS[status]}`}
    >
      {DOC_REVIEW_LABELS[status]}
    </span>
  );
}

function ClassificationCell({ classification }) {
  if (!classification) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
        Not classified
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${OFFENSE_CLASSIFICATION_COLORS[classification]}`}
    >
      {OFFENSE_CLASSIFICATION_LABELS[classification]}
    </span>
  );
}

// Is anyone the complaint names still to be matched to an account? Other
// respondents' rows (shown to a respondent as names only) say nothing either way.
function isUnconfirmed(c) {
  if (c.respondents?.length) return c.respondents.some((r) => !r.other && !r.confirmedAt);
  return !c.respondentConfirmedAt && Boolean(c.claimedRespondentName || c.respondentUser);
}

export default function CasesTable({
  cases,
  emptyMessage = "No cases yet.",
  showReview = false,
  showClassification = false,
  showLastUpdated = false,
  rowAction = null, // optional (case) => JSX, rendered in a trailing column
}) {
  if (cases.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-neutral-500">{emptyMessage}</p>;
  }

  // A university member can be the complainant on one case and the respondent
  // on another, so the list says which side each case puts them on. Staff get
  // no yourSide and no column.
  const showSide = cases.some((c) => c.yourSide);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="whitespace-nowrap px-5 py-3 font-medium">Case No.</th>
            {showSide && <th className="px-5 py-3 font-medium">Your role</th>}
            <th className="px-5 py-3 font-medium">Respondent</th>
            <th className="hidden px-5 py-3 font-medium md:table-cell">Framework</th>
            <th className="px-5 py-3 font-medium">Status</th>
            {showClassification && <th className="px-5 py-3 font-medium">Classification</th>}
            {showReview && <th className="px-5 py-3 font-medium">Documents</th>}
            <th className="hidden px-5 py-3 font-medium sm:table-cell">Filed</th>
            {showLastUpdated && (
              <th className="hidden px-5 py-3 font-medium sm:table-cell">Last Updated</th>
            )}
            {rowAction && <th className="px-5 py-3 font-medium"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50">
              <td className="whitespace-nowrap px-5 py-3.5">
                <Link to={`/cases/${c.id}`} className="font-medium text-maroon hover:underline">
                  {caseLabel(c)}
                </Link>
                {c.isAnonymous && (
                  <span className="mt-1 block w-fit rounded-full bg-neutral-800 px-2 py-0.5 text-[0.65rem] font-medium text-white">
                    Anonymous
                  </span>
                )}
              </td>
              {showSide && (
                <td className="px-5 py-3.5">
                  {c.yourSide ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.yourSide === "COMPLAINANT"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {CASE_SIDE_LABELS[c.yourSide]}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              )}
              <td className="max-w-[16rem] break-words px-5 py-3.5 text-neutral-600">
                {c.respondentUser?.fullName || c.claimedRespondentName || "—"}
                {(c.respondents?.length ?? 0) > 1 && (
                  <span className="ml-1.5 text-xs text-neutral-400">+{c.respondents.length - 1} more</span>
                )}
                {isUnconfirmed(c) && <span className="ml-1.5 text-xs text-amber-700">unconfirmed</span>}
              </td>
              <td className="hidden px-5 py-3.5 text-neutral-600 md:table-cell">
                {GOVERNING_FRAMEWORK_LABELS[c.governingFramework]}
              </td>
              <td className="px-5 py-3.5">
                <StatusBadge phase={displayPhase(c)} />
              </td>
              {showClassification && (
                <td className="px-5 py-3.5">
                  <ClassificationCell classification={c.offenseClassification} />
                </td>
              )}
              {showReview && (
                <td className="px-5 py-3.5">
                  <ReviewCell documents={c.documents} />
                </td>
              )}
              <td className="hidden px-5 py-3.5 text-neutral-500 sm:table-cell">
                {new Date(c.filedAt).toLocaleDateString()}
              </td>
              {showLastUpdated && (
                <td className="hidden px-5 py-3.5 text-neutral-500 sm:table-cell">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </td>
              )}
              {rowAction && <td className="px-5 py-3.5 text-right">{rowAction(c)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
