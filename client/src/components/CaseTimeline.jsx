import { DECISION_OUTCOME_LABELS, OFFENSE_CLASSIFICATION_LABELS, PATHWAY_LABELS } from "../lib/constants.js";

// Decision logging: every event below carries a "by" — the CODI member
// responsible for that decision — alongside its timestamp, sourced from the
// FK relations CASE_DETAIL_INCLUDE resolves in cases.routes.js. Hearings are
// the one exception: the schema doesn't record who scheduled one.
//
// Deliberately label-only: the body text behind each event (the complaint
// description, a rationale, hearing notes) already has its own panel on the
// case page, so repeating it here just buried the audit trail in prose.
function buildEvents(caseDetail) {
  const events = [];

  events.push({
    at: caseDetail.filedAt,
    label: "Complaint filed",
    by: caseDetail.complainant?.fullName,
  });

  caseDetail.showCauseOrders?.forEach((o) => {
    events.push({
      at: o.issuedAt,
      label: "Show-cause order drafted and sent to Chairperson",
      by: o.issuedBy?.fullName,
    });
    if ((o.status === "APPROVED" || o.status === "SERVED") && o.reviewedAt) {
      events.push({
        at: o.reviewedAt,
        label: "Show-cause order approved by Chairperson",
        by: o.reviewedBy?.fullName,
      });
    }
    if (o.status === "SERVED" && o.servedAt) {
      events.push({
        at: o.servedAt,
        label: "Show-cause order served on respondent",
        by: o.servedBy?.fullName,
      });
    }
    if (o.status === "RETURNED" && o.reviewedAt) {
      events.push({
        at: o.reviewedAt,
        label: "Show-cause order returned for revision",
        by: o.reviewedBy?.fullName,
      });
    }
  });
  // Which respondent an answer belongs to, when the case names several.
  const respondentNameFor = (c, answer) => {
    const row = (c.respondents || []).find((r) => r.id === answer.respondentRowId);
    return row
      ? row.user?.fullName || row.claimedName
      : c.respondentUser?.fullName || c.claimedRespondentName;
  };
  caseDetail.respondentAnswers?.forEach((a) =>
    events.push({
      at: a.submittedAt,
      label:
        a.stage === "FORMAL_CHARGE"
          ? "Respondent submitted formal written answer"
          : "Respondent answered the show-cause order",
      by: respondentNameFor(caseDetail, a),
    })
  );
  // The Secretariat's review of what a party filed: approved onto the case
  // record, or sent back. Read off the document rather than a dedicated table —
  // reviewStatus/reviewedAt is where that review is recorded. No "by":
  // Document stores reviewedById but the schema has no relation to resolve it
  // to a name.
  const REVIEWED_DOC_LABELS = {
    COMPLAINT: "Notarized complaint",
    SHOW_CAUSE_ANSWER: "Response to the show-cause order",
    RESPONDENT_ANSWER: "Formal written answer",
    POSITION_PAPER: "Position paper",
  };
  caseDetail.documents
    ?.filter((d) => REVIEWED_DOC_LABELS[d.docType] && d.reviewedAt && d.reviewStatus !== "PENDING")
    .forEach((d) =>
      events.push({
        at: d.reviewedAt,
        label: `${REVIEWED_DOC_LABELS[d.docType]} ${
          d.reviewStatus === "APPROVED" ? "approved by the Secretariat" : "sent back by the Secretariat"
        }`,
        by: null,
      })
    );
  caseDetail.respondentAnswers?.forEach((a) => {
    if (!a.returnedAt) return;
    events.push({
      at: a.returnedAt,
      label: `Response returned by the Secretariat — ${[
        (a.returnReason || "").includes("NOTARIZATION") && "not notarized",
        (a.returnReason || "").includes("CONTENT") && "content",
      ]
        .filter(Boolean)
        .join(" and ")}`,
      by: a.returnedBy?.fullName,
    });
  });
  caseDetail.primaFacieEvals?.forEach((p) =>
    events.push({
      at: p.evaluatedAt,
      label: p.found ? "Prima facie case found" : "No prima facie case found",
      by: p.evaluatedBy?.fullName,
    })
  );
  caseDetail.riskAssessments?.forEach((r) => {
    events.push({
      at: r.evaluatedAt,
      label: `Risk classification recorded: ${OFFENSE_CLASSIFICATION_LABELS[r.classification] || r.classification}`,
      by: r.evaluatedBy?.fullName,
    });
    if (r.overriddenAt) {
      events.push({
        at: r.overriddenAt,
        label: `Risk classification overridden to ${
          OFFENSE_CLASSIFICATION_LABELS[r.overrideClassification] || r.overrideClassification
        }`,
        by: r.overriddenBy?.fullName,
      });
    }
  });
  caseDetail.formalCharges?.forEach((f) =>
    events.push({
      at: f.issuedAt,
      label: "Formal charge sent",
      by: f.issuedBy?.fullName,
    })
  );
  if (caseDetail.complainantPathwayChosenAt) {
    events.push({
      at: caseDetail.complainantPathwayChosenAt,
      label: `Complainant chose the ${PATHWAY_LABELS[caseDetail.complainantPathwayChoice] || "—"} pathway`,
      by: caseDetail.complainant?.fullName,
    });
  }
  if (caseDetail.pathwayRecommendedAt) {
    events.push({
      at: caseDetail.pathwayRecommendedAt,
      label: `Secretariat set the final pathway to ${PATHWAY_LABELS[caseDetail.finalPathway] || "—"}`,
      by: caseDetail.pathwayRecommendedBy?.fullName,
    });
  }
  caseDetail.hearings?.forEach((h) =>
    events.push({
      at: h.createdAt,
      label: `Hearing scheduled for ${new Date(h.scheduledAt).toLocaleString()}`,
      by: null,
    })
  );
  caseDetail.deliberations?.forEach((d) =>
    events.push({
      at: d.recordedAt,
      label: "Deliberation recorded",
      by: d.recordedBy?.fullName,
    })
  );
  if (caseDetail.decision) {
    events.push({
      at: caseDetail.decision.decidedAt,
      label: `President's decision: ${DECISION_OUTCOME_LABELS[caseDetail.decision.outcome] || caseDetail.decision.outcome}`,
      by: caseDetail.decision.decidedBy?.fullName,
    });
  }

  // Newest first, so the latest activity is visible without scrolling past
  // the whole history of a mature case.
  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export default function CaseTimeline({ caseDetail }) {
  const events = buildEvents(caseDetail);

  return (
    <ol className="space-y-3">
      {events.map((event, idx) => (
        <li key={idx} className="relative border-l-2 border-maroon/20 pl-4">
          <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-maroon" />
          <p className="text-sm font-medium text-neutral-900">{event.label}</p>
          <p className="text-xs text-neutral-500">
            {new Date(event.at).toLocaleString()}
            {event.by && ` · by ${event.by}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
