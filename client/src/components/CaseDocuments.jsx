import { useId, useRef, useState } from "react";
import { api } from "../api/client.js";
import NotarizedFilePicker, { appendNotarizedFiles, NOTARIZED_HINT } from "./NotarizedFilePicker.jsx";
import { DOC_REVIEW_COLORS, EVIDENCE_LINK_MAX, RETURN_NOTE_MAX, docReviewLabel } from "../lib/constants.js";
import { viewerOf } from "../lib/caseRole.js";
import { documentsShared } from "../lib/caseProgress.js";
import { FilePlusIcon, CheckCircleIcon, XIcon, LinkIcon, PlusIcon } from "./icons.jsx";

const COMPLAINT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const EVIDENCE_ACCEPT = "image/*,video/*,audio/*,application/pdf";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CaseDocuments({
  caseDetail,
  user,
  onDone,
  // When true, hides the complaint-doc upload/remove controls on this
  // rendering while the case is in an active correction round — that's the
  // Case Detail page, which points the complainant to the Edit Complaint
  // page instead so there's a single, unambiguous place to fix a returned
  // complaint. EditComplaintPage renders this component without the flag so
  // the controls stay available there. Evidence is unaffected either way.
  restrictComplaintEditDuringCorrection = false,
}) {
  const documents = caseDetail.documents || [];
  const complaintDocs = documents.filter((d) => d.docType === "COMPLAINT");
  const evidenceDocs = documents.filter((d) => d.docType === "EVIDENCE");
  const otherDocs = documents.filter((d) => d.docType === "OTHER");
  const positionPaperDocs = documents.filter((d) => d.docType === "POSITION_PAPER");
  const answerDocs = documents.filter((d) => d.docType === "RESPONDENT_ANSWER");
  const latestAnswerDoc = answerDocs[answerDocs.length - 1];
  const showCauseAnswerDocs = documents.filter((d) => d.docType === "SHOW_CAUSE_ANSWER");
  // A response can be returned as not notarized or over its content, so the
  // re-file control follows the answer's return, not the document's
  // notarization verdict.
  const showCauseAnswer = (caseDetail.respondentAnswers || [])
    .filter((a) => a.stage === "SHOW_CAUSE")
    .at(-1);
  const showCauseAnswerReturned = !!showCauseAnswer?.returnedAt;
  const showCauseOrderDocs = documents.filter((d) => d.docType === "SHOW_CAUSE_ORDER");
  // A party only ever sees the order that was actually served on the
  // respondent. Drafts and returned attempts each keep their own file and
  // stay Secretariat/Chairperson-internal.
  const servedOrderDocIds = new Set(
    (caseDetail.showCauseOrders || [])
      .filter((o) => o.status === "SERVED")
      .map((o) => o.documentId)
      .filter(Boolean)
  );
  // Hide the upload control once a complaint doc is on file and awaiting/passed
  // review (PENDING or NOTARIZED) — only bring it back if the Secretariat
  // rejects the latest one (NOT_NOTARIZED), so the complainant can resubmit.
  // Also always show it while the Secretariat has returned the case for
  // correction — that's an active edit window regardless of what the
  // existing document's notarization status happens to be.
  const latestComplaintDoc = complaintDocs[complaintDocs.length - 1];
  const inCorrection = caseDetail.status === "RETURNED_FOR_CORRECTION";
  const needsComplaintUpload =
    inCorrection || !latestComplaintDoc || latestComplaintDoc.reviewStatus === "RETURNED";
  const hideComplaintEditHere = restrictComplaintEditDuringCorrection && inCorrection;
  // Which side of THIS case the viewer is on — their account says nothing
  // about that (see lib/caseRole.js).
  const viewer = viewerOf(caseDetail, user);
  const isOwner = viewer.isComplainant;
  // An anonymous complainant is done once the complaint is sent: read-only.
  const anonymousOwner = isOwner && !!caseDetail.isAnonymous;
  const isRespondentOwner = viewer.isRespondent;
  const isSecretariat = user.role === "SECRETARIAT";
  const onPositionPaperPathway = caseDetail.finalPathway === "POSITION_PAPER";
  const myPositionPaper = positionPaperDocs.find((d) => d.uploadedById === user.id);
  // Once the respondent has been served the show-cause order, each side sees
  // what the other has filed — the complaint and its notarized copy, answers,
  // evidence and position papers — so neither is answering material they
  // cannot read. Before that the case is still intake and only CODI sees it.
  const shared = documentsShared(caseDetail);
  const isRespondent = viewer.isRespondent;
  // Who may read a given side's filings: its owner, CODI staff, or the other
  // party once sharing has opened.
  const canSeeComplainantFilings = isOwner || viewer.isStaff || (shared && isRespondentOwner);
  const canSeeRespondentFilings = isRespondentOwner || viewer.isStaff || (shared && isOwner);
  // Positive test: staff are CODI staff, never "whoever isn't a party" —
  // getting that backwards would show a party the whole case file.
  const isStaff = viewer.isStaff;
  const visiblePositionPaperDocs =
    isRespondent && !shared ? positionPaperDocs.filter((d) => d.uploadedById === user.id) : positionPaperDocs;
  // Evidence is displayed as two separate lists, one per party, rather than
  // one combined list — easier to scan who submitted what at a glance.
  const visibleShowCauseOrderDocs = isStaff
    ? showCauseOrderDocs
    : shared
    ? showCauseOrderDocs.filter((d) => servedOrderDocIds.has(d.id))
    : [];
  const complainantEvidenceDocs = evidenceDocs.filter(
    (d) => d.uploadedById === caseDetail.complainantId
  );
  // Every respondent's evidence. A respondent is told only their own account,
  // and the server sends only their own filings, so this is theirs alone to them.
  const respondentIds = (caseDetail.respondents || []).map((r) => r.userId).filter(Boolean);
  if (caseDetail.respondentId && !respondentIds.includes(caseDetail.respondentId)) {
    respondentIds.push(caseDetail.respondentId);
  }
  const respondentEvidenceDocs = evidenceDocs.filter((d) => respondentIds.includes(d.uploadedById));
  // When a complaint names several respondents, what they file is shown under
  // each one's own name. A respondent is sent only their own rows and documents.
  const respondentRowsHere = (caseDetail.respondents || []).filter((r) => !r.other);
  const manyRespondents = (caseDetail.respondents || []).length > 1;
  const respondentLabel = (r) => r.user?.fullName || r.claimedName;
  const groupByRespondent = (docs, { includeEmpty = false } = {}) =>
    respondentRowsHere
      .map((r) => ({
        row: r,
        name: respondentLabel(r),
        docs: docs.filter((d) => (r.userId && d.uploadedById === r.userId) || d.respondentRowId === r.id),
      }))
      .filter((g) => includeEmpty || g.docs.length > 0);
  // The rows for a list of a respondent's filings: flat for one respondent,
  // one named group each for several.
  const renderRespondentFilings = (docs, rowProps) =>
    manyRespondents ? (
      groupByRespondent(docs).map((g) => (
        <div key={g.row.id} className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-neutral-600">{isRespondent ? "Your filing" : g.name}</p>
          <ul className="space-y-3">
            {g.docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} caseId={caseDetail.id} canReview={false} onDone={onDone} {...rowProps(doc)} />
            ))}
          </ul>
        </div>
      ))
    ) : (
      <ul className="space-y-3">
        {docs.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} caseId={caseDetail.id} canReview={false} onDone={onDone} {...rowProps(doc)} />
        ))}
      </ul>
    );
  // Links count against the viewer's own allowance; files they upload don't.
  const myEvidenceLinkCount = evidenceDocs.filter(
    (d) => d.uploadedById === user.id && d.externalUrl
  ).length;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-neutral-800">
        Case documents &amp; requirements
      </h2>
      {caseDetail.isAnonymous && (isOwner || viewer.isStaff) ? (
        <p className="mb-4 text-xs text-neutral-500">
          An anonymous complaint has no notarized copy. Its evidence is listed below.
        </p>
      ) : isOwner || viewer.isStaff ? (
        <p className="mb-4 text-xs text-neutral-500">
          Upload a scanned copy or clear photo of the notarized complaint document. The
          Secretariat confirms notarization during verification.
        </p>
      ) : canSeeComplainantFilings ? (
        <p className="mb-4 text-xs text-neutral-500">
          The complaint filed against you, and the evidence each side has attached.
        </p>
      ) : null}

      {/* --- Notarized complaint: the respondent reads it once served -------- */}
      {canSeeComplainantFilings && !caseDetail.isAnonymous && (
        <>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Notarized complaint
          </h3>
          {complaintDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-center text-sm text-neutral-500">
              No notarized complaint uploaded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {complaintDocs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  caseId={caseDetail.id}
                  canReview={false}
                  canRemove={isOwner && doc.reviewStatus !== "APPROVED" && !hideComplaintEditHere}
                  showReview
                  onDone={onDone}
                />
              ))}
            </ul>
          )}

          {isOwner && needsComplaintUpload && !hideComplaintEditHere && (
            <UploadControl
              caseId={caseDetail.id}
              onDone={onDone}
              docType="COMPLAINT"
              maxMb={10}
              accept={COMPLAINT_ACCEPT}
              label={`Upload notarized document (${NOTARIZED_HINT})`}
            />
          )}

          {isOwner && needsComplaintUpload && hideComplaintEditHere && (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
              This complaint was returned for correction. Use the <strong>Edit complaint</strong>{" "}
              button above to upload a corrected notarized copy.
            </p>
          )}
        </>
      )}

      {/* --- Evidence (optional) --------------------------------------------- */}
      <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Evidence <span className="font-normal normal-case">(optional)</span>
      </h3>
      <p className="mb-3 text-xs text-neutral-500">
        Either party may attach supporting evidence — the complainant for their complaint, the
        respondent for their defense.
      </p>

      {canSeeComplainantFilings && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-neutral-600">
            {isOwner ? "Your evidence" : "Complainant's evidence"}
          </h4>
          {complainantEvidenceDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
              No evidence attached.
            </p>
          ) : (
            <ul className="space-y-3">
              {complainantEvidenceDocs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  caseId={caseDetail.id}
                  canReview={false}
                  canRemove={
                    doc.uploadedById === user.id &&
                    doc.reviewStatus === "PENDING" &&
                    !anonymousOwner &&
                    !(isOwner && hideComplaintEditHere)
                  }
                  showReview={false}
                  onDone={onDone}
                />
              ))}
            </ul>
          )}

          {isOwner && !anonymousOwner && (
            <EvidenceLinkControl
              caseId={caseDetail.id}
              onDone={onDone}
              linksUsed={myEvidenceLinkCount}
              label="Photos, videos, voice recordings, or screenshots that support your complaint."
            />
          )}
          {anonymousOwner && (
            <p className="mt-3 text-xs text-neutral-500">
              Your evidence was sent with your anonymous complaint. Nothing more can be added.
            </p>
          )}
        </div>
      )}

      {canSeeRespondentFilings &&
        (manyRespondents ? groupByRespondent(respondentEvidenceDocs, { includeEmpty: true }) : [null]).map((group) => {
          const docsHere = group ? group.docs : respondentEvidenceDocs;
          const mine = !group || (isRespondentOwner && group.row.userId === user.id);
          return (
            <div key={group?.row.id ?? "respondent"} className={group ? "mt-4" : ""}>
              <h4 className="mb-2 text-xs font-medium text-neutral-600">
                {isRespondent ? "Your evidence" : group ? `${group.name}'s evidence` : "Respondent's evidence"}
              </h4>
              {docsHere.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
                  {isRespondent ? "You haven't attached any evidence yet." : "No evidence attached."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {docsHere.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      caseId={caseDetail.id}
                      canReview={false}
                      canRemove={doc.uploadedById === user.id && doc.reviewStatus === "PENDING"}
                      showReview={false}
                      onDone={onDone}
                    />
                  ))}
                </ul>
              )}

              {isRespondentOwner && mine && (
                <EvidenceLinkControl
                  caseId={caseDetail.id}
                  onDone={onDone}
                  linksUsed={myEvidenceLinkCount}
                  label="Photos, videos, voice recordings, or screenshots that support your defense."
                />
              )}
            </div>
          );
        })}

      {/* --- Other records (Secretariat-attached, e.g. proof the respondent
          never answered) ------------------------------------------------- */}
      {(otherDocs.length > 0 || isSecretariat) && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Other records
          </h3>
          {otherDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-center text-sm text-neutral-500">
              No other records attached.
            </p>
          ) : (
            <ul className="space-y-3">
              {otherDocs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  caseId={caseDetail.id}
                  canReview={false}
                  canRemove={false}
                  showReview={false}
                  onDone={onDone}
                />
              ))}
            </ul>
          )}

          {isSecretariat && (
            <UploadControl
              caseId={caseDetail.id}
              onDone={onDone}
              docType="OTHER"
              maxMb={50}
              accept={EVIDENCE_ACCEPT}
              label="Attach a supporting record — e.g. proof the respondent never answered (max 50 MB)"
            />
          )}
        </>
      )}

      {/* --- The show-cause order itself -------------------------------------
          What the respondent is answering. Staff see every attempt; the
          parties see only the order that was served. */}
      {visibleShowCauseOrderDocs.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Show-cause order
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            {isRespondentOwner
              ? "The order you are being asked to respond to."
              : isStaff
              ? "Signed by the Chairperson and served on the respondent by the Secretariat."
              : "The order served on the respondent."}
          </p>
          <ul className="space-y-3">
            {visibleShowCauseOrderDocs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} caseId={caseDetail.id} onDone={onDone} />
            ))}
          </ul>
        </>
      )}

      {/* --- Respondent's response to the show-cause order -------------------
          Notarized like the complaint: the respondent files it, the
          Secretariat verifies or returns it. */}
      {showCauseAnswerDocs.length > 0 && canSeeRespondentFilings && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Response to the show-cause order
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            {isSecretariat
              ? "Check the uploaded document is notarized, then verify it or return it."
              : "The Secretariat confirms whether this response is notarized."}
          </p>
          {renderRespondentFilings(showCauseAnswerDocs, (doc) => ({
            canRemove: isRespondentOwner && doc.reviewStatus !== "APPROVED",
            showReview: true,
          }))}
          {isRespondentOwner && showCauseAnswerReturned && (
            <div className="mt-3">
              <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {`Your response was returned ${[
                  (showCauseAnswer.returnReason || "").includes("NOTARIZATION") &&
                    "as not notarized",
                  (showCauseAnswer.returnReason || "").includes("CONTENT") && "over its content",
                ]
                  .filter(Boolean)
                  .join(" and ")}.`}{" "}
                {showCauseAnswer.returnNote ? `“${showCauseAnswer.returnNote}” ` : ""}
                Upload a corrected response to replace it.
              </p>
              <UploadControl
                caseId={caseDetail.id}
                onDone={onDone}
                docType="SHOW_CAUSE_ANSWER"
                maxMb={10}
                accept={COMPLAINT_ACCEPT}
                label={`Upload your notarized response (${NOTARIZED_HINT})`}
                submitLabel="Replace response"
              />
            </div>
          )}
        </>
      )}

      {/* --- Respondent's formal written answer ------------------------------
          Notarized like the complaint: the respondent files it, the
          Secretariat verifies or returns it. Hidden from the complainant —
          the respondent's filing is not theirs to see. */}
      {answerDocs.length > 0 && canSeeRespondentFilings && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Formal written answer
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            {isSecretariat
              ? "Check the uploaded document is notarized, then verify it or return it."
              : "The Secretariat confirms whether this answer is notarized."}
          </p>
          {renderRespondentFilings(answerDocs, (doc) => ({
            canRemove: isRespondentOwner && doc.reviewStatus !== "APPROVED",
            showReview: true,
          }))}
          {isRespondentOwner && latestAnswerDoc?.reviewStatus === "RETURNED" && (
            <div className="mt-3">
              <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">
                  This document was returned by the Secretariat. Upload a corrected one to replace
                  it.
                </p>
                {latestAnswerDoc.reviewNote && (
                  <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
                    {latestAnswerDoc.reviewNote}
                  </p>
                )}
              </div>
              <UploadControl
                caseId={caseDetail.id}
                onDone={onDone}
                docType="RESPONDENT_ANSWER"
                maxMb={10}
                accept={COMPLAINT_ACCEPT}
                label={`Upload your notarized answer (${NOTARIZED_HINT})`}
                submitLabel="Replace answer"
              />
            </div>
          )}
        </>
      )}

      {/* --- Position papers (Position Paper pathway only) -------------------
          Each party's substitute for testifying at a hearing. */}
      {onPositionPaperPathway && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Position papers
          </h3>
          <p className="mb-3 text-xs text-neutral-500">
            {caseDetail.isAnonymous
              ? isOwner
                ? "This anonymous complaint proceeds by the respondent's position paper only. Nothing is needed from you."
                : "This anonymous complaint proceeds by the respondent's position paper only. The Committee deliberates once it is confirmed notarized."
              : isSecretariat
              ? "Each party files a notarized paper instead of testifying. Check each one is notarized, then verify it or return it — the Committee deliberates once both are confirmed."
              : isStaff
              ? "Each party files a notarized paper instead of testifying; the Committee deliberates once both are confirmed by the Secretariat."
              : "This case has no hearings — your position paper is how you put your side of the case. The Secretariat confirms it is notarized, and the Committee deliberates once both parties' papers are confirmed."}
          </p>
          {visiblePositionPaperDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-center text-sm text-neutral-500">
              {isRespondent
                ? "You haven't uploaded your position paper yet."
                : "No position papers uploaded yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {visiblePositionPaperDocs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  caseId={caseDetail.id}
                  canReview={false}
                  canRemove={doc.uploadedById === user.id && doc.reviewStatus !== "APPROVED"}
                  showReview
                  ownerLabel={
                    doc.uploadedById === caseDetail.complainantId
                      ? "Complainant"
                      : respondentIds.includes(doc.uploadedById)
                      ? respondentIds.length > 1
                        ? `Respondent (${
                            (caseDetail.respondents || []).find((r) => r.userId === doc.uploadedById)?.claimedName ||
                            doc.uploadedBy?.fullName
                          })`
                        : "Respondent"
                      : null
                  }
                  onDone={onDone}
                />
              ))}
            </ul>
          )}

          {((isOwner && !caseDetail.isAnonymous) || isRespondentOwner) &&
            (myPositionPaper?.reviewStatus === "APPROVED" ? (
              <p className="mt-3 text-xs text-neutral-500">
                Your position paper is on file and confirmed notarized. Deliberation can proceed
                once both parties' papers are confirmed.
              </p>
            ) : (
              <p className="mt-3 text-xs text-neutral-500">
                File your position paper from the{" "}
                <span className="font-medium">Submit your position paper</span> panel on this case.
              </p>
            ))}
        </>
      )}
    </section>
  );
}


