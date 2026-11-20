import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client.js";
import { respondentLabel, respondentView, visibleRespondentRows } from "../lib/caseRespondents.js";
import RespondentTabs from "../components/RespondentTabs.jsx";
import ReviewSummary, { fileListValue } from "../components/ReviewSummary.jsx";
import NotarizedFilePicker, { appendNotarizedFiles, NOTARIZED_MAX_FILES, NOTARIZED_MAX_MB } from "../components/NotarizedFilePicker.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import DeadlineBadge from "../components/DeadlineBadge.jsx";
import VoteProgressBadge from "../components/VoteProgressBadge.jsx";
import CaseTimeline from "../components/CaseTimeline.jsx";
import CaseDocuments, { UploadControl, EvidenceLinkControl } from "../components/CaseDocuments.jsx";
import CaseRiskAssessmentPanel, {
  hasRiskAssessmentContent,
  latestAssessmentsByMember,
  panelClassification,
  standingOverride,
  PanelScoreCard,
  focusRiskRespondent,
} from "../components/CaseRiskAssessmentPanel.jsx";
import CaseSchedulingPanel from "../components/CaseSchedulingPanel.jsx";
import { ANONYMOUS_GROUND_LABELS, REVIEWABLE_DOC_LABELS, RETURN_NOTE_MAX, STATUS_LABELS } from "../lib/constants.js";
import { viewerOf } from "../lib/caseRole.js";
import { displayPhase, documentsShared, progressHidden } from "../lib/caseProgress.js";
import RespondentPicker from "../components/RespondentPicker.jsx";

// Lets a card deep in the page send the viewer to another tab — e.g. a Committee
// member who has just voted "prima facie case found" goes straight to scoring it.
const OPEN_TAB_EVENT = "case:open-tab";
const openCaseTab = (key) => window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: key }));

// Who the case is against: the confirmed account if the Secretariat has
// matched one, otherwise the person the complainant described.
function respondentName(caseDetail) {
  const rows = caseDetail.respondents || [];
  if (rows.length > 1) return rows.map(rowName).join(", ");
  return caseDetail.respondentUser?.fullName || caseDetail.claimedRespondentName || "Not yet confirmed";
}

// One of the (up to three) respondents a case names: their confirmed account
// if there is one, otherwise the name the complainant gave.
const rowName = (row) => row.user?.fullName || row.claimedName;

// Accounts of the respondents this viewer can tell apart. A respondent is told
// only their own; everyone else gets all of them.
function respondentUserIds(caseDetail) {
  const ids = (caseDetail.respondents || []).map((r) => r.userId).filter(Boolean);
  return ids.length ? ids : [caseDetail.respondentId].filter(Boolean);
}

// Student vs Personnel, as shown to staff on the case page.
const RESPONDENT_TYPE_LABELS = { STUDENT: "Student", PERSONNEL: "Teaching or Non-Teaching Personnel" };
import {
  GOVERNING_FRAMEWORK_LABELS,
  OFFENSE_CLASSIFICATION_LABELS,
  PATHWAY_LABELS,
  PATHWAY_COLORS,
  HEARING_TYPE_LABELS,
  getRecommendationSuggestion,
  DECISION_OUTCOME_LABELS,
  DECISION_OUTCOME_COLORS,
  caseLabel,
  caseLabelPrefix,
} from "../lib/constants.js";

// Response-window days per framework, for the template text only (the actual
// deadline is computed server-side in deadlineService.js from the same values).
const RESPONSE_WINDOW_DAYS = { GBSH_CODE: 5, RACCS: 10 };

// True once a SHOW_CAUSE_ORDER document has been submitted as an order. Such a
// document is the record of that attempt — including one the Chairperson
// returned — so it can't be replaced or reused for the next draft.
function isAttachedShowCauseDoc(caseDetail, doc) {
  return (caseDetail.showCauseOrders || []).some((o) => o.documentId === doc.id);
}

function isSentFormalChargeDoc(caseDetail, doc) {
  return (caseDetail.formalCharges || []).some((c) => c.documentId === doc.id);
}

function buildShowCauseTemplate(caseDetail) {
  const frameworkLabel = GOVERNING_FRAMEWORK_LABELS[caseDetail.governingFramework];
  const days = RESPONSE_WINDOW_DAYS[caseDetail.governingFramework] ?? 5;
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  return `Republic of the Philippines
Bulacan State University
Committee on Decorum and Investigation (CODI)

SHOW-CAUSE ORDER

${caseLabelPrefix(caseDetail)}: ${caseLabel(caseDetail)}
Respondent: ${respondentName(caseDetail)}

You are hereby directed to explain in writing, under oath, within ${days} calendar days from receipt of this Order, why no disciplinary action should be taken against you in connection with the following complaint filed by ${caseDetail.complainant.fullName}:

"${caseDetail.description}"

This proceeding is governed by the ${frameworkLabel}. Failure to submit your explanation within the prescribed period may be construed as a waiver of your right to be heard, and the case shall be resolved based on the available records.

Issued this ${today}.

Read this order and file your answer at the CODI case portal, signed in with your BulSU account (${caseDetail.respondentUser?.email ?? "your BulSU email"}).`;
}

