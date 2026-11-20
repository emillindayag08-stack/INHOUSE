import { respondentLabel, respondentView, visibleRespondentRows } from "../lib/caseRespondents.js";
import { useState } from "react";
import { api } from "../api/client.js";
import { OFFENSE_CLASSIFICATION_LABELS, OFFENSE_CLASSIFICATION_COLORS } from "../lib/constants.js";
import { CODI_STAFF_ROLES } from "../lib/caseRole.js";
import { offenseBasisFor } from "../lib/offenseBasis.js";

// Mirrors the server's gating in cases.routes.js. Each Committee member votes
// the offense level right after their prima facie vote (ANSWER_SUBMITTED), and
// may change it any time until the case concludes.
const PRE_SCORING_STATUSES = new Set([
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "VERIFIED",
  "SHOW_CAUSE_PENDING_APPROVAL",
  "SHOW_CAUSE_APPROVED",
  "SHOW_CAUSE_ISSUED",
  "ANSWER_UNDER_REVIEW",
  "PRIMA_FACIE_NOT_FOUND",
]);
const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

// Least to most serious. Mirrors OFFENSE_LEVELS in
// server/src/services/riskScoringService.js.
const OFFENSE_LEVELS = ["LIGHT", "LESS_GRAVE", "GRAVE"];

const LEVEL_DOT = { LIGHT: "bg-green-500", LESS_GRAVE: "bg-amber-400", GRAVE: "bg-red-500" };

// Each member's most recent vote, oldest member first. Mirrors
// committeeClassification() on the server.
export function latestAssessmentsByMember(assessments = []) {
  const byMember = new Map();
  for (const a of assessments) {
    const prev = byMember.get(a.evaluatedById);
    if (!prev || new Date(a.evaluatedAt) >= new Date(prev.evaluatedAt)) byMember.set(a.evaluatedById, a);
  }
  return [...byMember.values()];
}

// The level with the most votes. A tie has none: the Committee settles it and
// the Secretariat sets the final level.
export function panelClassification(assessments = []) {
  const latest = latestAssessmentsByMember(assessments);
  if (latest.length === 0) return null;
  const counts = Object.fromEntries(OFFENSE_LEVELS.map((level) => [level, 0]));
  for (const a of latest) counts[a.classification] += 1;
  const most = Math.max(...Object.values(counts));
  const leaders = OFFENSE_LEVELS.filter((level) => counts[level] === most);
  const tied = leaders.length > 1;
  return { memberCount: latest.length, counts, tied, classification: tied ? null : leaders[0] };
}

// The final level set over the panel's vote, if it still stands: the latest
// vote carries it, or the vote is tied and a level was set for the tie.
// Mirrors recomputeRespondentClassification() on the server.
export function standingOverride(assessments = []) {
  const latest = assessments[assessments.length - 1];
  if (latest?.overrideClassification) return latest;
  if (!panelClassification(assessments)?.tied) return null;
  const overridden = assessments.filter((a) => a.overriddenAt);
  overridden.sort((a, b) => new Date(a.overriddenAt) - new Date(b.overriddenAt));
  return overridden[overridden.length - 1] || null;
}

function isEligible(caseDetail) {
  return !PRE_SCORING_STATUSES.has(caseDetail.status) && !TERMINAL_STATUSES.has(caseDetail.status);
}

// Committee members and the Chairperson both vote on the prima facie
// question and, once it's found, the offense level.
const VOTING_ROLES = new Set(["COMMITTEE", "CHAIRPERSON"]);

// Whether this panel would render anything for the given user. Exported so
// CaseDetailPage can decide whether to offer the Risk assessment tab at all.
export function hasRiskAssessmentContent(caseDetail, user) {
  const assessments = caseDetail.riskAssessments || [];
  // Committee deliberation, staff only. Tested positively so a new role value
  // can never quietly open it to the parties.
  if (!CODI_STAFF_ROLES.has(user.role)) return false;
  return assessments.length > 0 || (VOTING_ROLES.has(user.role) && isEligible(caseDetail));
}

// Which respondent's tab to open first. Set by the vote card just before it
// sends the member here, so the offense vote lands on the respondent they just voted on.
let focusedRespondentId = null;
export const focusRiskRespondent = (rowId) => {
  focusedRespondentId = rowId || null;
};