// Evidence is submitted as a link rather than an upload: the material stays in
// the submitter's own cloud storage and CODI follows the link to view it, so
// this system never stores or serves the files themselves.
const LINK_RE = /^https?:\/\/\S+\.\S+/i;

// `compact` drops the card chrome and stacks the steps, for narrow spots such
// as a hearing note, where the control sits inside its own box.
export function EvidenceLinkControl({
  caseId,
  onDone,
  label,
  hearingId,
  compact = false,
  linksUsed = 0,
}) {
  const remaining = Math.max(0, EVIDENCE_LINK_MAX - linksUsed);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const urlId = useId();
  const nameId = useId();

  const trimmed = url.trim();
  const looksInvalid = trimmed.length > 0 && !LINK_RE.test(trimmed);

  async function save(e) {
    e.preventDefault();
    if (!trimmed || looksInvalid || busy) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api.post(`/cases/${caseId}/documents/links`, {
        externalUrl: trimmed,
        fileName: name.trim(),
        ...(hearingId ? { hearingId } : {}),
      });
      setSaved(name.trim() || "Your link");
      setUrl("");
      setName("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save the link");
    } finally {
      setBusy(false);
    }
  }

  if (remaining === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
        You have added all {EVIDENCE_LINK_MAX} of your evidence links. Remove one above to add
        another, or upload the file itself.
      </p>
    );
  }

  return (
    <form
      onSubmit={save}
      className={compact ? "mt-3" : "mt-3 rounded-xl border-2 border-maroon/30 bg-maroon/[0.03] p-4 shadow-sm"}
    >
      {compact ? (
        label && <p className="text-xs text-neutral-600">{label}</p>
      ) : (
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maroon text-white">
          <PlusIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-neutral-900">Add evidence</p>
          <p className="text-xs text-neutral-600">{label}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {remaining} of {EVIDENCE_LINK_MAX} link{remaining === 1 ? "" : "s"} left.
          </p>
        </div>
      </div>
      )}

      <ol className={`mt-3 grid gap-2 text-xs text-neutral-700 ${compact ? "" : "sm:grid-cols-3"}`}>
        {[
          "Upload your file to Google Drive, OneDrive, or a similar service.",
          <>
            Set sharing to <span className="font-medium">“Anyone with the link can view”</span>.
          </>,
          "Copy the share link and paste it below.",
        ].map((step, i) => (
          <li key={i} className="flex gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-neutral-200">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-maroon/10 text-xs font-bold text-maroon">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor={urlId} className="mb-1 block text-xs font-medium text-neutral-700">
            Link to your evidence <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              id={urlId}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setSaved("");
              }}
              placeholder="https://drive.google.com/..."
              aria-invalid={looksInvalid}
              className={`w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 ${
                looksInvalid
                  ? "border-red-400 focus:ring-red-200"
                  : "border-neutral-300 focus:border-maroon focus:ring-maroon/20"
              }`}
            />
          </div>
          {looksInvalid && (
            <p className="mt-1 text-xs text-red-600">
              That doesn't look like a link. It should start with https://
            </p>
          )}
        </div>

        <div>
          <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-neutral-700">
            What is this? <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Screenshot of messages, 12 Aug"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-maroon focus:outline-none focus:ring-2 focus:ring-maroon/20"
          />
        </div>
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {saved && !error && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircleIcon className="h-4 w-4" /> {saved} was added. You can add another one.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">Add one link per item. CODI must be able to open it.</p>
        <button
          type="submit"
          disabled={busy || !trimmed || looksInvalid}
          className="inline-flex items-center gap-2 rounded-lg bg-maroon px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-maroon-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          {busy ? "Adding…" : "Add evidence"}
        </button>
      </div>
    </form>
  );
}

function DocumentRow({ doc, caseId, canReview, canRemove, showReview, ownerLabel, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  async function view() {
    setError("");
    try {
      const res = await api.get(`/cases/${caseId}/documents/${doc.id}/file`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank", "noopener");
      // Revoke shortly after the new tab has had a chance to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Could not open the file.");
    }
  }

  async function review(status, reason) {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/cases/${caseId}/documents/${doc.id}/review`, { status, note: reason });
      setSendingBack(false);
      setNote("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update this document");
    } finally {
      setBusy(false);
    }
  }

  // Archiving withdraws the document from the case. The file is kept and
  // stays listed on the Records page, so the reason is what explains its
  // absence later — and it is one-way, which is worth saying out loud.
  async function archive() {
    if (!archiveReason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/documents/${doc.id}/archive`, {
        reason: archiveReason.trim(),
      });
      setArchiving(false);
      setArchiveReason("");
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to archive this document");
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {/* Link-only evidence lives in the submitter's own storage — there is
              nothing to stream from this server, so open the URL directly. */}
          {doc.externalUrl ? (
            <a
              href={doc.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-left text-sm font-medium text-maroon hover:underline"
              title={doc.externalUrl}
            >
              {doc.fileName} ↗
            </a>
          ) : (
            <button
              onClick={view}
              className="truncate text-left text-sm font-medium text-maroon hover:underline"
              title={doc.fileName}
            >
              {doc.fileName}
            </button>
          )}
          <p className="text-xs text-neutral-400">
            {ownerLabel && <span className="font-medium text-neutral-500">{ownerLabel} · </span>}
            {new Date(doc.uploadedAt).toLocaleString()}
            {doc.externalUrl ? " · External link" : doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showReview && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                DOC_REVIEW_COLORS[doc.reviewStatus] || "bg-neutral-200 text-neutral-800"
              }`}
            >
              {docReviewLabel(doc)}
            </span>
          )}
          {canRemove && !archiving && (
            <button
              onClick={() => setArchiving(true)}
              disabled={busy}
              title="Archive document"
              aria-label="Archive document"
              className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {archiving && (
        <div className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">
            Archiving withdraws this from the case. The file is kept on the Records page, and this
            cannot be undone — say why.
          </p>
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            rows={2}
            maxLength={RETURN_NOTE_MAX}
            placeholder="Why is this being withdrawn?"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={archive}
              disabled={busy || !archiveReason.trim()}
              className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
            >
              {busy ? "Archiving…" : "Archive it"}
            </button>
            <button
              type="button"
              onClick={() => {
                setArchiving(false);
                setArchiveReason("");
              }}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Once it comes back, the filer reads the Secretariat's own words. */}
      {doc.reviewStatus === "RETURNED" && (
        <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-medium">This document was returned by the Secretariat.</p>
          {doc.reviewNote && (
            <p className="mt-1.5 whitespace-pre-line border-l-2 border-amber-300 pl-2 italic">
              {doc.reviewNote}
            </p>
          )}
        </div>
      )}

      {canReview && doc.reviewStatus !== "APPROVED" && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          {sendingBack ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                rows={3}
                placeholder="What is wrong with this document? The filer reads this."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={() => review("RETURNED", note.trim())}
                  className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
                >
                  {busy ? "Sending back…" : "Send it back"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSendingBack(false);
                    setNote("");
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => review("APPROVED")}
                className="inline-flex items-center gap-1 rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
              >
                <CheckCircleIcon className="h-3.5 w-3.5" /> Approve &amp; attach
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSendingBack(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
              >
                Send back…
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

const NOTARIZED_TYPES = new Set(["COMPLAINT", "SHOW_CAUSE_ANSWER", "RESPONDENT_ANSWER", "POSITION_PAPER"]);

// A notarized document may be up to NOTARIZED_MAX_FILES scanned pages, sent in
// one request and joined into one PDF by the server.
function NotarizedUpload({ caseId, onDone, docType, label, submitLabel, extraFields = {} }) {
  const [files, setFiles] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (files.length === 0 || !confirmed) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      appendNotarizedFiles(formData, files);
      formData.append("docType", docType);
      Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
      await api.post(`/cases/${caseId}/documents`, formData);
      setFiles([]);
      setConfirmed(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-4">
      <label className="mb-2 block text-xs font-medium text-neutral-600">{label}</label>
      <NotarizedFilePicker
        files={files}
        onChange={setFiles}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        disabled={uploading}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={files.length === 0 || !confirmed || uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          <FilePlusIcon className="h-4 w-4" />
          {uploading ? "Uploading…" : submitLabel || "Upload document"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function UploadControl(props) {
  return NOTARIZED_TYPES.has(props.docType) ? <NotarizedUpload {...props} /> : <SingleUploadControl {...props} />;
}

function SingleUploadControl({
  caseId,
  onDone,
  docType,
  maxMb,
  accept,
  label,
  extraFields = {},
  submitLabel,
  // When true, the complainant can pick and stage several files at once
  // (e.g. evidence) instead of one upload at a time. All other callers keep
  // the original single-file behavior.
  allowMultiple = false,
}) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]); // [{ key, file, name }]
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function pick(e) {
    setError("");
    const picked = Array.from(e.target.files || []);
    const tooBig = picked.filter((f) => f.size > maxMb * 1024 * 1024);
    if (tooBig.length > 0) {
      setError(
        `These files exceed the ${maxMb} MB limit and were not added: ${tooBig
          .map((f) => f.name)
          .join(", ")}`
      );
    }
    const accepted = picked
      .filter((f) => f.size <= maxMb * 1024 * 1024)
      .map((file) => ({ key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, name: file.name }));
    setFiles((prev) => (allowMultiple ? [...prev, ...accepted] : accepted.slice(0, 1)));
    // Reset so picking the same file(s) again re-triggers change.
    if (inputRef.current) inputRef.current.value = "";
  }

  function renameFile(key, name) {
    setFiles((prev) => prev.map((item) => (item.key === key ? { ...item, name } : item)));
  }

  function removeFile(key) {
    setFiles((prev) => prev.filter((item) => item.key !== key));
  }

  function clearSelection() {
    setFiles([]);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (files.length === 0) return;
    if (files.some((item) => !item.name.trim())) {
      setError("Please enter a document name for each file.");
      return;
    }
    setUploading(true);
    setError("");
    const failed = [];
    for (const item of files) {
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("fileName", item.name.trim());
        formData.append("docType", docType);
        Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
        await api.post(`/cases/${caseId}/documents`, formData);
      } catch (err) {
        // Keep the server's reason: "failed" alone leaves the person guessing.
        failed.push({ name: item.name, reason: err.response?.data?.error });
      }
    }
    setUploading(false);
    if (failed.length > 0) {
      const reasons = [...new Set(failed.map((f) => f.reason).filter(Boolean))];
      setError(
        `These files failed to upload: ${failed.map((f) => f.name).join(", ")}.${reasons.length ? ` ${reasons.join(" ")}` : ""}`
      );
      const failedNames = new Set(failed.map((f) => f.name));
      setFiles((prev) => prev.filter((item) => failedNames.has(item.name)));
    } else {
      clearSelection();
    }
    onDone();
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-4">
      <label className="mb-2 block text-xs font-medium text-neutral-600">{label}</label>
      <input
        ref={inputRef}
        type="file"
        multiple={allowMultiple}
        accept={accept}
        onChange={pick}
        className="block w-full max-w-xs text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-maroon/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-maroon hover:file:bg-maroon/20"
      />

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((item) => (
            <div
              key={item.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2"
            >
              <input
                type="text"
                value={item.name}
                maxLength={200}
                onChange={(e) => renameFile(item.key, e.target.value)}
                aria-label={`Name for ${item.file.name}`}
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              />
              <span className="whitespace-nowrap text-xs text-neutral-400">
                {formatFileSize(item.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(item.key)}
                disabled={uploading}
                title="Remove file"
                aria-label={`Remove ${item.file.name}`}
                className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={files.length === 0 || uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          <FilePlusIcon className="h-4 w-4" />
          {uploading
            ? "Uploading…"
            : submitLabel ||
              (docType === "EVIDENCE"
                ? `Upload evidence${files.length > 1 ? ` (${files.length})` : ""}`
                : "Upload document")}
        </button>
        {files.length > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            disabled={uploading}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