// The charge is written outside the system, so this is the starting point:
// letterhead, the particulars to fill in, and the signature block the
// Disciplining Authority signs before the signed copy is filed back.
function buildFormalChargeTemplate(caseDetail) {
  const frameworkLabel = GOVERNING_FRAMEWORK_LABELS[caseDetail.governingFramework];
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const respondentType = caseDetail.respondentUser?.userType || caseDetail.claimedRespondentType;
  const college = caseDetail.respondentUser?.department || caseDetail.claimedRespondentCollege;
  const statusLine = respondentType
    ? `Status: ${RESPONDENT_TYPE_LABELS[respondentType] || respondentType}${college ? ` · ${college}` : ""}`
    : "";

  return `Republic of the Philippines
Bulacan State University
Office of the University President

FORMAL CHARGE

${caseLabelPrefix(caseDetail)}: ${caseLabel(caseDetail)}
Governing rules: ${frameworkLabel}

To: ${respondentName(caseDetail)}
${statusLine}
Date: ${today}

After evaluation of the complaint filed against you and the records of this case, the Committee on Decorum and Investigation found a prima facie case. You are hereby formally charged as follows:

[Set out the particulars of the charge here: the acts complained of, when they occurred, and the provisions they fall under.]

You are directed to submit your notarized written answer within the period prescribed by ${frameworkLabel}, and to state whether you elect a formal investigation or the submission of position papers. Failure to answer within the period shall be taken as a waiver of your right to do so, and the case shall proceed on the records available.


_______________________________
Disciplining Authority
University President

Confidential — this document forms part of the record of ${caseLabel(caseDetail)} and is covered by the confidentiality provisions of the BulSU Anti-GBSH Code and RA 11313.`;
}
export default function CaseDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [caseDetail, setCaseDetail] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  // A tab another part of the page asked to open (see openCaseTab). It may not
  // exist yet — the case is reloading — so it waits until it does.
  const [pendingTab, setPendingTab] = useState(null);

  const refresh = useCallback(() => {
    api
      .get(`/cases/${id}`)
      .then((res) => setCaseDetail(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load case"));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tabs only appear once they'd actually show something, so the tab row
  // doubles as a read on how far the case has progressed. Built before the
  // early returns below so the hooks order stays stable across renders.
  const visibleTabs = caseDetail
    ? buildTabs(caseDetail, user, refresh).filter((tab) => tab.visible)
    : [];

  // A tab can disappear underneath the user — file a recommendation and the
  // status moves on, changing which tabs qualify. Fall back to the first one
  // rather than rendering a blank panel. Keyed off a joined string rather
  // than the array, which is rebuilt on every render and would re-run this.
  const visibleTabKeys = visibleTabs.map((tab) => tab.key).join(",");
  useEffect(() => {
    const keys = visibleTabKeys ? visibleTabKeys.split(",") : [];
    if (keys.length && !keys.includes(activeTab)) setActiveTab(keys[0]);
  }, [visibleTabKeys, activeTab]);

  useEffect(() => {
    const open = (e) => setPendingTab(e.detail);
    window.addEventListener(OPEN_TAB_EVENT, open);
    return () => window.removeEventListener(OPEN_TAB_EVENT, open);
  }, []);
  useEffect(() => {
    if (pendingTab && visibleTabKeys.split(",").includes(pendingTab)) {
      setActiveTab(pendingTab);
      setPendingTab(null);
      window.scrollTo({ top: 0 });
    }
  }, [pendingTab, visibleTabKeys]);

  // Falls back to the first tab for the render that happens before the effect
  // above has corrected a stale activeTab.
  const currentTab = visibleTabs.find((tab) => tab.key === activeTab) || visibleTabs[0];
  // Which side of this case the signed-in person is on — complainant on one
  // case, respondent on another, or neither if they are CODI staff.
  const viewer = viewerOf(caseDetail, user);

  if (error) {
    return (
      <Layout>
        <p className="text-sm text-red-600">{error}</p>
        <Link to="/" className="mt-2 inline-block text-sm text-maroon hover:underline">
          Back to dashboard
        </Link>
      </Layout>
    );
  }

  if (!caseDetail) {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout fill>
      <Link to="/" className="mb-4 inline-block text-sm text-maroon hover:underline lg:shrink-0">
        ← Back to dashboard
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 lg:shrink-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {caseLabelPrefix(caseDetail)}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-neutral-900">{caseLabel(caseDetail)}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {GOVERNING_FRAMEWORK_LABELS[caseDetail.governingFramework]} · Filed{" "}
            {new Date(caseDetail.filedAt).toLocaleDateString()} by{" "}
            {caseDetail.isAnonymous && viewer.isComplainant ? "you, anonymously" : caseDetail.complainant.fullName}
          </p>
          {caseDetail.isAnonymous && (
            <>
              {/* An anonymous complaint is CODI's own case against the respondent. */}
              <p className="mt-1 text-base font-semibold text-neutral-800">
                CODI vs.{" "}
                {(caseDetail.respondents || []).map((r) => r.user?.fullName || r.claimedName).join(", ") ||
                  caseDetail.claimedRespondentName}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white">
                Anonymous complaint
                {viewer.isComplainant && (
                  <span className="font-normal text-white/80">· your name is hidden from everyone else</span>
                )}
              </p>
              {viewer.isComplainant && (
                <p className="mt-2 text-xs text-neutral-500">
                  There is nothing more you need to do. You can follow the case here, and you'll be
                  notified of updates.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {viewer.isComplainant && !caseDetail.isAnonymous && caseDetail.status === "RETURNED_FOR_CORRECTION" && (
            <Link
              to={`/cases/${caseDetail.id}/edit`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Edit complaint
            </Link>
          )}
          {caseDetail.status === "DISMISSED" && caseDetail.dismissalType && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                caseDetail.dismissalType === "WITH_PREJUDICE"
                  ? "bg-neutral-800 text-white"
                  : "bg-neutral-200 text-neutral-700"
              }`}
            >
              {caseDetail.dismissalType === "WITH_PREJUDICE" ? "With prejudice" : "Without prejudice"}
            </span>
          )}
          {/* The status, with the detailed step it is at underneath. An
              anonymous complainant past verification sees neither. */}
          <div className="flex flex-col items-end gap-0.5">
            <StatusBadge phase={displayPhase(caseDetail)} />
            {!progressHidden(caseDetail) && (
              <span className="text-xs text-neutral-500">{STATUS_LABELS[caseDetail.status] || caseDetail.status}</span>
            )}
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Case sections"
        className="mb-6 flex flex-wrap gap-1 border-b border-neutral-200 lg:shrink-0"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={currentTab.key === tab.key}
            aria-controls={`case-panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              currentTab.key === tab.key
                ? "border-maroon text-maroon"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4/7 + 3/7 split — the actions column lands at ~43% of the width,
          wider than the original third so its forms aren't cramped, without
          squeezing the tab content down to half. */}
      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-7 lg:overflow-hidden">
        <div
          id={`case-panel-${currentTab.key}`}
          role="tabpanel"
          className="space-y-6 lg:col-span-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1"
        >
          {currentTab.render()}
        </div>

        {/* Deliberately outside the tab system: hiding an action behind a tab
            the user hasn't clicked is how a required step gets missed. */}
        <div className="space-y-4 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <CaseActions caseDetail={caseDetail} user={user} onDone={refresh} />
        </div>
      </div>
    </Layout>
  );
}

// The five case-detail tabs, in display order. Each carries its own
// visibility predicate so a tab never renders an empty panel — the row of
// tabs ends up reflecting how far the case has actually progressed.
const CODI_STAFF_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

function buildTabs(caseDetail, user, refresh) {
  const viewer = viewerOf(caseDetail, user);
  const hasRecommendationDoc = (caseDetail.documents || []).some(
    (d) => d.docType === "RECOMMENDATION"
  );
  // Not role-gated on purpose: at these statuses the Secretariat gets action
  // cards and everyone else gets the "awaiting…" banners, so either way the
  // panel has something in it.
  const awaitingRecOrOutcome =
    caseDetail.finalPathway === "FORMAL_INVESTIGATION" &&
    ["FORMAL_INVESTIGATION_ENDED", "DECIDED"].includes(caseDetail.status);

  return [
    {
      key: "overview",
      label: "Overview",
      visible: true,
      render: () => (
        <>
          {/* The respondent learns the substance of the allegation only through
              the official show-cause order (and later, the formal charge) —
              not this internal case-management summary. */}
          {(!viewer.isRespondent || documentsShared(caseDetail)) && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-bold text-neutral-800">Complaint description</h2>
              {caseDetail.notEntertainedAt && (
                <p className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="font-medium">Not entertained under Section 12 of the 2025 RACCS</span> on{" "}
                  {new Date(caseDetail.notEntertainedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.
                  {caseDetail.notEntertainedReason ? ` Reason: ${caseDetail.notEntertainedReason}` : ""}
                </p>
              )}
              <p className="whitespace-pre-line break-words text-sm text-neutral-600">
                {caseDetail.description}
              </p>
              {caseDetail.isAnonymous && (caseDetail.incidentDate || caseDetail.anonymousGrounds?.length > 0) && (
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  {caseDetail.incidentDate && (
                    <div className="min-w-0">
                      <dt className="text-xs uppercase text-neutral-400">Incident</dt>
                      <dd className="break-words text-neutral-700">
                        {new Date(caseDetail.incidentDate).toLocaleDateString(undefined, { dateStyle: "long" })}
                        {caseDetail.incidentPlace ? ` · ${caseDetail.incidentPlace}` : ""}
                      </dd>
                    </div>
                  )}
                  {/* What the filer said makes it entertainable: for CODI and the filer, not the respondent. */}
                  {caseDetail.anonymousGrounds?.length > 0 && !viewer.isRespondent && (
                    <div className="min-w-0">
                      <dt className="text-xs uppercase text-neutral-400">
                        Section 12 condition{caseDetail.anonymousGrounds.length > 1 ? "s" : ""} claimed
                      </dt>
                      <dd className="break-words text-neutral-700">
                        <GroundList grounds={caseDetail.anonymousGrounds} />
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {(caseDetail.respondents || []).length > 1 ? (
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs uppercase text-neutral-400">Respondents</dt>
                    <dd>
                      <ul className="space-y-1 text-neutral-700">
                        {caseDetail.respondents.map((r) => (
                          <li key={r.id} className="break-words">
                            {rowName(r)}
                            <span className="text-neutral-400">
                              {" "}
                              · {RESPONDENT_TYPE_LABELS[r.typeAtFiling || r.claimedType || r.user?.userType] || "—"}
                            </span>
                            {!r.other && !r.confirmedAt && (
                              <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                As named by the complainant
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <dt className="text-xs uppercase text-neutral-400">Respondent</dt>
                      <dd className="break-words text-neutral-700">
                        {respondentName(caseDetail)}
                        {!caseDetail.respondentConfirmedAt && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            As named by the complainant
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs uppercase text-neutral-400">Respondent status</dt>
                      <dd className="break-words text-neutral-700">
                        {RESPONDENT_TYPE_LABELS[
                          caseDetail.respondentTypeAtFiling ||
                            caseDetail.claimedRespondentType ||
                            caseDetail.respondentUser?.userType
                        ] || "—"}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="text-xs uppercase text-neutral-400">Peer-to-peer</dt>
                  <dd className="text-neutral-700">{caseDetail.isPeerToPeer ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-neutral-400">First offense</dt>
                  <dd className="text-neutral-700">{caseDetail.isFirstOffense ? "Yes" : "No"}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* The respondent's counterpart to the complaint-description card
              above (hidden from them) — this is how they actually learn the
              substance of the allegation: the official show-cause order. */}
          {viewer.isRespondent && <ShowCauseOrderCard caseDetail={caseDetail} />}

          {viewer.isSecretariat && (caseDetail.respondentUser || caseDetail.respondents?.some((r) => r.user)) && (
            <RespondentCredentialsCard caseDetail={caseDetail} />
          )}

          {/* Where the Committee stands on the prima facie question. Staff-only:
              the parties learn the outcome through the case status, not the
              panel’s internal deliberation. */}
          {CODI_STAFF_ROLES.has(user.role) &&
            ((caseDetail.primaFacieVotes || []).length > 0 ||
              caseDetail.status === "ANSWER_SUBMITTED") && (
              <section className="rounded-xl border border-neutral-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-bold text-neutral-800">
                  Prima facie evaluation
                </h2>
                {visibleRespondentRows(caseDetail).length > 1 ? (
                  <div className="space-y-5">
                    {visibleRespondentRows(caseDetail).map((row) => (
                      <div key={row.id}>
                        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-800">
                          {respondentLabel(row)}
                          {row.primaFacieFound === true && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              Prima facie case found
                            </span>
                          )}
                          {row.primaFacieFound === false && (
                            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
                              No prima facie case
                            </span>
                          )}
                        </p>
                        <PrimaFacieTally caseDetail={respondentView(caseDetail, row)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <PrimaFacieTally caseDetail={respondentView(caseDetail, visibleRespondentRows(caseDetail)[0] || null)} />
                )}
              </section>
            )}

          {/* While the prima facie meeting is being set, the Secretariat and
              Committee get the scheduler in their actions column instead. */}
          {!(
            isAwaitingPrimaFacieMeeting(caseDetail) &&
            (user.role === "SECRETARIAT" || user.role === "COMMITTEE")
          ) && <CaseSchedulingPanel caseDetail={caseDetail} user={user} onDone={refresh} />}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-neutral-800">Case timeline</h2>
            <CaseTimeline caseDetail={caseDetail} />
          </section>
        </>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      visible: true,
      render: () => (
        <>
          <CaseDocuments
            caseDetail={caseDetail}
            user={user}
            onDone={refresh}
            restrictComplaintEditDuringCorrection
          />

          {/* Grouped with the documents rather than the overview: nearly every
              deadline here is a window for submitting one of them. */}
          {caseDetail.deadlines?.length > 0 && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold text-neutral-800">Compliance deadlines</h2>
              <div className="flex flex-wrap gap-2">
                {caseDetail.deadlines.map((d) => (
                  <DeadlineBadge key={d.id} deadline={d} />
                ))}
              </div>
            </section>
          )}
        </>
      ),
    },
    {
      key: "risk",
      label: "Risk assessment",
      visible: hasRiskAssessmentContent(caseDetail, user),
      render: () => <CaseRiskAssessmentPanel caseDetail={caseDetail} user={user} onDone={refresh} />,
    },
    {
      key: "pathway",
      label: "Pathway",
      visible: (caseDetail.formalCharges || []).length > 0,
      render: () => <PathwaySummaryCard caseDetail={caseDetail} user={user} onDone={refresh} />,
    },
    {
      key: "outcome",
      label: "Recommendation & outcome",
      visible: hasRecommendationDoc || !!caseDetail.decision || awaitingRecOrOutcome,
      render: () => (
        <RecommendationOutcomeSection caseDetail={caseDetail} user={user} onDone={refresh} />
      ),
    },
  ];
}

function ShowCauseOrderCard({ caseDetail }) {
  // Only an order the Secretariat has served exists as far as the respondent
  // is concerned — drafts, returns and orders merely approved are still
  // Secretariat/Chairperson-internal.
  const servedOrders = (caseDetail.showCauseOrders || []).filter((o) => o.status === "SERVED");
  const order = servedOrders[servedOrders.length - 1];
  if (!order) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-neutral-800">Show-cause order</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Issued {new Date(order.servedAt || order.reviewedAt || order.issuedAt).toLocaleDateString()}
        {order.issuedBy?.fullName ? ` by ${order.issuedBy.fullName}` : ""}
      </p>
      {/* Orders issued before the order became a file still carry their text. */}
      {order.document ? (
        <p className="rounded-lg bg-neutral-50 p-4 text-sm">
          <RecommendationDocLink caseId={caseDetail.id} doc={order.document} />
        </p>
      ) : (
        <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700">
          {order.content}
        </p>
      )}
    </section>
  );
}

// Stays on the Overview tab for the life of the case, so the Secretariat can
// always see which account belongs to this respondent. Credentials are not
// CODI's to hand out: everyone signs in with the BulSU account the directory
// already gave them, so this card identifies the account and nothing more.
function RespondentCredentialsCard({ caseDetail }) {
  const accounts = (caseDetail.respondents || []).map((r) => r.user).filter(Boolean);
  if (accounts.length === 0 && caseDetail.respondentUser) accounts.push(caseDetail.respondentUser);
  const many = accounts.length > 1;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-medium text-neutral-800">
        {many ? "Respondent accounts" : "Respondent account"}
      </h2>
      <p className="mb-3 text-xs text-neutral-500">
        {many ? "Each respondent reads" : "The respondent reads"} the show-cause order and files{" "}
        {many ? "their own answer" : "their answer"} signed in with their own BulSU account.
      </p>
      <div className="space-y-3">
        {accounts.map((account) => (
          <dl key={account.id} className={`space-y-1 text-sm ${many ? "rounded-md bg-neutral-50 p-3" : ""}`}>
            <div className="flex gap-2">
              <dt className="font-medium text-neutral-800">Name:</dt>
              <dd className="text-neutral-800">{account.fullName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-neutral-800">BulSU account:</dt>
              <dd className="font-mono text-neutral-800">{account.email}</dd>
            </div>
            {account.directoryId && (
              <div className="flex gap-2">
                <dt className="font-medium text-neutral-800">ID number:</dt>
                <dd className="font-mono text-neutral-800">{account.directoryId}</dd>
              </div>
            )}
          </dl>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        If they cannot sign in, they recover their account through the university, the same as any
        other BulSU service.
      </p>
    </section>
  );
}

function PathwayBadge({ pathway }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${PATHWAY_COLORS[pathway]}`}
    >
      {PATHWAY_LABELS[pathway]}
    </span>
  );
}

const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

// Whether each party's position paper is on file — shared by the pathway
// summary card and the deliberation auto-draft below.
function positionPaperStatus(caseDetail) {
  const positionPapers = (caseDetail.documents || []).filter(
    (d) => d.docType === "POSITION_PAPER" && d.reviewStatus === "APPROVED"
  );
  // An anonymous complainant owes no paper.
  const complainantPaperIn =
    !!caseDetail.isAnonymous || positionPapers.some((d) => d.uploadedById === caseDetail.complainantId);
  const rows = (caseDetail.respondents || []).filter((r) => r.userId);
  const respondentPaperIn = rows.length
    ? rows.every((r) => positionPapers.some((d) => d.uploadedById === r.userId))
    : positionPapers.some((d) => d.uploadedById === caseDetail.respondentId);
  return { complainantPaperIn, respondentPaperIn, bothIn: complainantPaperIn && respondentPaperIn };
}

// Once both position papers are on file, draft the CODI report's factual
// findings from what's already on the case record (prima facie rationale,
// the respondent's formal answer, and the risk classification) — the
// Committee reviews and edits this before submitting, same as the
// recommendation prefill below.
function buildPositionPaperFindings(caseDetail) {
  const primaFacie = (caseDetail.primaFacieEvals || [])[caseDetail.primaFacieEvals.length - 1];
  const formalAnswer = (caseDetail.respondentAnswers || []).find((a) => a.stage === "FORMAL_CHARGE");
  const classificationLabel = caseDetail.offenseClassification
    ? OFFENSE_CLASSIFICATION_LABELS[caseDetail.offenseClassification]
    : null;

  const lines = [
    caseDetail.isAnonymous
      ? "This anonymous complaint proceeds by the respondent's position paper only; this report is based on the respondent's written submission and the record on file, with no formal hearing conducted."
      : "Both parties elected the Position Paper pathway; this report is based on their written submissions on file, with no formal hearing conducted.",
  ];
  if (primaFacie) lines.push(`Prima facie finding: ${primaFacie.rationale}`);
  if (formalAnswer) lines.push(`Respondent's position: ${formalAnswer.content}`);
  lines.push(
    classificationLabel
      ? `Risk classification: ${classificationLabel} (per the Committee's risk assessment).`
      : "Risk classification: not yet recorded — see the Risk assessment section above."
  );
  return lines.join("\n\n");
}

// A full downloadable draft of the CODI report — the Committee/Secretariat
// downloads this, fills it in / converts it to PDF or Word outside the app,
// then attaches the finished file via the upload control (see
// DeliberationAction). Mirrors buildShowCauseTemplate's role for the
// show-cause order, just as a file download instead of a textarea.
function buildCodiReportTemplate(caseDetail, recommendation) {
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const findings = buildPositionPaperFindings(caseDetail);

  return `Republic of the Philippines
Bulacan State University
Committee on Decorum and Investigation (CODI)

CODI REPORT AND RECOMMENDATION

${caseLabelPrefix(caseDetail)}: ${caseLabel(caseDetail)}
Complainant: ${caseDetail.complainant?.fullName || "—"}
Respondent: ${caseDetail.respondentUser?.fullName || "—"}
Governing framework: ${GOVERNING_FRAMEWORK_LABELS[caseDetail.governingFramework] || "—"}

FACTUAL FINDINGS AND LEGAL ASSESSMENT

${findings}

RECOMMENDATION

${recommendation?.trim() || "[State the recommended disciplinary action here.]"}

Prepared by: ______________________
Date: ${today}`;
}

function triggerDownload(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTextFile(fileName, content) {
  triggerDownload(fileName, new Blob([content], { type: "text/plain;charset=utf-8" }));
}

// Word opens an HTML document served as application/msword and keeps the
// paragraph structure, which is enough for these one-page orders — so we
// avoid pulling in a .docx generator just to produce a printable draft.
function downloadWordFile(fileName, content) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = String(content)
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8" /><title>${escape(
    fileName
  )}</title></head><body style="font-family:'Times New Roman',serif;font-size:12pt;">${body}</body></html>`;
  triggerDownload(fileName, new Blob(["﻿", html], { type: "application/msword" }));
}

function PathwaySummaryCard({ caseDetail, user, onDone }) {
  const latestCharge = (caseDetail.formalCharges || [])[caseDetail.formalCharges?.length - 1];
  if (!latestCharge) return null;

  const chargeDoc = (caseDetail.documents || []).find((d) => d.docType === "FORMAL_CHARGE");
  const { respondentPathwayChoice, complainantPathwayChoice, finalPathway } = caseDetail;
  const { complainantPaperIn, respondentPaperIn } = positionPaperStatus(caseDetail);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-neutral-800">Formal charge & pathway</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Sent {new Date(latestCharge.issuedAt).toLocaleDateString()}
      </p>
      {/* The charge is a document now. Charges recorded before that change
          only have the transcribed text, so fall back to it. */}
      {chargeDoc ? (
        <p className="mb-4 rounded-md bg-neutral-50 p-3 text-sm">
          <RecommendationDocLink caseId={caseDetail.id} doc={chargeDoc} />
        </p>
      ) : latestCharge.chargeDetails ? (
        <p className="mb-4 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
          {latestCharge.chargeDetails}
        </p>
      ) : null}

      {caseDetail.isAnonymous && (
        <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          This is an anonymous complaint, so it proceeds by the respondent's position paper only.
          There is no pathway to choose and no hearing.
          {!finalPathway && " The position paper opens once the answer to the charge is approved."}
        </p>
      )}

      {!caseDetail.isAnonymous && (
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-neutral-400">
            {(caseDetail.respondents || []).length > 1 ? "Respondents' pathways" : "Respondent's pathway"}
          </dt>
          <dd className="mt-1 space-y-1">
            {(caseDetail.respondents || []).length > 1 ? (
              caseDetail.respondents
                .filter((r) => !r.other)
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-neutral-500">{rowName(r)}</span>
                    {r.pathwayChoice ? (
                      <PathwayBadge pathway={r.pathwayChoice} />
                    ) : (
                      <span className="text-neutral-400">Not yet chosen</span>
                    )}
                  </div>
                ))
            ) : respondentPathwayChoice ? (
              <PathwayBadge pathway={respondentPathwayChoice} />
            ) : (
              <span className="text-neutral-400">Not yet chosen</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-neutral-400">Complainant's pathway</dt>
          <dd className="mt-1">
            {complainantPathwayChoice ? <PathwayBadge pathway={complainantPathwayChoice} /> : (
              <span className="text-neutral-400">Not yet chosen</span>
            )}
          </dd>
        </div>
      </dl>
      )}

      {finalPathway ? (
        <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-3 text-sm">
          <span className="font-medium text-neutral-700">Final pathway:</span>
          <PathwayBadge pathway={finalPathway} />
          {caseDetail.isAnonymous ? (
            <span className="text-xs text-neutral-400">(respondent's position paper only)</span>
          ) : caseDetail.pathwayRecommendedAt && (
            <span className="text-xs text-neutral-400">(recommended by the Secretariat)</span>
          )}
        </div>
      ) : null}

      {finalPathway === "FORMAL_INVESTIGATION" && (
        <FormalInvestigationHearings caseDetail={caseDetail} user={user} onDone={onDone} />
      )}

      {finalPathway === "POSITION_PAPER" && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="mb-2 text-sm font-medium text-neutral-700">Position papers on file</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {!caseDetail.isAnonymous && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                complainantPaperIn ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-500"
              }`}
            >
              Complainant {complainantPaperIn ? "✓ submitted" : "— not yet submitted"}
            </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                respondentPaperIn ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-500"
              }`}
            >
              Respondent {respondentPaperIn ? "✓ submitted" : "— not yet submitted"}
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {caseDetail.isAnonymous
              ? "See Case documents below to upload. Deliberation can't be recorded until the respondent's paper is on file."
              : "See Case documents below to upload. Deliberation can't be recorded until both are on file."}
          </p>
        </div>
      )}
    </section>
  );
}

// Formal Investigation pathway: the hearings half of the investigation —
// hearings list, per-party guidance notes + submissions, and the
// Secretariat's schedule/end controls. Lives inside the always-visible
// PathwaySummaryCard rather than the role-gated CaseActions sidebar, so every
// case party and CODI role can see the state of the investigation even though
// only the Secretariat can act on it.
//
// The recommendation/outcome half lives in RecommendationOutcomeSection,
// which the page renders in its own tab.
function FormalInvestigationHearings({ caseDetail, user, onDone }) {
  const hearings = caseDetail.hearings || [];
  const isSecretariat = user.role === "SECRETARIAT";
  const canManageHearings =
    isSecretariat && (caseDetail.status === "FORMAL_CHARGE_ISSUED" || caseDetail.status === "HEARING_SCHEDULED");
  const canEndInvestigation = isSecretariat && caseDetail.status === "HEARING_SCHEDULED";

  return (
    <div className="mt-4 border-t border-neutral-100 pt-3">
      <p className="mb-2 text-sm font-medium text-neutral-700">Hearings</p>
      {hearings.length === 0 ? (
        <p className="text-xs text-neutral-500">No hearing scheduled yet.</p>
      ) : (
        <ul className="space-y-3">
          {hearings.map((h) => (
            <HearingCard key={h.id} hearing={h} caseDetail={caseDetail} user={user} onDone={onDone} />
          ))}
        </ul>
      )}

      {/* Agree a time with the Committee and Chairperson first — confirming a
          slot there schedules the hearing. The form below stays for when the
          Secretariat already knows the date and needs no round. Both go once
          the investigation ends: the hearings themselves stay listed above. */}
      {caseDetail.finalPathway === "FORMAL_INVESTIGATION" &&
        (caseDetail.status === "FORMAL_CHARGE_ISSUED" ||
          caseDetail.status === "HEARING_SCHEDULED") && (
        <div className="mt-3">
          <CaseSchedulingPanel
            caseDetail={caseDetail}
            user={user}
            onDone={onDone}
            purpose="HEARING"
          />
        </div>
      )}

      {canManageHearings && (
        <ScheduleHearingInline caseId={caseDetail.id} isFirstHearing={hearings.length === 0} onDone={onDone} />
      )}
      {canEndInvestigation && <EndInvestigationButton caseId={caseDetail.id} onDone={onDone} />}
    </div>
  );
}

// The "Recommendation & outcome" tab. Rendered directly by the page rather
// than nested under PathwaySummaryCard, so it re-applies that card's
// formal-charge guard itself.
//
// Covers both pathways: Formal Investigation files a recommendation document
// and then records an externally-decided outcome, while Position Paper
// records its decision through the sidebar and only needs the result shown.
function RecommendationOutcomeSection({ caseDetail, user, onDone }) {
  const latestCharge = (caseDetail.formalCharges || [])[caseDetail.formalCharges?.length - 1];
  if (!latestCharge) return null;

  const isSecretariat = user.role === "SECRETARIAT";
  // The outcome is the Disciplining Authority's; they record it, or the
  // Secretariat records it with them.
  const canRecordOutcome = isSecretariat || user.role === "DISCIPLINING_AUTHORITY";
  const isFormalInvestigation = caseDetail.finalPathway === "FORMAL_INVESTIGATION";
  const investigationEnded = caseDetail.status === "FORMAL_INVESTIGATION_ENDED";
  const recommendationDoc = (caseDetail.documents || []).find((d) => d.docType === "RECOMMENDATION");
  const decision = caseDetail.decision;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-bold text-neutral-800">Recommendation &amp; outcome</h2>

      {isFormalInvestigation && investigationEnded &&
        (isSecretariat ? (
          <RecommendationFilingAction caseDetail={caseDetail} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Formal investigation concluded — awaiting the Secretariat's recommendation.
          </p>
        ))}

      {isFormalInvestigation && caseDetail.status === "DECIDED" &&
        (canRecordOutcome ? (
          <RecordOutcomeAction caseDetail={caseDetail} onDone={onDone} />
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The Secretariat's recommendation has been filed and forwarded — awaiting the outcome from the deciding
            body.
          </p>
        ))}

      {/* Visible from DECIDED onward for every role, well before the outcome
          arrives — the recommendation is filed first and the outcome may take
          a while to come back from the external deciding body. */}
      {recommendationDoc && !investigationEnded && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-neutral-800">Filed recommendation</h3>
            {decision && <DecisionOutcomeBadge decision={decision} />}
          </div>
          <p className="mt-2">
            <RecommendationDocLink caseId={caseDetail.id} doc={recommendationDoc} />
          </p>
          {decision ? (
            <DecisionDetails decision={decision} />
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Awaiting the outcome from the external deciding body.</p>
          )}
        </div>
      )}

      {/* Position Paper cases record their decision through the sidebar's
          "Log the President's decision" card, so the result would otherwise
          never surface in the main column. */}
      {!isFormalInvestigation && decision && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-neutral-800">Decision</h3>
            <DecisionOutcomeBadge decision={decision} />
          </div>
          <DecisionDetails decision={decision} />
        </div>
      )}
    </section>
  );
}

function DecisionOutcomeBadge({ decision }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        DECISION_OUTCOME_COLORS[decision.outcome] || "bg-neutral-200 text-neutral-800"
      }`}
    >
      {DECISION_OUTCOME_LABELS[decision.outcome] || decision.outcome}
    </span>
  );
}

function DecisionDetails({ decision }) {
  return (
    <>
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{decision.rationale}</p>
      {decision.penalty && (
        <p className="mt-1 text-sm text-neutral-700">
          <span className="font-medium">Penalty:</span> {decision.penalty}
        </p>
      )}
      <p className="mt-2 text-xs text-neutral-400">
        Filed by {decision.decidedBy?.fullName} · {new Date(decision.decidedAt).toLocaleString()}
      </p>
    </>
  );
}

function RecommendationDocLink({ caseId, doc }) {
  const [error, setError] = useState("");

  async function open() {
    setError("");
    try {
      const res = await api.get(`/cases/${caseId}/documents/${doc.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Could not open the file.");
    }
  }

  return (
    <>
      {/* Explicitly type="button": this link renders inside the Chairperson's
          review form, where the default "submit" would approve and issue the
          order the moment they clicked to read it. */}
      <button type="button" onClick={open} className="text-sm font-medium text-maroon hover:underline">
        {doc.fileName}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </>
  );
}

function HearingCard({ hearing, caseDetail, user, onDone }) {
  const isSecretariat = user.role === "SECRETARIAT";
  const viewer = viewerOf(caseDetail, user);
  const isComplainant = viewer.isComplainant;
  const isRespondent = viewer.isRespondent;
  const complainantDocs = (hearing.documents || []).filter((d) => d.uploadedById === caseDetail.complainantId);
  const respondentIds = respondentUserIds(caseDetail);
  const respondentDocs = (hearing.documents || []).filter((d) => respondentIds.includes(d.uploadedById));
  const minutesDoc = (hearing.documents || []).find((d) => d.docType === "HEARING_MINUTES");

  return (
    <li className="rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
          {HEARING_TYPE_LABELS[hearing.type] || hearing.type}
        </span>
        <span className="text-xs text-neutral-400">{new Date(hearing.scheduledAt).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {hearing.mode}
        {hearing.scheduledBy?.fullName ? ` · Scheduled by ${hearing.scheduledBy.fullName}` : ""}
      </p>
      {hearing.notes && <p className="mt-1 text-sm text-neutral-700">{hearing.notes}</p>}

      <div className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2">
        <HearingPartyNote
          label="Complainant"
          note={hearing.noteForComplainant}
          requiresDoc={hearing.requiresDocFromComplainant}
          docs={complainantDocs}
          canUpload={isComplainant && hearing.requiresDocFromComplainant}
          caseId={caseDetail.id}
          hearingId={hearing.id}
          onDone={onDone}
        />
        <HearingPartyNote
          label="Respondent"
          note={hearing.noteForRespondent}
          requiresDoc={hearing.requiresDocFromRespondent}
          docs={respondentDocs}
          canUpload={isRespondent && hearing.requiresDocFromRespondent}
          caseId={caseDetail.id}
          hearingId={hearing.id}
          onDone={onDone}
        />
      </div>

      <HearingMinutesSection
        hearingId={hearing.id}
        hearingType={hearing.type}
        doc={minutesDoc}
        isSecretariat={isSecretariat}
        caseId={caseDetail.id}
        onDone={onDone}
      />

      {isSecretariat && <HearingNoteForm hearing={hearing} caseId={caseDetail.id} onDone={onDone} />}
    </li>
  );
}

// Required before the Secretariat can end the formal investigation (see
// POST /:id/end-formal-investigation) — every hearing, Pre-Trial or Trial,
// must have its minutes on file. One doc per hearing; re-uploading replaces
// it (mirrors the recommendation/CODI-report pattern).
function HearingMinutesSection({ hearingId, hearingType, doc, isSecretariat, caseId, onDone }) {
  const label = `${HEARING_TYPE_LABELS[hearingType] || hearingType} minutes`;
  return (
    <div className="mt-3 rounded-md bg-neutral-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        {!doc && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Required
          </span>
        )}
      </div>
      {doc ? (
        <ul className="mt-2 space-y-1">
          <HearingDocLink caseId={caseId} doc={doc} />
        </ul>
      ) : (
        <p className="mt-1 text-xs text-neutral-400">No {label.toLowerCase()} attached yet.</p>
      )}
      {isSecretariat && (
        <UploadControl
          caseId={caseId}
          onDone={onDone}
          docType="HEARING_MINUTES"
          maxMb={50}
          accept="image/*,video/*,application/pdf"
          label={doc ? `Replace the ${label.toLowerCase()}` : `Attach the ${label.toLowerCase()}`}
          extraFields={{ hearingId }}
          submitLabel={doc ? "Replace minutes" : "Upload minutes"}
        />
      )}
    </div>
  );
}

function HearingPartyNote({ label, note, requiresDoc, docs, canUpload, caseId, hearingId, onDone }) {
  return (
    <div className="rounded-md bg-neutral-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        {requiresDoc &&
          (docs.length > 0 ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Submitted
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Document required
            </span>
          ))}
      </div>
      {note ? (
        <p className="mt-1 text-sm text-neutral-700">{note}</p>
      ) : (
        <p className="mt-1 text-xs text-neutral-400">No note left yet.</p>
      )}
      {docs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {docs.map((d) => (
            <HearingDocLink key={d.id} caseId={caseId} doc={d} />
          ))}
        </ul>
      )}
      {canUpload && <HearingSubmissionControl caseId={caseId} hearingId={hearingId} onDone={onDone} />}
    </div>
  );
}

// What a party sends in answer to a hearing note: a file (up to 10 MB) or a
// link to one stored elsewhere, whichever is easier for them.
const HEARING_SUBMISSION_ACCEPT = "image/*,video/*,audio/*,application/pdf,.doc,.docx";

function HearingSubmissionControl({ caseId, hearingId, onDone }) {
  const [mode, setMode] = useState("file");

  return (
    <div className="mt-3 rounded-lg border-2 border-maroon/30 bg-white p-3">
      <p className="text-sm font-medium text-neutral-900">Submit what the Secretariat asked for</p>
      <p className="mt-0.5 text-xs text-neutral-500">Attach the file directly, or share a link if it's stored online.</p>
      <div role="tablist" aria-label="How to submit" className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
        {[
          ["file", "Attach a file"],
          ["link", "Share a link"],
        ].map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === value ? "bg-white text-maroon shadow-sm" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <UploadControl
          caseId={caseId}
          onDone={onDone}
          docType="EVIDENCE"
          maxMb={10}
          accept={HEARING_SUBMISSION_ACCEPT}
          extraFields={{ hearingId }}
          label="Choose a file: photo, video, audio, PDF, or Word document (max 10 MB)"
          submitLabel="Submit file"
        />
      ) : (
        <EvidenceLinkControl
          caseId={caseId}
          onDone={onDone}
          hearingId={hearingId}
          label="A Google Drive, OneDrive, or other share link to the file."
          compact
        />
      )}
    </div>
  );
}

function HearingDocLink({ caseId, doc }) {
  const [error, setError] = useState("");

  // Link submissions open the shared location directly; there's no stored file.
  if (doc.externalUrl) {
    return (
      <li>
        <a
          href={doc.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-maroon hover:underline"
        >
          {doc.fileName}
        </a>
        <span className="ml-1.5 text-xs text-neutral-400">link</span>
      </li>
    );
  }

  async function open() {
    setError("");
    try {
      const res = await api.get(`/cases/${caseId}/documents/${doc.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Could not open the file.");
    }
  }

  return (
    <li>
      <button onClick={open} className="text-xs font-medium text-maroon hover:underline">
        {doc.fileName}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </li>
  );
}

function HearingNoteForm({ hearing, caseId, onDone }) {
  const [noteForComplainant, setNoteForComplainant] = useState(hearing.noteForComplainant || "");
  const [noteForRespondent, setNoteForRespondent] = useState(hearing.noteForRespondent || "");
  const [requiresDocFromComplainant, setRequiresDocFromComplainant] = useState(
    hearing.requiresDocFromComplainant || false
  );
  const [requiresDocFromRespondent, setRequiresDocFromRespondent] = useState(
    hearing.requiresDocFromRespondent || false
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/hearings/${hearing.id}/notes`, {
        noteForComplainant,
        noteForRespondent,
        requiresDocFromComplainant,
        requiresDocFromRespondent,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save notes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
      <p className="text-xs font-medium text-neutral-600">Leave guidance for each party (optional)</p>
      <div>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          placeholder="Note for the complainant — what should they submit?"
          value={noteForComplainant}
          onChange={(e) => setNoteForComplainant(e.target.value)}
        />
        <label className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={requiresDocFromComplainant}
            onChange={(e) => setRequiresDocFromComplainant(e.target.checked)}
          />
          Requires a document from the complainant
        </label>
      </div>
      <div>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          placeholder="Note for the respondent — what should they submit?"
          value={noteForRespondent}
          onChange={(e) => setNoteForRespondent(e.target.value)}
        />
        <label className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={requiresDocFromRespondent}
            onChange={(e) => setRequiresDocFromRespondent(e.target.checked)}
          />
          Requires a document from the respondent
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-maroon px-4 py-1.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save notes"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function ScheduleHearingInline({ caseId, isFirstHearing, onDone }) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [mode, setMode] = useState("In-person");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const label = isFirstHearing ? "Pre-Trial" : "Trial";

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/hearings`, { scheduledAt, mode, notes });
      setScheduledAt("");
      setNotes("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to schedule hearing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-lg border border-dashed border-neutral-300 p-3">
      <p className="text-xs font-medium text-neutral-600">Schedule {label} hearing</p>
      <input
        required
        type="datetime-local"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
      />
      <select
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option>In-person</option>
        <option>Videoconference</option>
      </select>
      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={2}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-maroon px-4 py-1.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
      >
        {submitting ? "Scheduling…" : `Schedule ${label} hearing`}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function EndInvestigationButton({ caseId, onDone }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!window.confirm("End the formal investigation? No further hearings can be scheduled after this.")) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/end-formal-investigation`, {});
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to end the investigation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded-md border border-maroon px-4 py-1.5 text-sm font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
      >
        {submitting ? "Ending…" : "End Formal Investigation"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Formal Investigation pathway, stage 1 of 2: file the recommendation
// document. Mirrors the Position Paper pathway's CODI report flow (see
// DeliberationAction) — attach/replace freely until filed, at which point
// the case moves to DECIDED and RecordOutcomeAction takes over.
function RecommendationFilingAction({ caseDetail, user, onDone }) {
  const { submit, submitting, error } = useActionForm("investigation-recommendation", caseDetail.id, onDone);
  const recommendationDoc = (caseDetail.documents || []).find((d) => d.docType === "RECOMMENDATION");

  return (
    <ActionCard
      title="File recommendation"
      submitLabel="File recommendation"
      submitting={submitting}
      error={error}
      disabled={!recommendationDoc}
      onSubmit={(e) => {
        e.preventDefault();
        submit({});
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Recommendation document</label>
        {recommendationDoc ? (
          <DeliberationReportRow caseId={caseDetail.id} doc={recommendationDoc} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            No recommendation document attached yet.
          </p>
        )}
        <UploadControl
          caseId={caseDetail.id}
          onDone={onDone}
          docType="RECOMMENDATION"
          maxMb={50}
          accept="image/*,video/*,audio/*,application/pdf"
          label={recommendationDoc ? "Replace the recommendation document" : "Attach the recommendation document"}
          submitLabel={recommendationDoc ? "Replace recommendation" : "Upload recommendation"}
        />
      </div>
    </ActionCard>
  );
}

// Formal Investigation pathway, stage 2 of 2: record the outcome once it
// arrives from the external deciding body. Only reachable once the
// recommendation has already been filed (status DECIDED) — the document is
// shown read-only here, not removable (removal only makes sense from the
// filing stage above).
function RecordOutcomeAction({ caseDetail, onDone }) {
  const [outcome, setOutcome] = useState("LIABLE");
  const [rationale, setRationale] = useState("");
  const [penalty, setPenalty] = useState("");
  const { submit, submitting, error } = useActionForm("investigation-outcome", caseDetail.id, onDone);
  const recommendationDoc = (caseDetail.documents || []).find((d) => d.docType === "RECOMMENDATION");

  return (
    <ActionCard
      title="Record outcome"
      submitLabel="Submit outcome"
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        submit({ outcome, rationale, penalty: penalty || undefined });
      }}
    >
      {recommendationDoc && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Recommendation document</label>
          <RecommendationDocLink caseId={caseDetail.id} doc={recommendationDoc} />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Outcome</label>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="LIABLE">Liable</option>
          <option value="NOT_LIABLE">Not Liable</option>
        </select>
      </div>
      <textarea
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={3}
        placeholder="Rationale"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <input
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Penalty (optional)"
        value={penalty}
        onChange={(e) => setPenalty(e.target.value)}
      />
    </ActionCard>
  );
}

function CaseActions({ caseDetail, user, onDone }) {
  const viewer = viewerOf(caseDetail, user);
  const actions = [];

  if (user.role === "SECRETARIAT") {
    const awaitingReview = (caseDetail.documents || []).filter(
      (d) => REVIEWABLE_DOC_LABELS[d.docType] && d.reviewStatus === "PENDING"
    );
    if (awaitingReview.length > 0) {
      actions.push(
        <DocumentReviewAction
          key="document-review"
          caseDetail={caseDetail}
          documents={awaitingReview}
          onDone={onDone}
        />
      );
    }
  }

  if (
    user.role === "SECRETARIAT" &&
    (caseDetail.status === "SUBMITTED" || caseDetail.status === "RETURNED_FOR_CORRECTION")
  ) {
    // One card per named respondent: each is matched to an account separately.
    const rows = caseDetail.respondents?.length ? caseDetail.respondents : [null];
    rows.forEach((row, i) => {
      actions.push(
        <ConfirmRespondentAction
          key={`confirm-respondent-${row?.id ?? i}`}
          caseDetail={caseDetail}
          row={row}
          many={rows.length > 1}
          index={i}
          onDone={onDone}
        />
      );
    });
  }
  if (user.role === "SECRETARIAT" && caseDetail.status === "SUBMITTED") {
    const complaintApproved = (caseDetail.documents || []).some(
      (d) => d.docType === "COMPLAINT" && d.reviewStatus === "APPROVED"
    );
    const complaintFiled = (caseDetail.documents || []).some((d) => d.docType === "COMPLAINT");
    // An anonymous complaint is screened against Section 12 first, and has no
    // notarized copy to wait for.
    if (caseDetail.isAnonymous) {
      actions.push(<AnonymousScreeningAction key="screening" caseDetail={caseDetail} onDone={onDone} />);
    }
    if (complaintApproved || caseDetail.isAnonymous) {
      actions.push(<VerifyAction key="verify" caseDetail={caseDetail} onDone={onDone} />);
    } else if (!complaintFiled) {
      actions.push(
        <div
          key="awaiting-complaint"
          className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600"
        >
          <p className="font-medium text-neutral-800">Waiting on the notarized complaint</p>
          <p className="mt-1">
            The complainant has not filed it yet. Once they do, you approve it here and the case can
            be verified.
          </p>
        </div>
      );
    }
  }
  // A returned order leaves the case at Show-Cause Pending Approval, so the
  // drafting card comes back for the revision, but not while the Chairperson is
  // still holding one.
  const orderWithChairperson = (caseDetail.showCauseOrders || []).some(
    (o) => o.status === "PENDING_APPROVAL"
  );
  if (
    user.role === "SECRETARIAT" &&
    (caseDetail.status === "VERIFIED" ||
      (caseDetail.status === "SHOW_CAUSE_PENDING_APPROVAL" && !orderWithChairperson))
  ) {
    actions.push(
      <ShowCauseAction
        key="show-cause"
        caseDetail={caseDetail}
        caseId={caseDetail.id}
        user={user}
        onDone={onDone}
      />
    );
  }
  if (user.role === "SECRETARIAT" && caseDetail.status === "SHOW_CAUSE_APPROVED") {
    const approvedOrder = (caseDetail.showCauseOrders || []).find((o) => o.status === "APPROVED");
    if (approvedOrder) {
      actions.push(
        <ShowCauseServeAction
          key="show-cause-serve"
          caseDetail={caseDetail}
          caseId={caseDetail.id}
          order={approvedOrder}
          onDone={onDone}
        />
      );
    }
  }
  if (user.role === "CHAIRPERSON" && caseDetail.status === "SHOW_CAUSE_PENDING_APPROVAL") {
    const pendingOrder = (caseDetail.showCauseOrders || []).find((o) => o.status === "PENDING_APPROVAL");
    if (pendingOrder) {
      actions.push(
        <ShowCauseReviewAction key="show-cause-review" caseId={caseDetail.id} order={pendingOrder} onDone={onDone} />
      );
    }
  }
  // The respondent's 5-day response window (see deadlineService.js). Once it
  // lapses, the respondent can no longer answer — the Secretariat instead
  // proceeds with the case based on the available records.
  const responseDeadlineLapsed = (caseDetail.deadlines || [])
    .filter((d) => d.stage === "RESPONDENT RESPONSE")
    .some(
      (d) => d.status !== "MET" && (d.status === "OVERDUE" || new Date(d.dueAt) < new Date())
    );

  if (viewer.isRespondent && caseDetail.status === "SHOW_CAUSE_ISSUED") {
    actions.push(
      responseDeadlineLapsed ? (
        <ResponseWindowLapsedNotice key="response-lapsed" />
      ) : (
        <AnswerAction key="answer" caseDetail={caseDetail} onDone={onDone} />
      )
    );
  }
  if (user.role === "SECRETARIAT" && caseDetail.status === "SHOW_CAUSE_ISSUED" && responseDeadlineLapsed) {
    actions.push(
      <ProceedWithoutResponseAction key="proceed-without-response" caseId={caseDetail.id} onDone={onDone} />
    );
  }
  // The Secretariat acts on this in the Documents tab: approving the response
  // document is what accepts the filing and moves the case on.
  if (caseDetail.status === "ANSWER_UNDER_REVIEW") {
    if (viewer.isRespondent) {
      const answer = (caseDetail.respondentAnswers || []).filter((a) => a.stage === "SHOW_CAUSE").at(-1);
      actions.push(<AnswerUnderReviewNotice key="answer-under-review" caseDetail={caseDetail} />);
      if (answer?.returnedAt) {
        actions.push(<AnswerAction key="answer-refile" caseDetail={caseDetail} onDone={onDone} refile />);
      }
    }
  }
  // Prima facie stage: the Secretariat first sets the Committee meeting; only
  // once a slot is confirmed can the Committee vote (and then score).
  const meetingPending = isAwaitingPrimaFacieMeeting(caseDetail);
  if (
    (user.role === "SECRETARIAT" || user.role === "COMMITTEE") &&
    caseDetail.status === "ANSWER_SUBMITTED" &&
    meetingPending
  ) {
    actions.push(
      <CaseSchedulingPanel key="prima-facie-meeting" caseDetail={caseDetail} user={user} onDone={onDone} />
    );
  }
  if (
    (user.role === "COMMITTEE" || user.role === "CHAIRPERSON") &&
    caseDetail.status === "ANSWER_SUBMITTED" &&
    !meetingPending
  ) {
    actions.push(
      <PrimaFacieVoteAction
        key="prima-facie-vote"
        caseDetail={caseDetail}
        user={user}
        onDone={onDone}
      />
    );
  }
  if (user.role === "SECRETARIAT" && caseDetail.status === "ANSWER_SUBMITTED" && !meetingPending) {
    actions.push(
      <PrimaFacieAction key="prima-facie" caseDetail={caseDetail} onDone={onDone} />
    );
  }
  // The charge: CODI drafts it, the Disciplining Authority approves or sends
  // it back, then either of them files the signed copy — which issues it.
  const latestCharge = (caseDetail.formalCharges || []).at(-1);
  if (user.role === "SECRETARIAT" && caseDetail.status === "PRIMA_FACIE_FOUND") {
    actions.push(
      <FormalChargeAction
        key="formal-charge"
        caseDetail={caseDetail}
        user={user}
        returnedCharge={latestCharge?.status === "RETURNED" ? latestCharge : null}
        onDone={onDone}
      />
    );
  }
  if (caseDetail.status === "FORMAL_CHARGE_PENDING_APPROVAL" && latestCharge) {
    if (
      (viewer.isAuthority || user.role === "SECRETARIAT") &&
      latestCharge.status === "PENDING_APPROVAL"
    ) {
      actions.push(
        <AuthorityChargeReview
          key="charge-review"
          caseDetail={caseDetail}
          charge={latestCharge}
          user={user}
          onDone={onDone}
        />
      );
    }
    if ((viewer.isAuthority || user.role === "SECRETARIAT") && latestCharge.status === "APPROVED") {
      actions.push(
        <SignedChargeAction
          key="signed-charge"
          caseDetail={caseDetail}
          user={user}
          onDone={onDone}
        />
      );
    }
  }

  // Once the formal charge is sent, the respondent submits a formal written
  // answer plus a pathway choice, and the complainant independently picks a
  // pathway. If they disagree, the Secretariat recommends the final one.
  // The card stays up until the answer is actually verified — not merely until
  // it is first submitted. Otherwise returning an answer as NOT_NOTARIZED left
  // the respondent with an empty sidebar and no way to re-file.
  const answerDoc = (caseDetail.documents || []).find((d) => d.docType === "RESPONDENT_ANSWER");
  // A respondent the Committee found no prima facie case against has nothing
  // more to do on the case.
  const clearedRespondent =
    viewer.isRespondent &&
    (caseDetail.respondents || []).find((r) => r.userId === user.id)?.primaFacieFound === false;
  if (clearedRespondent && caseDetail.status !== "DISMISSED") {
    actions.push(
      <div
        key="cleared"
        className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600"
      >
        <p className="font-medium text-neutral-800">No case against you</p>
        <p className="mt-1">
          The Committee found no prima facie case against you. The case does not proceed against you,
          so there is nothing more for you to file.
        </p>
      </div>
    );
  }
  if (
    viewer.isRespondent &&
    !clearedRespondent &&
    caseDetail.status === "FORMAL_CHARGE_ISSUED" &&
    answerDoc?.reviewStatus !== "APPROVED"
  ) {
    actions.push(
      <FormalAnswerAction key="formal-answer" caseDetail={caseDetail} onDone={onDone} />
    );
  }
  // An anonymous case has no pathway to choose: it proceeds by the
  // respondent's position paper only.
  if (
    viewer.isComplainant &&
    !caseDetail.isAnonymous &&
    caseDetail.status === "FORMAL_CHARGE_ISSUED" &&
    !caseDetail.complainantPathwayChoice
  ) {
    actions.push(<ComplainantPathwayAction key="pathway-choice" caseId={caseDetail.id} onDone={onDone} />);
  }
  // The Secretariat decides the pathway, and may change it while the case is
  // still awaiting one. Scheduling a hearing moves the case past this status,
  // and the route refuses from there — by then hearings and deliberations
  // depend on the pathway chosen.
  if (user.role === "SECRETARIAT" && !caseDetail.isAnonymous && caseDetail.status === "FORMAL_CHARGE_ISSUED") {
    actions.push(<SetPathwayAction key="pathway-recommendation" caseDetail={caseDetail} onDone={onDone} />);
  }

  // Formal Investigation's hearing scheduling, guidance notes and ending the
  // investigation live in FormalInvestigationHearings (the Pathway tab);
  // recording the recommendation + outcome lives in
  // RecommendationOutcomeSection (its own tab). Both are visible to every
  // role, not just Secretariat, unlike the rest of this sidebar.
  if (
    (user.role === "COMMITTEE" || user.role === "SECRETARIAT") &&
    caseDetail.status === "FORMAL_CHARGE_ISSUED" &&
    caseDetail.finalPathway === "POSITION_PAPER"
  ) {
    // Keyed on the both-papers/classification signals so the auto-drafted
    // report (see DeliberationAction) recomputes if either becomes available
    // after this action was first rendered, instead of the form staying
    // frozen with whatever was true at initial mount.
    const { bothIn } = positionPaperStatus(caseDetail);
    actions.push(
      <DeliberationAction
        key={`deliberation-${bothIn}-${caseDetail.offenseClassification}`}
        caseDetail={caseDetail}
        user={user}
        onDone={onDone}
      />
    );
  }
  // The Disciplining Authority decides the case; the Secretariat records it
  // with them, so the form is open to both.
  if (
    (user.role === "SECRETARIAT" || viewer.isAuthority) &&
    caseDetail.status === "DELIBERATION"
  ) {
    actions.push(<DecisionAction key="decision" caseId={caseDetail.id} onDone={onDone} />);
  }

  // Committee may dismiss a case whose 3-day notarized-complaint window lapsed
  // without a notarized document on record (human decision, not automatic).
  const notarizationLapsed = (caseDetail.deadlines || []).some(
    (d) => d.stage.includes("NOTARIZED COMPLAINT") && d.status === "OVERDUE"
  );
  const hasNotarizedComplaint = (caseDetail.documents || []).some(
    (doc) => doc.docType === "COMPLAINT" && doc.reviewStatus === "APPROVED"
  );
  if (
    user.role === "COMMITTEE" &&
    !TERMINAL_STATUSES.has(caseDetail.status) &&
    notarizationLapsed &&
    !hasNotarizedComplaint
  ) {
    actions.push(
      <DismissNoncomplianceAction key="dismiss-noncompliance" caseId={caseDetail.id} onDone={onDone} />
    );
  }

  // The Secretariat can dismiss any open case, at any stage.
  if (user.role === "SECRETARIAT" && !TERMINAL_STATUSES.has(caseDetail.status)) {
    actions.push(<DismissCaseAction key="dismiss-case" caseId={caseDetail.id} onDone={onDone} />);
  }
  // A closed case can be reopened by the Secretariat — unless it was dismissed
  // with prejudice, which is final.
  if (user.role === "SECRETARIAT" && TERMINAL_STATUSES.has(caseDetail.status)) {
    actions.push(<ReopenCaseAction key="reopen-case" caseDetail={caseDetail} onDone={onDone} />);
  }

  // Position Paper pathway: each party files a written paper instead of
  // testifying at a hearing. The upload lives in the Documents tab, so without
  // this the sidebar would tell them "no action is required" while the case is
  // in fact waiting on them.
  const myPaper = (caseDetail.documents || [])
    .filter((d) => d.docType === "POSITION_PAPER" && d.uploadedById === user.id)
    .at(-1);
  const owesPositionPaper =
    caseDetail.finalPathway === "POSITION_PAPER" &&
    caseDetail.status === "FORMAL_CHARGE_ISSUED" &&
    viewer.isParty &&
    !(viewer.isComplainant && caseDetail.isAnonymous) &&
    !clearedRespondent &&
    myPaper?.reviewStatus !== "APPROVED";
  if (owesPositionPaper) {
    actions.push(
      <PositionPaperAction key="position-paper" caseDetail={caseDetail} paper={myPaper} onDone={onDone} />
    );
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">
        No action is required from you at this stage. You'll be notified when the case
        progresses.
      </div>
    );
  }

  return <>{actions}</>;
}

// hideSubmit: for cards that are still the right place to show state and
// offer an upload, but where the submit action itself is already done (e.g.
// a filed answer awaiting notarization review).
function ActionCard({
  title,
  children,
  onSubmit,
  submitting,
  error,
  submitLabel,
  disabled = false,
  hideSubmit = false,
  // Rows [{ label, value }] to read back before sending. When given, the
  // button first opens a review of them, from which the filer can go back to
  // edit or confirm and submit.
  review = null,
  // Optional element shown at the top-right of the header, next to the
  // title (e.g. a vote-progress badge). Hidden during the review step.
  headerRight = null,
}) {
  const [reviewing, setReviewing] = useState(false);
  const inReview = !!review && reviewing;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-xl border border-maroon/30 bg-white p-8 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-medium text-maroon">{inReview ? "Review before you submit" : title}</h3>
        {!inReview && headerRight}
      </div>
      {inReview ? <ReviewSummary rows={review} /> : children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!hideSubmit && inReview && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setReviewing(false)}
            disabled={submitting}
            className="flex-1 rounded-md border border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="submit"
            disabled={submitting || disabled}
            className="flex-1 rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Confirm and submit"}
          </button>
        </div>
      )}
      {!hideSubmit && !inReview && review && (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={disabled}
          className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
        >
          Review before submitting
        </button>
      )}
      {!hideSubmit && !review && (
        <button
          type="submit"
          disabled={submitting || disabled}
          className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
        >
          {submitting ? "Submitting…" : submitLabel}
        </button>
      )}
    </form>
  );
}

function useActionForm(endpoint, caseId, onDone) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(payload) {
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/${endpoint}`, payload);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}

// The complainant describes a person; the Secretariat says which BulSU
// account that is. Nothing else about the case can proceed until they do —
// the respondent needs an account to read the order and answer it.
function ConfirmRespondentAction({ caseDetail, row, many, index, onDone }) {
  // The respondent this card is about: a CaseRespondent row, or (for a case
  // loaded without rows) the single respondent mirrored on the case.
  const who = row || {
    claimedName: caseDetail.claimedRespondentName,
    claimedType: caseDetail.claimedRespondentType,
    claimedCollege: caseDetail.claimedRespondentCollege,
    user: caseDetail.respondentUser,
    confirmedAt: caseDetail.respondentConfirmedAt,
  };
  const suggested = who.user;
  const [picked, setPicked] = useState(
    suggested
      ? {
          directoryId: suggested.directoryId,
          fullName: suggested.fullName,
          idNumber: suggested.directoryId,
          type: suggested.userType,
          college: suggested.department,
          email: suggested.email,
        }
      : null
  );
  const { submit, submitting, error } = useActionForm("confirm-respondent", caseDetail.id, onDone);
  const confirmed = Boolean(who.confirmedAt);
  const label = many ? `respondent ${index + 1}` : "the respondent";

  return (
    <ActionCard
      title={confirmed ? `Change the confirmed ${many ? label : "respondent"}` : `Confirm who ${label} is`}
      submitLabel="Confirm"
      // Once confirmed, there is nothing to submit until someone else is picked.
      hideSubmit={confirmed && picked?.directoryId === who.user?.directoryId}
      submitting={submitting}
      error={error}
      disabled={!picked}
      onSubmit={(e) => {
        e.preventDefault();
        if (picked) submit({ respondentDirectoryId: picked.directoryId, respondentRowId: row?.id });
      }}
    >
      <div className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
        <p className="font-medium text-neutral-700">The complainant named:</p>
        <p className="mt-1 break-words text-sm text-neutral-800">{who.claimedName || "—"}</p>
        <p>
          {RESPONDENT_TYPE_LABELS[who.claimedType] || "—"}
          {who.claimedCollege ? ` · ${who.claimedCollege}` : ""}
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        {confirmed
          ? "This case is already assigned to the account below. Pick a different person only if it was matched to the wrong one."
          : suggested
          ? "The complainant pointed at this account. Check it against the description above, then confirm — or search for someone else."
          : "Find this person in the BulSU directory. The complaint can't be verified until the case is assigned to a real account."}
      </p>
      <RespondentPicker value={picked} onChange={setPicked} disabled={submitting} />
    </ActionCard>
  );
}

function VerifyAction({ caseDetail, onDone }) {
  const [note, setNote] = useState("");
  const { submit, submitting, error } = useActionForm("verify", caseDetail.id, onDone);
  // An anonymous complaint has no notarized copy, and can't go back to its
  // complainant: it is verified as filed, or dismissed.
  const anonymous = !!caseDetail.isAnonymous;
  const hasNotarizedComplaint =
    anonymous ||
    (caseDetail.documents || []).some((d) => d.docType === "COMPLAINT" && d.reviewStatus === "APPROVED");
  const respondentConfirmed = caseDetail.respondents?.length
    ? caseDetail.respondents.every((r) => r.confirmedAt && r.userId)
    : Boolean(caseDetail.respondentConfirmedAt && caseDetail.respondentId);

  return (
    <ActionCard
      title="Verify complaint"
      submitLabel="Verify as compliant"
      submitting={submitting}
      disabled={!hasNotarizedComplaint || !respondentConfirmed}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        submit({ approved: true, note });
      }}
    >
      {!respondentConfirmed && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Confirm who {caseDetail.respondents?.length > 1 ? "each respondent is" : "the respondent is"} — above — before
          verifying. The case can't be assigned to someone who has no BulSU account on record.
        </p>
      )}
      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={13}
        placeholder="Verification note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {anonymous ? (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          This is an anonymous complaint (CODI vs. the respondent), so it can't be returned for
          correction. Verify it as filed, or close it under{" "}
          <span className="font-medium">Screen under Section 12</span> above if it meets none of the conditions.
        </p>
      ) : (
      <button
        type="button"
        onClick={() => submit({ approved: false, note: note || "Incomplete requirements" })}
        className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
      >
        Return for correction
      </button>
      )}
    </ActionCard>
  );
}

// The Section 12 conditions an anonymous filer ticked, one per line.
function GroundList({ grounds }) {
  if (grounds.length === 1) return ANONYMOUS_GROUND_LABELS[grounds[0]] || grounds[0];
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {grounds.map((g) => (
        <li key={g}>{ANONYMOUS_GROUND_LABELS[g] || g}</li>
      ))}
    </ul>
  );
}

// The Secretariat's screening of an anonymous complaint under Section 12 of the
// 2025 RACCS: what the filer claimed, how their earlier anonymous complaints
// went (a count, never a name), other recent reports about the same person,
// and closing it as not entertained when it meets none of the conditions.
function AnonymousScreeningAction({ caseDetail, onDone }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { submit, submitting, error } = useActionForm("not-entertained", caseDetail.id, onDone);
  const screening = caseDetail.anonymousScreening || { filerNotEntertained: 0, related: [] };

  return (
    <ActionCard title="Screen under Section 12" hideSubmit error={error} onSubmit={(e) => e.preventDefault()}>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase text-neutral-400">
            Condition{caseDetail.anonymousGrounds?.length > 1 ? "s" : ""} the filer claims
          </dt>
          <dd className="text-neutral-700">
            {caseDetail.anonymousGrounds?.length > 0 ? (
              <GroundList grounds={caseDetail.anonymousGrounds} />
            ) : (
              "Not given (filed before screening began)"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-neutral-400">Filer's history</dt>
          <dd className={screening.filerNotEntertained > 0 ? "text-amber-800" : "text-neutral-700"}>
            {screening.filerNotEntertained === 0
              ? "None of this filer's other anonymous complaints were closed as not entertained in the last 90 days."
              : `${screening.filerNotEntertained} of this filer's other anonymous complaint${
                  screening.filerNotEntertained === 1 ? " was" : "s were"
                } closed as not entertained in the last 90 days.`}
          </dd>
        </div>
        {screening.related.length > 0 && (
          <div>
            <dt className="text-xs uppercase text-neutral-400">Possibly related reports</dt>
            <dd className="text-neutral-700">
              Filed by someone else about the same person in the last 30 days:{" "}
              {screening.related.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <Link to={`/cases/${r.id}`} className="font-medium text-maroon hover:underline">
                    {r.label}
                  </Link>
                </span>
              ))}
              . Read them together before deciding.
            </dd>
          </div>
        )}
      </dl>

      <p className="text-xs text-neutral-500">
        If it meets none of the Section 12 conditions, close it as not entertained. The respondent is never told.
        The filer gets your reason and can file it under their name instead. Three of these in 90 days pause the
        filer's anonymous filing for 60 days.
      </p>
      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={3}
        maxLength={RETURN_NOTE_MAX}
        placeholder="Why it is not entertained (sent to the filer)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setConfirming(false);
        }}
      />
      {confirming ? (
        <div className="space-y-2">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Close this complaint as not entertained? You can reopen it later if needed.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ reason: reason.trim() })}
              className="flex-1 rounded-md bg-neutral-800 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              {submitting ? "Closing…" : "Yes, not entertained"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!reason.trim()}
          onClick={() => setConfirming(true)}
          className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-800 hover:bg-neutral-800 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-700"
        >
          Not entertained
        </button>
      )}
    </ActionCard>
  );
}

function DismissCaseAction({ caseId, onDone }) {
  const [reason, setReason] = useState("");
  // Which kind the Secretariat has chosen and is being asked to be sure of.
  const [confirming, setConfirming] = useState(null); // "WITH" | "WITHOUT"
  const { submit, submitting, error } = useActionForm("dismiss", caseId, onDone);

  return (
    <ActionCard
      title="Dismiss case"
      hideSubmit
      error={error}
      onSubmit={(e) => e.preventDefault()}
    >
      <p className="text-sm text-neutral-600">
        Close this case now, whatever stage it is at. The reason is recorded and sent to the parties.
      </p>
      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={4}
        placeholder="Reason for dismissal (required)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setConfirming(null);
        }}
      />

      {confirming === null ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => setConfirming("WITHOUT")}
            className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
          >
            Dismiss without prejudice
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => setConfirming("WITH")}
            className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
          >
            Dismiss with prejudice
          </button>
          <p className="text-xs text-neutral-500">
            Without prejudice: the case can be reopened later. With prejudice: it is final and cannot
            be reopened.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-maroon/30 bg-maroon/[0.03] p-3">
          <p className="text-sm font-medium text-neutral-800">
            Dismiss this case {confirming === "WITH" ? "with" : "without"} prejudice?
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {confirming === "WITH"
              ? "Both parties will be told. This is final: the case can never be reopened."
              : "Both parties will be told. The Secretariat can reopen the case later."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ reason, prejudice: confirming })}
              className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
            >
              {submitting ? "Dismissing…" : "Yes, dismiss"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirming(null)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </ActionCard>
  );
}

// Reopening a closed case. Available for any closed case except one dismissed
// with prejudice, which is final.
function ReopenCaseAction({ caseDetail, onDone }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { submit, submitting, error } = useActionForm("reopen", caseDetail.id, onDone);
  const final = caseDetail.status === "DISMISSED" && caseDetail.dismissalType !== "WITHOUT_PREJUDICE";

  if (final) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">Dismissed with prejudice</p>
        <p className="mt-1">This case is final and cannot be reopened.</p>
      </div>
    );
  }

  return (
    <ActionCard title="Reopen case" hideSubmit error={error} onSubmit={(e) => e.preventDefault()}>
      <p className="text-sm text-neutral-600">
        Put this closed case back in progress. It returns to the stage it was at when it closed, and
        both parties are told.
      </p>
      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={4}
        placeholder="Reason for reopening (required)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setConfirming(false);
        }}
      />
      {!confirming ? (
        <button
          type="button"
          disabled={!reason.trim()}
          onClick={() => setConfirming(true)}
          className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          Reopen case
        </button>
      ) : (
        <div className="rounded-md border border-maroon/30 bg-maroon/[0.03] p-3">
          <p className="text-sm font-medium text-neutral-800">Reopen this case?</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {caseDetail.status === "RESOLVED"
              ? "The recorded decision is kept in the audit log and cleared, so the case can be decided again."
              : "Both parties will be told."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit({ reason })}
              className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
            >
              {submitting ? "Reopening…" : "Yes, reopen"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirming(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </ActionCard>
  );
}

function DismissNoncomplianceAction({ caseId, onDone }) {
  const { submit, submitting, error } = useActionForm("dismiss-noncompliance", caseId, onDone);

  return (
    <ActionCard
      title="Dismiss for non-compliance"
      submitLabel="Dismiss case"
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        if (
          window.confirm(
            "Dismiss this case? The complainant's 3-day window to submit the notarized complaint has lapsed. This cannot be undone."
          )
        ) {
          submit({});
        }
      }}
    >
      <p className="text-sm text-neutral-600">
        The complainant's 3-day window to submit the notarized complaint has lapsed with no
        notarized document on record. As a Committee member, you may dismiss this case for
        non-compliance.
      </p>
    </ActionCard>
  );
}

function ShowCauseAction({ caseDetail, caseId, user, onDone }) {
  const { submit, submitting, error } = useActionForm("show-cause", caseId, onDone);
  // The signed order is the record — the server won't send it to the
  // Chairperson until the document is on file, so submit stays disabled until
  // then. Only an unattached document counts: one already tied to an earlier
  // attempt belongs to that attempt (see the returned-for-revision case).
  const orderDoc = (caseDetail.documents || []).find(
    (d) => d.docType === "SHOW_CAUSE_ORDER" && !isAttachedShowCauseDoc(caseDetail, d)
  );
  const returned = (caseDetail.showCauseOrders || []).filter((o) => o.status === "RETURNED").at(-1);

  return (
    <ActionCard
      title={returned ? "Revise the show-cause order" : "Draft show-cause order"}
      submitLabel="Send to Chairperson for verification"
      submitting={submitting}
      error={error}
      disabled={!orderDoc}
      onSubmit={(e) => {
        e.preventDefault();
        submit({});
      }}
    >
      {returned && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">
            The Chairperson sent the last order back. Revise it and send it up again.
          </p>
          {returned.returnNote && (
            <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
              {returned.returnNote}
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        Download the generated template as a Word file, edit and sign it outside the app, then
        attach the finished order here. It is only issued to the respondent once the Chairperson
        approves it.
      </p>

      <button
        type="button"
        onClick={() =>
          downloadWordFile(
            `Show-Cause-Order-${caseLabel(caseDetail)}.doc`,
            buildShowCauseTemplate(caseDetail)
          )
        }
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-maroon/30 bg-maroon/5 px-3 py-1.5 text-xs font-medium text-maroon hover:bg-maroon/10"
      >
        Download template as Word
      </button>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Show-cause order</label>
        {orderDoc ? (
          <DeliberationReportRow caseId={caseDetail.id} doc={orderDoc} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            No show-cause order attached yet.
          </p>
        )}
        <UploadControl
          caseId={caseDetail.id}
          onDone={onDone}
          docType="SHOW_CAUSE_ORDER"
          maxMb={50}
          accept="image/*,application/pdf,.doc,.docx"
          label={orderDoc ? "Replace the show-cause order" : "Attach the signed show-cause order"}
          submitLabel={orderDoc ? "Replace order" : "Upload order"}
        />
      </div>
    </ActionCard>
  );
}

// Approval clears the order; this is the step that actually reaches the
// respondent. It opens their view of the case and starts their response
// window, so it is deliberately a separate, explicit act by the Secretariat.
function ShowCauseServeAction({ caseDetail, caseId, order, onDone }) {
  const { submit, submitting, error } = useActionForm(`show-cause/${order.id}/serve`, caseId, onDone);
  const respondent = caseDetail.respondentUser;

  return (
    <ActionCard
      title="Serve the show-cause order"
      submitLabel={submitting ? "Serving…" : "Serve on the respondent"}
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        submit({});
      }}
    >
      <p className="text-xs text-neutral-500">
        The Chairperson approved this order
        {order.reviewedAt ? ` on ${new Date(order.reviewedAt).toLocaleDateString()}` : ""}. Serving it
        notifies {respondent?.fullName || "the respondent"}, opens the case filings to them, and starts
        their response window from today.
      </p>
      {order.document ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <RecommendationDocLink caseId={caseId} doc={order.document} />
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="whitespace-pre-wrap font-mono text-xs text-neutral-700">{order.content}</p>
        </div>
      )}
    </ActionCard>
  );
}

function ShowCauseReviewAction({ caseId, order, onDone }) {
  const [note, setNote] = useState("");
  const approveForm = useActionForm(`show-cause/${order.id}/approve`, caseId, onDone);
  const returnForm = useActionForm(`show-cause/${order.id}/return`, caseId, onDone);

  return (
    <ActionCard
      title="Review show-cause order"
      submitLabel={approveForm.submitting ? "Approving…" : "Approve the order"}
      submitting={approveForm.submitting}
      error={approveForm.error || returnForm.error}
      onSubmit={(e) => {
        e.preventDefault();
        approveForm.submit({});
      }}
    >
      <p className="text-xs text-neutral-500">
        Drafted by the Secretariat. Open the signed order below, then approve it — the Secretariat
        serves it on the respondent — or return it for revision.
      </p>
      {/* Orders drafted before the order became a file still carry their text. */}
      {order.document ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <RecommendationDocLink caseId={caseId} doc={order.document} />
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="whitespace-pre-wrap font-mono text-xs text-neutral-700">{order.content}</p>
        </div>
      )}
      <div>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={13}
          maxLength={RETURN_NOTE_MAX}
          placeholder="Note for the Secretariat (required if returning for revision)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-neutral-400">
          {note.length.toLocaleString()} / {RETURN_NOTE_MAX.toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={() => note.trim() && returnForm.submit({ note: note.trim() })}
        disabled={returnForm.submitting || approveForm.submitting}
        className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
      >
        {returnForm.submitting ? "Returning…" : "Return for revision"}
      </button>
    </ActionCard>
  );
}

// What is inside a filing under review: its pages and size, and — when several
// files were joined into one PDF — which files, in order. The originals are not
// kept apart, so this is how the reviewer knows what they are approving.
function DocumentContents({ doc }) {
  const names = (doc.sourceFileNames || "").split("\n").filter(Boolean);
  const size =
    doc.fileSize == null
      ? null
      : doc.fileSize < 1024 * 1024
      ? `${Math.max(1, Math.round(doc.fileSize / 1024))} KB`
      : `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB`;
  const facts = [doc.pageCount ? `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}` : null, size].filter(Boolean);
  if (facts.length === 0 && names.length === 0) return null;
  return (
    <div className="mt-1 text-xs text-neutral-500">
      {facts.join(" · ")}
      {names.length > 1 && (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium text-maroon hover:underline">
            Joined from {names.length} files
          </summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            {names.map((name, i) => (
              <li key={`${name}-${i}`} className="break-all">
                {name}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

// Every filing waiting on the Secretariat, in one place: open it, then either
// approve it onto the case record or send it back saying what is wrong. A
// document is not attached until it is approved, so this is the step that
// decides whether the other side ever sees it.
function DocumentReviewAction({ caseDetail, documents, onDone }) {
  const [sendingBackId, setSendingBackId] = useState(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function review(doc, status, reason) {
    setBusyId(doc.id);
    setError("");
    try {
      await api.patch(`/cases/${caseDetail.id}/documents/${doc.id}/review`, {
        status,
        note: reason,
      });
      setSendingBackId(null);
      setNote("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update this document");
    } finally {
      setBusyId(null);
    }
  }

  function filerOf(doc) {
    if (doc.uploadedById === caseDetail.complainantId) return "Complainant";
    const row = (caseDetail.respondents || []).find((r) => r.userId === doc.uploadedById);
    if (row) return (caseDetail.respondents || []).length > 1 ? `Respondent (${rowName(row)})` : "Respondent";
    if (doc.uploadedById === caseDetail.respondentId) return "Respondent";
    return null;
  }

  return (
    <ActionCard
      title={documents.length > 1 ? `Review ${documents.length} documents` : "Review this document"}
      hideSubmit
      error={error}
      onSubmit={(e) => e.preventDefault()}
    >
      <p className="text-xs text-neutral-500">
        Open each document and approve it, or send it back saying what is wrong. Nothing is attached
        to the case — or visible to the other party — until you approve it.
      </p>

      <ul className="space-y-3">
        {documents.map((doc) => (
          <li key={doc.id} className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {REVIEWABLE_DOC_LABELS[doc.docType]}
            </p>
            <p className="mt-1 text-sm">
              <RecommendationDocLink caseId={caseDetail.id} doc={doc} />
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {[filerOf(doc), new Date(doc.uploadedAt).toLocaleDateString()].filter(Boolean).join(" · ")}
            </p>
            <DocumentContents doc={doc} />

            {sendingBackId === doc.id ? (
              <div className="mt-2 space-y-2">
                <div>
                  <textarea
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    rows={3}
                    maxLength={RETURN_NOTE_MAX}
                    placeholder="What is wrong with this document? The filer reads this."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <p className="mt-1 text-right text-xs text-neutral-400">
                    {note.length.toLocaleString()} / {RETURN_NOTE_MAX.toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === doc.id || !note.trim()}
                    onClick={() => review(doc, "RETURNED", note.trim())}
                    className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
                  >
                    {busyId === doc.id ? "Sending back…" : "Send it back"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() => {
                      setSendingBackId(null);
                      setNote("");
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === doc.id}
                  onClick={() => review(doc, "APPROVED")}
                  className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
                >
                  {busyId === doc.id ? "Approving…" : "Approve & attach"}
                </button>
                <button
                  type="button"
                  disabled={busyId === doc.id}
                  onClick={() => {
                    setSendingBackId(doc.id);
                    setNote("");
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
                >
                  Send back…
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </ActionCard>
  );
}

// The party's position paper: their substitute for testifying at a hearing.
// Notarized like every other filing a party makes, so it is uploaded here,
// declared notarized, and confirmed by the Secretariat before it counts as
// filed — the Committee deliberates on confirmed papers only.

function PositionPaperAction({ caseDetail, paper, onDone }) {
  const [files, setFiles] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const hasFiles = files.length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returned = paper?.reviewStatus === "RETURNED";
  const awaitingCheck = paper?.reviewStatus === "PENDING";
  // Submitted and with CODI: it is out of their hands until it comes back.
  const locked = !!paper && !returned;


  async function submit(e) {
    e.preventDefault();
    if (!hasFiles || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      appendNotarizedFiles(formData, files);
      formData.append("docType", "POSITION_PAPER");
      await api.post(`/cases/${caseDetail.id}/documents`, formData);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not upload your position paper");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionCard
      title={returned ? "File a corrected position paper" : "Submit your position paper"}
      submitLabel={busy ? "Submitting…" : "Submit position paper"}
      submitting={busy}
      disabled={!hasFiles || !confirmed}
      hideSubmit={locked}
      error={error}
      onSubmit={submit}
    >
      <p className="text-xs text-neutral-500">
        This case is proceeding under the Position Paper pathway, so there are no hearings — your
        written paper is how you put your side of the case. It must be{" "}
        <span className="font-medium text-maroon">notarized</span>: prepare and notarize it
        outside the system, then upload a scanned copy or clear photo here. JPG, PNG, WebP or PDF,
        up to {NOTARIZED_MAX_FILES} files, {NOTARIZED_MAX_MB} MB each.
      </p>

      {returned && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">
            This document was returned by the Secretariat. Submit a corrected one to replace it.
          </p>
          {paper?.reviewNote && (
            <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
              {paper.reviewNote}
            </p>
          )}
        </div>
      )}
      {awaitingCheck && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          Filed. CODI is reviewing it — nothing further is needed from you unless they send it
          back.
        </p>
      )}
      {paper && !hasFiles && (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          On file: <span className="font-medium">{paper.fileName}</span>
        </p>
      )}

      {!locked && (
        <NotarizedFilePicker files={files} onChange={setFiles} confirmed={confirmed} onConfirmedChange={setConfirmed} disabled={busy} />
      )}
    </ActionCard>
  );
}

// The response to a show-cause order is a notarized document: the respondent
// files the signed, notarized copy itself rather than typing an answer here.
// They declare on upload that it is notarized; the Secretariat confirms or
// returns that from the Documents tab.

function AnswerAction({ caseDetail, onDone, refile = false }) {
  const [files, setFiles] = useState([]);
  const hasFiles = files.length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const existing = (caseDetail.documents || []).find((d) => d.docType === "SHOW_CAUSE_ANSWER");
  // Already with CODI: no picker, since a replacement would be refused.
  const locked = !!existing && existing.reviewStatus !== "RETURNED" && !refile;
  // The order they are answering, to hand at the point of answering it rather
  // than only further up the page.
  const servedOrder = (caseDetail.showCauseOrders || []).filter((o) => o.status === "SERVED").at(-1);
  const orderDoc =
    servedOrder?.document ||
    (caseDetail.documents || []).find((d) => d.id === servedOrder?.documentId);


  async function submit(e) {
    e.preventDefault();
    if (!hasFiles && (refile || !existing)) return;
    setBusy(true);
    setError("");
    try {
      // Upload first, then record it as filed — the case route refuses a
      // submission with no document attached.
      if (hasFiles) {
        const formData = new FormData();
        appendNotarizedFiles(formData, files);
        formData.append("docType", "SHOW_CAUSE_ANSWER");
        await api.post(`/cases/${caseDetail.id}/documents`, formData);
      }
      // A replacement is the re-filing itself; only a first filing is recorded
      // through the answer route.
      if (!refile) await api.post(`/cases/${caseDetail.id}/answer`, {});
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ActionCard
        title={refile ? "File a corrected response" : "Submit your response"}
        submitLabel={busy ? "Submitting…" : refile ? "Submit corrected response" : "Submit response"}
        submitting={busy}
        disabled={!hasFiles && (refile || !existing)}
        review={[
          {
            label: "Filing",
            value: refile ? "Corrected response to the show-cause order" : "Response to the show-cause order",
          },
          {
            label: hasFiles && files.length > 1 ? "Documents" : "Document",
            value: hasFiles ? fileListValue(files) : existing?.fileName,
          },
        ]}
        hideSubmit={locked}
        error={error}
        onSubmit={submit}
      >
        <p className="text-xs text-neutral-500">
          Your response must be <span className="font-medium text-maroon">notarized</span>.
          Prepare and notarize it outside the system, then upload a scanned copy or clear photo here.
          JPG, PNG, WebP or PDF, up to {NOTARIZED_MAX_FILES} files, {NOTARIZED_MAX_MB} MB each.
        </p>
        {orderDoc && (
          <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            <span>Answering:</span>
            <RecommendationDocLink caseId={caseDetail.id} doc={orderDoc} />
            <span className="w-full text-neutral-500">
              Open the show-cause order to read what you are responding to.
            </span>
          </p>
        )}
        {locked ? (
          <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            Filed. CODI is reviewing it — nothing further is needed from you unless they send it
            back.
          </p>
        ) : (
          <NotarizedFilePicker files={files} onChange={setFiles} confirmable={false} disabled={busy} />
        )}
        {existing && !hasFiles && !refile && (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
            Attached: <span className="font-medium">{existing.fileName}</span>
          </p>
        )}
      </ActionCard>

      <p className="-mt-2 text-xs text-neutral-500">
        Evidence supporting your defense — photos, videos, recordings, screenshots — goes in the
        Documents tab, separately from your notarized response.
      </p>
    </>
  );
}


function AnswerUnderReviewNotice({ caseDetail }) {
  const answer = (caseDetail.respondentAnswers || []).filter((a) => a.stage === "SHOW_CAUSE").at(-1);
  const returned = !!answer?.returnedAt;

  return (
    <section
      className={`rounded-xl border bg-white p-5 ${
        returned ? "border-maroon ring-2 ring-maroon/20" : "border-neutral-200"
      }`}
    >
      <h3 className="text-sm font-medium text-neutral-800">
        {returned ? "Your response was returned" : "Your response is being checked"}
      </h3>
      {returned ? (
        <>
          <p className="mt-2 text-sm text-neutral-600">
            The Secretariat returned your response. File a corrected one below — the case waits
            until they accept it.
          </p>
          {answer.returnNote && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              “{answer.returnNote}”
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          The Secretariat is confirming that your response is notarized and answers the order. Once
          they accept it, the Committee considers the case. Nothing further is needed from you for
          now.
        </p>
      )}
    </section>
  );
}

function ResponseWindowLapsedNotice() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-600">
      <h3 className="mb-1 text-base font-medium text-neutral-800">Response window has lapsed</h3>
      <p>
        The 5-day window to respond to the show-cause order has passed, so you can no longer
        submit an answer here. The Secretariat will proceed with the case based on the available
        records.
      </p>
    </div>
  );
}

function ProceedWithoutResponseAction({ caseId, onDone }) {
  const { submit, submitting, error } = useActionForm("proceed-without-response", caseId, onDone);

  return (
    <ActionCard
      title="Respondent did not answer"
      submitLabel="Proceed based on available records"
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        if (
          window.confirm(
            "The respondent's 5-day response window has lapsed with no answer on record. Proceed with the case based on the available records? This cannot be undone."
          )
        ) {
          submit({});
        }
      }}
    >
      <p className="text-sm text-neutral-600">
        The respondent's 5-day window to answer the show-cause order has lapsed without a
        response. You may proceed with the case based on the available records — this advances
        the case to the Committee for prima facie evaluation, the same as if an answer had been
        received. You can attach supporting records (e.g. proof the respondent was served) below
        under Case documents.
      </p>
    </ActionCard>
  );
}

// One Committee member's vote on the prima facie question. Every member votes;
// the Secretariat confirms the majority (see PrimaFacieAction), so this records
// an opinion rather than moving the case on. A member may change their vote up
// until that confirmation — the server upserts on (case, voter).
// The prima facie question is decided at a Committee meeting. Until the
// Secretariat has confirmed its date, the case is waiting on scheduling.
function confirmedMeeting(caseDetail) {
  return (caseDetail.schedulingRounds || []).find((r) => r.status === "FINALIZED" && r.finalizedSlot);
}

function isAwaitingPrimaFacieMeeting(caseDetail) {
  return caseDetail.status === "ANSWER_SUBMITTED" && !confirmedMeeting(caseDetail);
}

// A Committee member's vote. Scoring the risk assessment follows it, on the
// Risk assessment tab — the vote card only points them there, rather than
// carrying its own copy of the form.
function PrimaFacieVoteAction({ caseDetail, user, onDone }) {
  // Each respondent is voted on — and scored — separately.
  const rows = visibleRespondentRows(caseDetail);
  const many = rows.length > 1;
  const open = (many ? rows : [rows[0] || null]).filter((row) => !row || row.primaFacieFound === null);
  // One tab per respondent still to be voted on; each form stays mounted so a
  // half-written rationale survives a switch.
  const [activeId, setActiveId] = useState(null);
  const current = open.find((r) => r?.id === activeId) || open[0];

  return (
    <>
      {many && open.length > 1 && (
        <RespondentTabs
          rows={open}
          activeId={current?.id}
          onChange={setActiveId}
          badge={(row) => {
            const voted = (caseDetail.primaFacieVotes || []).some(
              (v) => v.voterId === user.id && (v.respondentRowId ? v.respondentRowId === row.id : row.position === 0)
            );
            return voted ? <span className="text-xs font-normal text-green-700">✓ voted</span> : null;
          }}
        />
      )}
      {open.map((row) => {
        const view = respondentView(caseDetail, row);
        const myVote = (view.primaFacieVotes || []).find((v) => v.voterId === user.id);
        const myScore = latestAssessmentsByMember(view.riskAssessments).find(
          (a) => a.evaluatedById === user.id
        );
        return (
          <div key={row?.id ?? "only"} className={`space-y-3 ${row?.id === current?.id ? "" : "hidden"}`}>
            <PrimaFacieVoteStep
              caseDetail={view}
              row={row}
              respondentName={many ? respondentLabel(row) : null}
              myVote={myVote}
              onDone={onDone}
            />
            {myVote?.found && !myScore && (
              <p className="-mt-2 text-xs text-neutral-500">
                Next: vote on the offense level {many ? `for ${respondentLabel(row)} ` : ""}on the{" "}
                <span className="font-medium">Risk assessment</span> tab. The Secretariat cannot confirm
                the finding until{" "}
                {caseDetail.primaFacieVotesRequired == null
                  ? "every member who found a prima facie case has voted on it."
                  : "enough members who found a prima facie case have voted on it."}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function PrimaFacieVoteStep({ caseDetail, row, respondentName, myVote, onDone }) {
  const [rationale, setRationale] = useState(myVote?.rationale || "");
  const meeting = confirmedMeeting(caseDetail);
  // A "found" vote is followed by scoring the risk assessment, so once it is
  // saved the member is taken to that tab.
  const votedFound = useRef(false);
  const { submit, submitting, error } = useActionForm("prima-facie/vote", caseDetail.id, () => {
    onDone();
    if (votedFound.current) {
      focusRiskRespondent(row?.id);
      openCaseTab("risk");
    }
  });

  return (
    <ActionCard
      title={
        myVote
          ? `Change your prima facie vote${respondentName ? ` — ${respondentName}` : ""}`
          : respondentName
          ? `Is there a prima facie case against ${respondentName}?`
          : "Is there a prima facie case?"
      }
      submitLabel={myVote ? "Update vote: prima facie case found" : "Vote: prima facie case found"}
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        votedFound.current = true;
        submit({ found: true, rationale, respondentRowId: row?.id });
      }}
    >
      {meeting && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">
          Committee meeting confirmed for{" "}
          <strong>
            {new Date(meeting.finalizedSlot.startAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
          </strong>
          .
        </p>
      )}
      <p className="text-xs text-neutral-500">
        {myVote
          ? `You voted ${
              myVote.found === true
                ? "that a prima facie case exists"
                : myVote.found === null
                ? "to abstain"
                : "that there is no prima facie case"
            }. You can change it until the Secretariat confirms the finding.`
          : `Each Committee member votes. ${
              caseDetail.primaFacieVotesRequired == null
                ? "Once everyone has voted"
                : `Once ${caseDetail.primaFacieVotesRequired} vote${caseDetail.primaFacieVotesRequired === 1 ? " is" : "s are"} in`
            }, the Secretariat confirms the majority finding and the case moves on. You may abstain if you have a conflict of interest or feel unable to judge the matter.`}
      </p>
      <textarea
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={14}
        placeholder="Rationale for your vote (optional if you abstain)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          if (!rationale) return;
          if (
            myVote?.found &&
            !window.confirm(
              "Changing your vote to \u201cno prima facie case\u201d removes your offense-level vote, since a \u201cno\u201d vote needs none. Continue?"
            )
          ) {
            return;
          }
          votedFound.current = false;
          submit({ found: false, rationale, respondentRowId: row?.id });
        }}
        className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
      >
        {myVote ? "Update vote: no prima facie case" : "Vote: no prima facie case"}
      </button>
      <button
        type="button"
        onClick={() => {
          // An abstention needs no rationale.
          if (
            myVote?.found &&
            !window.confirm(
              "Changing your vote to \u201cabstain\u201d removes your offense-level vote, since an abstention needs none. Continue?"
            )
          ) {
            return;
          }
          votedFound.current = false;
          submit({ found: null, rationale, respondentRowId: row?.id });
        }}
        className="w-full rounded-md border border-dashed border-neutral-300 py-2 text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50"
      >
        {myVote ? "Update vote: abstain" : "Abstain"}
      </button>
    </ActionCard>
  );
}

// The Secretariat records the Committee's finding officially. The outcome is
// the Committee's majority, not the Secretariat's own judgment — so there is no
// found/not-found choice here, only confirmation once every member has voted.
function PrimaFacieAction({ caseDetail, onDone }) {
  // Each respondent's finding is confirmed on its own; the case moves on once
  // every respondent has been decided.
  const rows = visibleRespondentRows(caseDetail);
  const many = rows.length > 1;
  const open = (many ? rows : [rows[0] || null]).filter((row) => !row || row.primaFacieFound === null);
  const [activeId, setActiveId] = useState(null);
  const current = open.find((r) => r?.id === activeId) || open[0];
  return (
    <>
      {many && open.length > 1 && <RespondentTabs rows={open} activeId={current?.id} onChange={setActiveId} />}
      {open.map((row) => (
        <div key={row?.id ?? "only"} className={row?.id === current?.id ? "" : "hidden"}>
          <PrimaFaciePanelAction
            caseDetail={respondentView(caseDetail, row)}
            row={row}
            many={many}
            onDone={onDone}
          />
        </div>
      ))}
    </>
  );
}

function PrimaFaciePanelAction({ caseDetail, row, many, onDone }) {
  const [note, setNote] = useState("");
  const { submit, submitting, error } = useActionForm("prima-facie", caseDetail.id, onDone);
  const votes = caseDetail.primaFacieVotes || [];
  const inFavour = votes.filter((v) => v.found === true).length;
  const against = votes.filter((v) => v.found === false).length;
  const abstained = votes.filter((v) => v.found === null).length;
  const total = caseDetail.committeeMemberCount ?? votes.length;
  // Prefer the server's per-member vote counts (sent to Committee viewers in
  // place of the raw vote list) when present, so the badge works the same
  // for every viewer without needing to see who voted.
  const votedCount = caseDetail.primaFacieVoteCounts
    ? (row ? caseDetail.primaFacieVoteCounts[row.id] || 0 : 0) +
      (!row || row.position === 0 ? caseDetail.primaFacieVoteCounts.first || 0 : 0)
    : votes.length;
  // How many votes the finding waits for: every member, unless the server
  // currently asks for fewer (primaFacieVotesRequired).
  const needed = (count) =>
    caseDetail.primaFacieVotesRequired == null ? count : Math.min(caseDetail.primaFacieVotesRequired, count);
  const votesNeeded = needed(total);
  const allVoted = votes.length >= votesNeeded && votesNeeded > 0;
  // Only members who found a prima facie case vote on the offense level.
  const foundVoterIds = new Set(votes.filter((v) => v.found).map((v) => v.voterId));
  const needScoreCount = needed(foundVoterIds.size);
  const scoredCount = latestAssessmentsByMember(caseDetail.riskAssessments).filter((a) =>
    foundVoterIds.has(a.evaluatedById)
  ).length;
  const allScored = scoredCount >= needScoreCount;
  const tied = allVoted && inFavour === against;
  const outcome = inFavour > against;
  // A tied offense-level vote waits on the Secretariat to set the agreed level.
  const levelTied =
    outcome &&
    !!panelClassification(caseDetail.riskAssessments)?.tied &&
    !standingOverride(caseDetail.riskAssessments);

  return (
    <ActionCard
      title={many ? `Confirm prima facie finding — ${respondentLabel(row)}` : "Confirm prima facie finding"}
      headerRight={<VoteProgressBadge voted={votedCount} required={total} />}
      submitLabel={
        !allVoted
          ? `Waiting on the Committee's votes (${votes.length} of ${votesNeeded})`
          : !allScored
          ? `Waiting on the offense-level votes (${scoredCount} of ${needScoreCount})`
          : tied
          ? "Committee is tied"
          : levelTied
          ? "Set the final offense level first"
          : outcome
          ? "Confirm: prima facie case found"
          : many
          ? "Confirm: no prima facie case"
          : "Confirm: no prima facie case — dismiss"
      }
      submitting={submitting}
      error={error}
      disabled={!allVoted || !allScored || tied || levelTied}
      onSubmit={(e) => {
        e.preventDefault();
        submit({ note, respondentRowId: row?.id });
      }}
    >
      <p className="text-xs text-neutral-500">
        The finding is the Committee's majority. Confirming it records the evaluation officially
        {many
          ? " for this respondent. The case moves on once every respondent has been decided; a respondent with no prima facie case is out of everything after this."
          : outcome
          ? " and dockets the case with its CODI number."
          : " and dismisses the case."}
      </p>

      <PrimaFacieTally caseDetail={caseDetail} />

      <PanelScoreCard caseDetail={caseDetail} compact />

      {(!allVoted || !allScored) && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {caseDetail.primaFacieVotesRequired == null
            ? "Each Committee member votes. "
            : `For now the finding needs ${votesNeeded} Committee vote${votesNeeded === 1 ? "" : "s"}, not every member's. `}
          Members who find a prima facie case then vote on the offense level; a “no” vote needs none.{" "}
          {!allVoted && `${votesNeeded - votes.length} more vote${votesNeeded - votes.length === 1 ? "" : "s"} needed. `}
          {!allScored && `${needScoreCount - scoredCount} more offense-level vote${needScoreCount - scoredCount === 1 ? "" : "s"} needed.`}
        </p>
      )}
      {tied && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The vote is tied {inFavour}–{against}. A member must change their vote before the
          finding can be confirmed.
        </p>
      )}
      {allVoted && allScored && !tied && levelTied && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The offense-level vote is tied. Once the Committee has agreed on the level, set it as the
          final offense level on the <span className="font-medium">Risk assessment</span> tab, then
          confirm the finding here.
        </p>
      )}

      <textarea
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={6}
        placeholder="Note to attach to the official record (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </ActionCard>
  );
}

// How each Committee member voted, with their rationale. The Secretariat sees
// every vote, since it confirms the finding. A Committee member is sent only
// their own vote plus how many have voted (primaFacieVoteCounts), so each
// votes without seeing the others.
function PrimaFacieTally({ caseDetail }) {
  const votes = caseDetail.primaFacieVotes || [];
  if (caseDetail.primaFacieVoteCounts) {
    const row = caseDetail.respondentRow;
    const counts = caseDetail.primaFacieVoteCounts;
    const voted = (row ? counts[row.id] || 0 : 0) + (!row || row.position === 0 ? counts.first || 0 : 0);
    const total = caseDetail.committeeMemberCount ?? voted;
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-neutral-600">
          {voted} of {total} voting member{total === 1 ? "" : "s"} {voted === 1 ? "has" : "have"} voted. Each
          member's vote is private: you see only your own.
        </p>
        {votes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            You haven't voted yet.
          </p>
        ) : (
          <VoteList votes={votes} caseDetail={caseDetail} />
        )}
      </div>
    );
  }
  if (votes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
        No Committee votes yet.
      </p>
    );
  }
  const inFavour = votes.filter((v) => v.found === true).length;
  const against = votes.filter((v) => v.found === false).length;
  const abstained = votes.filter((v) => v.found === null).length;
  const total = caseDetail.committeeMemberCount ?? votes.length;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-neutral-600">
        Committee vote — {inFavour} of {votes.length} found a prima facie case
        {abstained ? ` (${abstained} abstained)` : ""}
        {total > votes.length ? ` (${total - votes.length} yet to vote)` : ""}
      </p>
      <PrimaFacieVoteTally found={inFavour} notFound={against} abstained={abstained} />
      <VoteList votes={votes} caseDetail={caseDetail} />
    </div>
  );
}

// Mirrors PanelScoreCard's VoteTally (CaseRiskAssessmentPanel.jsx) — same
// 3-box grid style, for the prima facie vote itself rather than the offense
// level.
function PrimaFacieVoteTally({ found, notFound, abstained }) {
  const cells = [
    { label: "No Prima Facie", count: notFound, dot: "bg-neutral-400" },
    { label: "Prima Facie Found", count: found, dot: "bg-green-500" },
    { label: "Abstain", count: abstained, dot: "bg-amber-500" },
  ];
  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-500">
            <span className={`h-2 w-2 rounded-full ${cell.dot}`} />
            {cell.label}
          </p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{cell.count}</p>
        </div>
      ))}
    </div>
  );
}

// Each vote with its rationale and the voter's offense-level vote.
function VoteList({ votes, caseDetail }) {
  const scores = latestAssessmentsByMember(caseDetail.riskAssessments);
  return (
      <ul className="space-y-2">
        {votes.map((v) => (
          <li key={v.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-neutral-700">
                {v.voter?.fullName || "Committee member"}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  v.found === true
                    ? "bg-green-100 text-green-800"
                    : v.found === null
                    ? "bg-amber-100 text-amber-800"
                    : "bg-neutral-200 text-neutral-700"
                }`}
              >
                {v.found === true ? "Prima facie case" : v.found === null ? "Abstained" : "No prima facie case"}
              </span>
            </div>
            {v.rationale ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{v.rationale}</p>
            ) : (
              <p className="mt-1 text-sm italic text-neutral-400">No rationale given.</p>
            )}
            <p className="mt-1 text-xs text-neutral-400">
              {new Date(v.votedAt).toLocaleString()} ·{" "}
              {(() => {
                const s = scores.find((a) => a.evaluatedById === v.voterId);
                if (!v.found) {
                  return (
                    <span className="text-neutral-500">
                      {v.found === null ? "No offense vote (abstained)" : "No offense vote (voted no prima facie case)"}
                    </span>
                  );
                }
                return s ? (
                  <span className="font-medium text-neutral-600">
                    Offense vote: {OFFENSE_CLASSIFICATION_LABELS[s.classification]}
                  </span>
                ) : (
                  <span className="font-medium text-amber-700">Offense vote not yet cast</span>
                );
              })()}
            </p>
          </li>
        ))}
      </ul>
  );
}

// The Secretariat writes what the respondent is charged with and sends the
// draft to the Disciplining Authority. Nothing reaches the respondent here —
// the charge is issued when the signed copy is filed.
function FormalChargeAction({ caseDetail, returnedCharge, user, onDone }) {
  const { submit, submitting, error } = useActionForm("formal-charge", caseDetail.id, onDone);
  // Only an unsent document counts: one already sent up belongs to that
  // attempt, so a returned draft needs a revised file before it can go again.
  const chargeDoc = (caseDetail.documents || []).find(
    (d) => d.docType === "FORMAL_CHARGE" && !isSentFormalChargeDoc(caseDetail, d)
  );

  return (
    <ActionCard
      title={returnedCharge ? "Revise the formal charge" : "Draft the formal charge"}
      submitLabel={submitting ? "Sending…" : "Send to the Disciplining Authority"}
      submitting={submitting}
      disabled={!chargeDoc}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        submit({});
      }}
    >
      {returnedCharge && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">
            The Disciplining Authority sent the last draft back. Revise it and send it up again.
          </p>
          {returnedCharge.returnNote && (
            <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
              {returnedCharge.returnNote}
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        Download the template as a Word file, set out what {respondentName(caseDetail)} is charged
        with, then attach the finished charge here. The Disciplining Authority approves it or sends
        it back; once approved you both print it for their signature and file the signed copy,
        which is what issues the charge.
      </p>

      <button
        type="button"
        onClick={() =>
          downloadWordFile(
            `Formal-Charge-${caseLabel(caseDetail)}.doc`,
            buildFormalChargeTemplate(caseDetail)
          )
        }
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-maroon/30 bg-maroon/5 px-3 py-1.5 text-xs font-medium text-maroon hover:bg-maroon/10"
      >
        Download template as Word
      </button>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Formal charge</label>
        {chargeDoc ? (
          <DeliberationReportRow caseId={caseDetail.id} doc={chargeDoc} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            No formal charge attached yet.
          </p>
        )}
        <UploadControl
          caseId={caseDetail.id}
          onDone={onDone}
          docType="FORMAL_CHARGE"
          maxMb={50}
          accept="image/*,application/pdf,.doc,.docx"
          label={chargeDoc ? "Replace the drafted charge" : "Attach the drafted charge"}
          submitLabel={chargeDoc ? "Replace charge" : "Upload charge"}
        />
      </div>
    </ActionCard>
  );
}

// The Disciplining Authority's review of the drafted charge.
function AuthorityChargeReview({ caseDetail, charge, user, onDone }) {
  const approveForm = useActionForm(`formal-charge/${charge.id}/approve`, caseDetail.id, onDone);
  const returnForm = useActionForm(`formal-charge/${charge.id}/return`, caseDetail.id, onDone);
  const [note, setNote] = useState("");
  // The Secretariat sees the same card, but they are not the one signing it.
  const isAuthority = user?.role === "DISCIPLINING_AUTHORITY";

  return (
    <ActionCard
      title="Approve the formal charge"
      submitLabel={approveForm.submitting ? "Approving…" : "Approve the charge"}
      submitting={approveForm.submitting}
      error={approveForm.error || returnForm.error}
      onSubmit={(e) => {
        e.preventDefault();
        approveForm.submit({});
      }}
    >
      <p className="text-xs text-neutral-500">
        CODI has drafted this charge against {respondentName(caseDetail)}. Approving it lets it be
        printed for the Disciplining Authority&rsquo;s signature; the respondent is charged when the
        signed copy is filed.
        {!isAuthority &&
          " The draft is with them — approve it here only to record a decision they have already made."}
      </p>
      {/* Charges recorded before the charge became a file still carry text. */}
      {charge.document ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <RecommendationDocLink caseId={caseDetail.id} doc={charge.document} />
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{charge.chargeDetails}</p>
        </div>
      )}
      <div>
        <textarea
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={4}
          maxLength={RETURN_NOTE_MAX}
            placeholder={
            isAuthority
              ? "To send it back instead, say what needs revising — the Secretariat reads this."
              : "To send it back instead, say what needs revising."
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-neutral-400">
          {note.length.toLocaleString()} / {RETURN_NOTE_MAX.toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={() => note.trim() && returnForm.submit({ note: note.trim() })}
        disabled={returnForm.submitting || approveForm.submitting || !note.trim()}
        className="w-full rounded-md border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
      >
        {returnForm.submitting ? "Sending back…" : "Send back for revision"}
      </button>
    </ActionCard>
  );
}

// Approved: print it, get it signed, file the signed copy. Either the
// Secretariat or the Authority can file it — the upload is what issues it.
function SignedChargeAction({ caseDetail, user, onDone }) {
  const chargeDoc = (caseDetail.documents || []).find((d) => d.docType === "FORMAL_CHARGE");
  // Until the signed copy lands, the file on the case is still the approved
  // draft — the one to print and take to the Authority for signature.
  const signed = chargeDoc && !isSentFormalChargeDoc(caseDetail, chargeDoc);

  return (
    <ActionCard title="Print and file the signed charge" hideSubmit onSubmit={(e) => e.preventDefault()}>
      <p className="text-xs text-neutral-500">
        The Disciplining Authority has approved this charge. Open it below and print it, have it
        signed, then upload the signed copy — filing it is what issues the charge to the respondent
        and starts their window to answer.
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">
          {signed ? "Signed formal charge" : "Approved charge, awaiting signature"}
        </label>
        {chargeDoc ? (
          <DeliberationReportRow caseId={caseDetail.id} doc={chargeDoc} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            No charge on file.
          </p>
        )}
        <UploadControl
          caseId={caseDetail.id}
          onDone={onDone}
          docType="FORMAL_CHARGE"
          maxMb={50}
          accept="image/*,application/pdf,.doc,.docx"
          label="Upload the signed charge (image or PDF)"
          submitLabel="File signed charge"
        />
      </div>
    </ActionCard>
  );
}

// --- Answering the formal charge, and the pathway that follows ------------
// The respondent files a notarized answer and picks how the case proceeds; the
// complainant picks independently; the Secretariat settles it. The routes
// behind these are cases.routes.js: formal-answer, pathway-choice and
// pathway-recommendation.

const PATHWAY_OPTIONS = [
  {
    value: "FORMAL_INVESTIGATION",
    label: "Formal Investigation",
    blurb: "Hearings before the Committee, with witnesses and cross-examination.",
  },
  {
    value: "POSITION_PAPER",
    label: "Position Paper",
    blurb: "Written submissions only, decided on the records.",
  },
];

function PathwayRadioGroup({ value, onChange }) {
  return (
    <div className="space-y-2">
      {PATHWAY_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`relative flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm hover:bg-neutral-50 ${
            value === opt.value ? "border-maroon bg-maroon/5" : "border-neutral-200"
          }`}
        >
          <input
            type="radio"
            className="mt-0.5"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>
            <span className="font-medium text-neutral-800">{opt.label}</span>
            <span className="block text-xs text-neutral-500">{opt.blurb}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// The respondent's answer to the formal charge: notarized like every other
// party filing, so it is attached and then submitted — the route refuses a
// submission with no document on file.
function FormalAnswerAction({ caseDetail, onDone }) {
  const [files, setFiles] = useState([]);
  const hasFiles = files.length > 0;
  const [pathway, setPathway] = useState(caseDetail.respondentPathwayChoice || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const existing = (caseDetail.documents || []).find((d) => d.docType === "RESPONDENT_ANSWER");
  const filed = (caseDetail.respondentAnswers || []).some((a) => a.stage === "FORMAL_CHARGE");
  const returned = existing?.reviewStatus === "RETURNED";
  // Already with CODI: no picker, since a replacement would be refused.
  const locked = !!existing && !returned;
  const chargeDoc = (caseDetail.documents || []).find((d) => d.docType === "FORMAL_CHARGE");


  // Before it is filed, the answer needs a document and a pathway; a document
  // already uploaded counts. Afterwards the only thing worth submitting is a
  // corrected file, so nothing without one. An anonymous case has no pathway
  // to choose: it proceeds by position paper.
  const choosesPathway = !caseDetail.isAnonymous;
  const canSubmit = filed ? hasFiles : (!!existing || hasFiles) && (!choosesPathway || !!pathway);

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      if (hasFiles) {
        const formData = new FormData();
        appendNotarizedFiles(formData, files);
        formData.append("docType", "RESPONDENT_ANSWER");
        await api.post(`/cases/${caseDetail.id}/documents`, formData);
      }
      // A replacement after a return is the re-filing itself; only the first
      // filing goes through the answer route, which also records the pathway.
      if (!filed) await api.post(`/cases/${caseDetail.id}/formal-answer`, choosesPathway ? { pathway } : {});
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionCard
      title={returned ? "File a corrected answer" : "Answer the formal charge"}
      submitLabel={busy ? "Submitting…" : returned ? "Submit corrected answer" : "Submit answer"}
      submitting={busy}
      disabled={!canSubmit}
      review={[
        {
          label: "Filing",
          value: returned ? "Corrected answer to the formal charge" : "Answer to the formal charge",
        },
        {
          label: hasFiles && files.length > 1 ? "Documents" : "Document",
          value: hasFiles ? fileListValue(files) : existing?.fileName,
        },
        ...(filed
          ? []
          : [
              {
                label: "Pathway",
                value: choosesPathway
                  ? PATHWAY_OPTIONS.find((o) => o.value === pathway)?.label
                  : "Position paper (anonymous complaint)",
              },
            ]),
      ]}
      hideSubmit={locked && filed}
      error={error}
      onSubmit={submit}
    >
      <p className="text-xs text-neutral-500">
        Your answer must be <span className="font-medium text-maroon">notarized</span>. Prepare and
        notarize it outside the system, then upload a scanned copy or clear photo here. JPG, PNG,
        WebP or PDF, up to {NOTARIZED_MAX_FILES} files, {NOTARIZED_MAX_MB} MB each.
      </p>
      {chargeDoc && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
          <span>Answering:</span>
          <RecommendationDocLink caseId={caseDetail.id} doc={chargeDoc} />
          <span className="w-full text-neutral-500">
            Open the formal charge to read what you are answering.
          </span>
        </p>
      )}
      {returned && existing?.reviewNote && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">The Secretariat sent your answer back.</p>
          <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
            {existing.reviewNote}
          </p>
        </div>
      )}
      {locked && filed ? (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          Filed. CODI is reviewing it — nothing further is needed from you unless they send it back.
        </p>
      ) : (
        <NotarizedFilePicker files={files} onChange={setFiles} confirmable={false} disabled={busy} />
      )}
      {existing && !hasFiles && (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          Attached: <span className="font-medium">{existing.fileName}</span>
        </p>
      )}
      {!filed && choosesPathway && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-600">
            How should the case proceed from here?
          </p>
          <PathwayRadioGroup value={pathway} onChange={setPathway} />
        </div>
      )}
      {!filed && !choosesPathway && (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          This complaint was filed anonymously, so after your answer the case proceeds by your
          position paper only. You'll be asked for it once your answer is approved.
        </p>
      )}
    </ActionCard>
  );
}

// The complainant picks independently of the respondent. If the two agree the
// case takes that pathway on its own; if they differ, the Secretariat settles
// it below.
function ComplainantPathwayAction({ caseId, onDone }) {
  const [pathway, setPathway] = useState(null);
  const { submit, submitting, error } = useActionForm("pathway-choice", caseId, onDone);

  return (
    <ActionCard
      title="Choose how the case proceeds"
      submitLabel={submitting ? "Submitting…" : "Submit choice"}
      submitting={submitting}
      disabled={!pathway}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pathway) return;
        submit({ pathway });
      }}
    >
      <p className="text-xs text-neutral-500">
        The respondent chooses too. Both choices go to the Secretariat, who sets the pathway the
        case actually proceeds under.
      </p>
      <PathwayRadioGroup value={pathway} onChange={setPathway} />
    </ActionCard>
  );
}

// The Secretariat settles the pathway. Only shown while the case has none:
// once set it is final, and the server refuses a change.
function SetPathwayAction({ caseDetail, onDone }) {
  const { respondentPathwayChoice, complainantPathwayChoice, finalPathway } = caseDetail;
  const disagree =
    respondentPathwayChoice &&
    complainantPathwayChoice &&
    respondentPathwayChoice !== complainantPathwayChoice;
  // Starts on whatever the case is set to, so changing it is a deliberate move
  // off the current choice rather than a blank form.
  const [pathway, setPathway] = useState(finalPathway || null);
  const { submit, submitting, error } = useActionForm("pathway-recommendation", caseDetail.id, onDone);

  return (
    <ActionCard
      title={finalPathway ? "Change the pathway" : "Set the pathway"}
      submitLabel={submitting ? "Saving…" : finalPathway ? "Change pathway" : "Set pathway"}
      submitting={submitting}
      disabled={!pathway || pathway === finalPathway}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pathway) return;
        submit({ pathway });
      }}
    >
      <p className="text-xs text-neutral-500">
        The pathway is yours to set. The parties' choices below are what they asked for, not the
        decision{disagree ? " — and here they differ" : ""}.{" "}
        {finalPathway
          ? "You can still change it; scheduling a hearing settles it for good."
          : "You can change it later, up until a hearing is scheduled."}
      </p>
      <dl className="grid grid-cols-2 gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
        <div>
          <dt className="text-neutral-400">
            {(caseDetail.respondents || []).length > 1 ? "Respondents" : "Respondent"}
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-800">
            {(caseDetail.respondents || []).length > 1
              ? caseDetail.respondents.map((r) => (
                  <span key={r.id} className="block">
                    {rowName(r)}: {r.pathwayChoice ? PATHWAY_LABELS[r.pathwayChoice] : "Not yet chosen"}
                  </span>
                ))
              : respondentPathwayChoice
              ? PATHWAY_LABELS[respondentPathwayChoice]
              : "Not yet chosen"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-400">Complainant</dt>
          <dd className="mt-0.5 font-medium text-neutral-800">
            {complainantPathwayChoice ? PATHWAY_LABELS[complainantPathwayChoice] : "Not yet chosen"}
          </dd>
        </div>
      </dl>
      <PathwayRadioGroup value={pathway} onChange={setPathway} />
    </ActionCard>
  );
}

function DeliberationAction({ caseDetail, user, onDone }) {
  // Pre-filled with a best-effort suggestion based on the case's risk
  // classification and framework — reviewed and edited before submitting;
  // this is the CODI Report's recommended disciplinary action.
  const suggested =
    getRecommendationSuggestion(
      caseDetail.governingFramework,
      caseDetail.offenseClassification,
      caseDetail.isFirstOffense
    ) || "";
  const { submit, submitting, error } = useActionForm("deliberation", caseDetail.id, onDone);

  // The CODI report itself is a document attachment (docType
  // DELIBERATION_NOTES) rather than typed notes — it can be attached,
  // viewed, and replaced with a corrected version any time before
  // submission, same as the notarized complaint / recommendation documents
  // elsewhere in the app.
  const reportDoc = (caseDetail.documents || []).find((d) => d.docType === "DELIBERATION_NOTES");
  // The server takes the report only once every position paper owed is on
  // file and approved, so until then the card says what it is waiting on.
  const papers = positionPaperStatus(caseDetail);
  const waitingOn = [
    !papers.respondentPaperIn && "the respondent's",
    !papers.complainantPaperIn && "the complainant's",
  ].filter(Boolean);

  return (
    <ActionCard
      title="CODI report & recommendation"
      submitLabel="Submit report"
      submitting={submitting}
      error={error}
      disabled={!reportDoc}
      onSubmit={(e) => {
        e.preventDefault();
        submit({});
      }}
    >
      <p className="text-xs text-neutral-500">
        Download the draft template below to start from — it's pre-filled with the case's findings
        summary and a suggested recommendation. Edit it (e.g. in Word), save it as your final
        report, then attach it here. The report itself carries the recommended disciplinary action.
      </p>

      <button
        type="button"
        onClick={() =>
          downloadTextFile(`CODI-Report-Draft-${caseLabel(caseDetail)}.txt`, buildCodiReportTemplate(caseDetail, suggested))
        }
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-maroon/30 bg-maroon/5 px-3 py-1.5 text-xs font-medium text-maroon hover:bg-maroon/10"
      >
        Download draft template
      </button>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">CODI report document</label>
        {reportDoc ? (
          <DeliberationReportRow caseId={caseDetail.id} doc={reportDoc} user={user} onDone={onDone} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
            No report document attached yet.
          </p>
        )}
        {papers.bothIn ? (
          <UploadControl
            caseId={caseDetail.id}
            onDone={onDone}
            docType="DELIBERATION_NOTES"
            maxMb={50}
            accept="image/*,video/*,audio/*,application/pdf"
            label={reportDoc ? "Replace the CODI report document" : "Attach the CODI report document"}
            submitLabel={reportDoc ? "Replace report" : "Upload report"}
          />
        ) : (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The CODI report can be attached once {waitingOn.join(" and ")} position paper
            {waitingOn.length > 1 ? "s are" : " is"} filed and approved by the Secretariat.
          </p>
        )}
      </div>

    </ActionCard>
  );
}

function DeliberationReportRow({ caseId, doc, user, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    try {
      const res = await api.get(`/cases/${caseId}/documents/${doc.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Could not open the file.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${doc.fileName}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/cases/${caseId}/documents/${doc.id}`);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to remove document");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={open} className="text-sm font-medium text-maroon hover:underline">
          {doc.fileName}
        </button>
        {doc.uploadedById === user.id && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-xs font-medium text-neutral-400 hover:text-red-600 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DecisionAction({ caseId, onDone }) {
  const [outcome, setOutcome] = useState("LIABLE");
  const [penalty, setPenalty] = useState("");
  const [rationale, setRationale] = useState("");
  const { submit, submitting, error } = useActionForm("decision", caseId, onDone);

  return (
    <ActionCard
      title="Log the President's decision"
      submitLabel="Log decision"
      submitting={submitting}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        submit({ outcome, penalty, rationale });
      }}
    >
      <p className="text-xs text-neutral-500">
        The University President has no system access and adjudicates the complete case file
        physically. Log the outcome here.
      </p>
      <select
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
      >
        <option value="LIABLE">{DECISION_OUTCOME_LABELS.LIABLE}</option>
        <option value="NOT_LIABLE">{DECISION_OUTCOME_LABELS.NOT_LIABLE}</option>
      </select>
      {outcome === "LIABLE" && (
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Penalty imposed (e.g. suspension, one month and one day)"
          value={penalty}
          onChange={(e) => setPenalty(e.target.value)}
        />
      )}
      <textarea
        required
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={12}
        placeholder="Rationale for the decision"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
    </ActionCard>
  );
}