// With one respondent this is the panel as it always was. With several, each is
// classified separately, so each has a tab of their own.
export default function CaseRiskAssessmentPanel({ caseDetail, user, onDone }) {
  const rows = visibleRespondentRows(caseDetail);
  const [activeId, setActiveId] = useState(() => {
    const wanted = focusedRespondentId;
    focusedRespondentId = null;
    return wanted;
  });

  if (rows.length <= 1) {
    return <RiskAssessmentSection caseDetail={respondentView(caseDetail, rows[0] || null)} user={user} onDone={onDone} />;
  }

  const current = rows.find((r) => r.id === activeId) || rows[0];
  return (
    <div>
      <div role="tablist" aria-label="Respondents" className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {rows.map((row) => (
          <button
            key={row.id}
            role="tab"
            aria-selected={row.id === current.id}
            onClick={() => setActiveId(row.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              row.id === current.id
                ? "border-maroon text-maroon"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
            }`}
          >
            {respondentLabel(row)}
            {row.primaFacieFound === false && (
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[0.65rem] font-medium text-neutral-600">
                cleared
              </span>
            )}
          </button>
        ))}
      </div>
      <RiskAssessmentSection
        key={current.id}
        caseDetail={respondentView(caseDetail, current)}
        user={user}
        onDone={onDone}
        heading={respondentLabel(current)}
      />
    </div>
  );
}

function RiskAssessmentSection({ caseDetail, user, onDone, heading = null }) {
  const row = caseDetail.respondentRow || null;
  // A respondent the Committee found no prima facie case against has nothing to score.
  const cleared = row?.primaFacieFound === false;
  const assessments = caseDetail.riskAssessments || [];
  const latest = assessments[assessments.length - 1];
  const override = standingOverride(assessments);
  const tied = !!panelClassification(assessments)?.tied;
  const eligible = isEligible(caseDetail);
  const atVotingStage = caseDetail.status === "ANSWER_SUBMITTED";
  const myVote = (caseDetail.primaFacieVotes || []).find((v) => v.voterId === user.id);
  const hasVoted = !!myVote;
  // A "no prima facie case" vote or an abstention needs no risk assessment.
  const votedNo = !!myVote && !myVote.found;
  const myLatest = latestAssessmentsByMember(assessments).find((a) => a.evaluatedById === user.id);
  const canScore = VOTING_ROLES.has(user.role) && eligible && !cleared && !votedNo && (!atVotingStage || hasVoted);
  // After the finding is confirmed the Committee and Chairperson may override;
  // before it, the Secretariat may change the offense level.
  const canOverride =
    eligible &&
    !cleared &&
    !!latest &&
    (atVotingStage
      ? user.role === "SECRETARIAT"
      : user.role === "COMMITTEE" || user.role === "CHAIRPERSON");

  if (!hasRiskAssessmentContent(caseDetail, user)) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-neutral-800">
        Risk assessment{heading ? ` — ${heading}` : ""}
      </h2>
      {cleared && (
        <p className="mb-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          No prima facie case was found against this respondent, so the case does not proceed
          against them.
        </p>
      )}
      <p className="mb-2 text-xs text-neutral-500">
        Committee members who find a prima facie case then vote whether it is a light, less grave or
        grave offense; a “no prima facie case” vote needs no offense vote. The case is classified on
        the level with the most votes.
      </p>
      <details className="mb-3 text-xs text-neutral-500">
        <summary className="cursor-pointer font-medium text-neutral-600 hover:underline">
          How the classification is decided
        </summary>
        <p className="mt-1.5">
          Each member's latest vote counts once. If the vote is tied, the Committee settles the level
          among themselves and the Secretariat records it as the final offense level. The CODI
          Committee retains full authority to review, adjust, or override the result based on
          contextual factors, professional judgment, and the applicable provisions of the BulSU
          Anti-GBSH Code and RACCS 2025.
        </p>
      </details>

      <ClassificationBasis framework={caseDetail.governingFramework} />

      <PanelScoreCard caseDetail={caseDetail} />

      {override && <OverrideSummary assessment={override} />}

      {tied && !override && eligible && !cleared && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {user.role === "SECRETARIAT" && atVotingStage
            ? "The offense-level vote is tied. Once the Committee has agreed on the level, set it as the final offense level below."
            : "The offense-level vote is tied. The Secretariat sets the final offense level once the Committee has agreed on it."}
        </p>
      )}

      {VOTING_ROLES.has(user.role) && eligible && atVotingStage && !hasVoted && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Cast your prima facie vote first. The offense vote opens right after.
        </p>
      )}

      {VOTING_ROLES.has(user.role) && eligible && votedNo && (
        <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          {myVote?.found === null
            ? "You abstained on the prima facie question, so there's no offense vote for you to cast."
            : "You voted that there is no prima facie case, so there's no offense vote for you to cast."}
        </p>
      )}

      {canScore && (
        <div className="mt-4">
          <RiskScoreForm
            caseId={caseDetail.id}
            respondentRowId={row?.id}
            existing={myLatest}
            startOpen={!myLatest}
            onDone={onDone}
          />
        </div>
      )}

      {canOverride && (
        <OverrideForm
          caseId={caseDetail.id}
          assessment={latest}
          current={
            override?.overrideClassification ??
            // A Committee member holds only their own vote, so the case's level is the panel's.
            (caseDetail.primaFacieVoteCounts ? caseDetail.offenseClassification : panelClassification(assessments)?.classification)
          }
          startOpen={tied && !override && user.role === "SECRETARIAT"}
          onDone={onDone}
        />
      )}
    </section>
  );
}

const LEVEL_HEADING = { LIGHT: "Light offenses", LESS_GRAVE: "Less grave offenses", GRAVE: "Grave offenses" };

// The legal basis for each offense level under the case's governing
// framework, so a vote is grounded in the actual text of the BulSU Anti-GBSH
// Code or RACCS 2025 rather than being a bare choice.
export function ClassificationBasis({ framework }) {
  const basis = offenseBasisFor(framework);
  if (!basis) return null;
  return (
    <details className="mb-3 text-xs text-neutral-600">
      <summary className="cursor-pointer font-medium text-neutral-700 hover:underline">
        Basis for classifying the offense ({basis.source})
      </summary>
      <div className="mt-2 space-y-3">
        {OFFENSE_LEVELS.map((level) => (
          <div key={level}>
            <p className="font-medium text-neutral-700">
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} />
              {LEVEL_HEADING[level]}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {basis[level].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        {basis.note && <p className="italic text-neutral-500">{basis.note}</p>}
      </div>
    </details>
  );
}

// The panel's classification and vote tally, then each member's own vote.
// A Committee member is sent only their own offense vote (the server marks
// that with primaFacieVoteCounts), so they see that and, once the Secretariat
// has confirmed the finding, the level the case was classified at.
export function PanelScoreCard({ caseDetail, compact = false }) {
  if (caseDetail.primaFacieVoteCounts) return <OwnScoreCard caseDetail={caseDetail} />;
  const assessments = caseDetail.riskAssessments || [];
  const members = latestAssessmentsByMember(assessments);
  const panel = panelClassification(assessments);
  const votes = caseDetail.primaFacieVotes || [];
  const total = votes.length
    ? votes.filter((v) => v.found).length
    : caseDetail.committeeMemberCount ?? members.length;

  if (!panel) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-xs text-neutral-500">
        No Committee member has voted on the offense level yet.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Committee classification</p>
          {panel.tied ? (
            <span className="mt-1 inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-1 text-sm font-medium text-neutral-700">
              Tied
            </span>
          ) : (
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${OFFENSE_CLASSIFICATION_COLORS[panel.classification]}`}
            >
              {OFFENSE_CLASSIFICATION_LABELS[panel.classification]}
            </span>
          )}
        </div>
        <p className="text-right text-xs text-neutral-500">
          {panel.memberCount} of {total} voting member{total === 1 ? "" : "s"} voted
          {panel.tied ? " · the Secretariat sets the final level" : ""}
        </p>
      </div>
      <VoteTally counts={panel.counts} />

      {!compact && (
        <ul className="mt-4 divide-y divide-neutral-200 border-t border-neutral-200">
          {members.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm font-medium text-neutral-700">
                {a.evaluatedBy?.fullName || "Committee member"}
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  {new Date(a.evaluatedAt).toLocaleDateString()}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OFFENSE_CLASSIFICATION_COLORS[a.classification]}`}>
                {OFFENSE_CLASSIFICATION_LABELS[a.classification]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnScoreCard({ caseDetail }) {
  const [mine] = latestAssessmentsByMember(caseDetail.riskAssessments || []);
  const level = caseDetail.offenseClassification;
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Your offense vote</p>
          {mine ? (
            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${OFFENSE_CLASSIFICATION_COLORS[mine.classification]}`}>
              {OFFENSE_CLASSIFICATION_LABELS[mine.classification]}
            </span>
          ) : (
            <p className="mt-1 text-sm text-neutral-500">Not cast</p>
          )}
        </div>
        {level && (
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Classified as</p>
            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${OFFENSE_CLASSIFICATION_COLORS[level]}`}>
              {OFFENSE_CLASSIFICATION_LABELS[level]}
            </span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Each member's offense vote is private: you see only your own.
        {level ? "" : " The level the case is classified at shows here once the Secretariat confirms the finding."}
      </p>
    </div>
  );
}

// How many members voted for each level.
function VoteTally({ counts }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {OFFENSE_LEVELS.map((level) => (
        <div key={level} className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-500">
            <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} />
            {OFFENSE_CLASSIFICATION_LABELS[level].replace(" Offense", "")}
          </p>
          <p className="text-lg font-bold tabular-nums text-neutral-900">{counts[level]}</p>
        </div>
      ))}
    </div>
  );
}

function OverrideSummary({ assessment }) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-700">Final offense level:</span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${OFFENSE_CLASSIFICATION_COLORS[assessment.overrideClassification]}`}
        >
          {OFFENSE_CLASSIFICATION_LABELS[assessment.overrideClassification]}
        </span>
      </div>
      <p className="text-xs text-neutral-600">
        <span className="font-medium text-neutral-700">Justification:</span> {assessment.overrideJustification}
      </p>
      <p className="text-xs text-neutral-400">
        Set by {assessment.overriddenBy?.fullName} · {new Date(assessment.overriddenAt).toLocaleDateString()}
      </p>
    </div>
  );
}

// The offense-level vote, in the Risk assessment tab. `existing` is this
// member's current vote, if any.
export function RiskScoreForm({ caseId, respondentRowId, existing, startOpen = true, onDone, submitLabel }) {
  const [open, setOpen] = useState(startOpen);
  const [level, setLevel] = useState(existing?.classification ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!level) {
      setError("Choose an offense level first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/risk-assessment`, { respondentRowId, classification: level });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to record your vote");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-neutral-200 p-3">
        {existing && (
          <p className="text-sm text-neutral-700">
            Your vote:{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${OFFENSE_CLASSIFICATION_COLORS[existing.classification]}`}>
              {OFFENSE_CLASSIFICATION_LABELS[existing.classification]}
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
        >
          {existing ? "Change my vote" : "Vote on the offense level"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-neutral-800">What offense is this?</legend>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {OFFENSE_LEVELS.map((value) => {
            const selected = level === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  selected ? "border-maroon bg-maroon/5 ring-1 ring-maroon" : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <input
                  type="radio"
                  name={`offense-level-${respondentRowId ?? caseId}`}
                  className="accent-maroon"
                  checked={selected}
                  onChange={() => setLevel(value)}
                />
                <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[value]}`} />
                <span className="text-neutral-800">{OFFENSE_CLASSIFICATION_LABELS[value]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !level}
            className="rounded-md bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
          >
            {submitting ? "Saving…" : submitLabel || (existing ? "Update my vote" : "Submit my vote")}
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

const CLASSIFICATION_OPTIONS = ["LIGHT", "LESS_GRAVE", "GRAVE"];

// `current` is the level in force now (null while a tied vote is unsettled).
function OverrideForm({ caseId, assessment, current, startOpen = false, onDone }) {
  const alreadyOverridden = !!assessment.overrideClassification;
  const [open, setOpen] = useState(startOpen);
  const [classification, setClassification] = useState(current || "");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!classification) {
      setError("Choose the final offense level.");
      return;
    }
    if (!justification.trim()) {
      setError("A justification is required to set the offense level.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/risk-assessment/${assessment.id}/override`, {
        classification,
        justification: justification.trim(),
      });
      setJustification("");
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to override the classification");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
      >
        {!current ? "Set the final offense level" : alreadyOverridden ? "Change the offense level again" : "Change the offense level"}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-neutral-300 p-4">
      <p className="mb-2 text-xs font-medium text-neutral-600">
        {current ? "Change the offense level" : "Set the final offense level"}
      </p>
      <select
        value={classification}
        onChange={(e) => setClassification(e.target.value)}
        className="mb-3 w-full max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
      >
        {!classification && (
          <option value="" disabled>
            Choose a level…
          </option>
        )}
        {CLASSIFICATION_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {OFFENSE_CLASSIFICATION_LABELS[c]}
          </option>
        ))}
      </select>
      <textarea
        required
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        rows={3}
        placeholder="Justification for this decision (contextual factors, professional judgment, applicable provisions of the BulSU Anti-GBSH Code or RACCS 2025)"
        className="mb-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-maroon px-4 py-1.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save final offense level"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-600 hover:border-maroon hover:bg-maroon hover:text-white"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
