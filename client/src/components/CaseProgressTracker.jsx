import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge.jsx";
import { PageArrow } from "./Pagination.jsx";
import { ClockIcon, FilePlusIcon } from "./icons.jsx";
import { CASE_SIDE_LABELS, caseLabel, caseLabelPrefix } from "../lib/constants.js";
import {
  CLOSED_STATUSES,
  caseProgress,
  displayPhase,
  progressHidden,
  waitingOn,
  windowClosed,
  yourTurn,
} from "../lib/caseProgress.js";

// Where a university member's cases stand, on their dashboard: how far each
// open case has come, and what they owe next. Replaces the static "Your role"
// card, which said the same thing on the day you filed and the day you were
// decided.

// One case at a time: someone on several cases pages between them rather than
// scrolling past a stack of them to reach the rest of the dashboard.
const PER_PAGE = 1;

const SIDE_PILL = {
  COMPLAINANT: "bg-blue-100 text-blue-800",
  RESPONDENT: "bg-purple-100 text-purple-800",
};

// Marker styling per stage state. State is carried by the glyph and by the
// screen-reader text as well, never by colour alone.
const MARKER = {
  done: "bg-green-600 text-white",
  current: "bg-maroon text-white ring-2 ring-maroon/20",
  upcoming: "bg-neutral-200 text-neutral-600",
  stopped: "bg-neutral-700 text-white",
};
const MARKER_GLYPH = { done: "✓", stopped: "×" };
const STATE_SUFFIX = {
  done: "completed",
  current: "current step",
  upcoming: "not started",
  stopped: "the case closed at this step",
};

const URGENCY_CHIP = {
  overdue: "border-red-300 bg-red-50 text-red-700",
  soon: "border-amber-300 bg-amber-50 text-amber-800",
  later: "border-neutral-300 bg-neutral-100 text-neutral-700",
  done: "border-green-300 bg-green-50 text-green-700",
};

export default function CaseProgressTracker({ cases, user, loading }) {
  const mine = (cases || []).filter((c) => c.yourSide);
  const open = mine.filter((c) => !CLOSED_STATUSES.has(c.status));
  const pageCount = Math.max(1, Math.ceil(open.length / PER_PAGE));
  const [page, setPage] = useState(1);
  // A case closing while the last page is open would otherwise strand the
  // viewer on a page that no longer exists.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;
  const shown = open.slice(start, start + PER_PAGE);

  if (loading) {
    return (
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading your cases…</p>
      </section>
    );
  }

  if (open.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
        <h2 className="text-sm font-bold text-neutral-800">Nothing needs you right now</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-neutral-500">
          When you file a complaint — or when one is filed against you — this is where you'll see
          what stage it has reached and what you need to do next.
          {mine.length > 0 && " Your closed cases are listed below."}
        </p>
        <Link
          to="/complaints/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-maroon-light"
        >
          <FilePlusIcon className="h-4 w-4" /> File a complaint
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-neutral-800">Where your cases stand</h2>
        {open.length > PER_PAGE && (
          <p className="text-xs text-neutral-500">
            Case {current} of {open.length}
          </p>
        )}
      </div>
      {/* The arrows sit inside the card, at its edges, so the card is as wide as
          everything below it. The card keeps side padding for them. */}
      <div className="relative space-y-3">
        {shown.map((c) => (
          <CaseProgressCard key={c.id} caseRow={c} user={user} paged={pageCount > 1} />
        ))}
        {pageCount > 1 && (
          <>
            <PageArrow
              direction="left"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
            />
            <PageArrow
              direction="right"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
            />
          </>
        )}
      </div>
    </section>
  );
}

function CaseProgressCard({ caseRow, user, paged = false }) {
  const { stages, currentIndex, total } = caseProgress(caseRow);
  const turn = yourTurn(caseRow, user);
  const needsYou = Boolean(turn) && turn.tone !== "info";
  const currentStage = stages.find((s) => s.index === currentIndex) || stages[0];
  const hidden = progressHidden(caseRow);

  return (
    <article
      className={`rounded-xl bg-white py-5 shadow-sm ${paged ? "px-16" : "px-5"} ${
        needsYou ? "border border-maroon ring-2 ring-maroon/20" : "border border-neutral-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/cases/${caseRow.id}`} className="font-medium text-maroon hover:underline">
            {caseLabelPrefix(caseRow)} {caseLabel(caseRow)}
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              SIDE_PILL[caseRow.yourSide] || "bg-neutral-100 text-neutral-700"
            }`}
          >
            {CASE_SIDE_LABELS[caseRow.yourSide] || caseRow.yourSide}
          </span>
        </div>
        <StatusBadge phase={displayPhase(caseRow)} />
      </div>
      <p className="mt-0.5 break-words text-xs text-neutral-500">
        Filed{" "}
        {new Date(caseRow.filedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        {caseRow.yourSide === "COMPLAINANT"
          ? ` · against ${caseRow.respondentUser?.fullName || caseRow.claimedRespondentName || "someone not yet confirmed"}${
              (caseRow.respondents?.length ?? 0) > 1 ? ` and ${caseRow.respondents.length - 1} other${caseRow.respondents.length > 2 ? "s" : ""}` : ""
            }`
          : ""}
      </p>

      {hidden ? (
        <VerifiedLine />
      ) : (
        <>
          <StageStrip stages={stages} />
          <p className="mt-2 text-xs text-neutral-500">
            Step {currentIndex} of {total} · {currentStage.label}
          </p>

          {turn ? <TurnLine turn={turn} caseRow={caseRow} /> : <WaitingLine caseRow={caseRow} />}
        </>
      )}
    </article>
  );
}

function StageStrip({ stages }) {
  return (
    <ol aria-label="Case progress" className="mt-4 flex items-start">
      {stages.map((stage, i) => (
        <li
          key={stage.key}
          aria-current={stage.state === "current" ? "step" : undefined}
          className={`flex items-start ${i === stages.length - 1 ? "" : "flex-1"}`}
        >
          <div className="flex flex-col items-center lg:w-full">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${MARKER[stage.state]}`}
            >
              {MARKER_GLYPH[stage.state] || stage.index}
            </span>
            <span className="sr-only">
              Step {stage.index} of {stages.length}: {stage.label} — {STATE_SUFFIX[stage.state]}
            </span>
            <span
              className={`mt-1 hidden text-center text-xs lg:block ${
                stage.state === "current" ? "font-medium text-neutral-800" : "text-neutral-500"
              }`}
            >
              {stage.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <span
              aria-hidden="true"
              className={`mt-2.5 h-0.5 flex-1 ${
                stage.state === "done" ? "bg-green-600" : "bg-neutral-200"
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function TurnLine({ turn, caseRow }) {
  const isInfo = turn.tone === "info";
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-neutral-700">
          <span className={`font-medium ${isInfo ? "text-neutral-800" : "text-maroon"}`}>
            {isInfo ? "Coming up: " : "Your turn: "}
          </span>
          {turn.title}
        </p>
        {turn.urgency && (
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${
              URGENCY_CHIP[turn.tone] || URGENCY_CHIP.later
            }`}
          >
            {turn.urgency}
          </span>
        )}
        <Link
          to={turn.href}
          aria-label={`${turn.cta} for ${caseLabel(caseRow)}`}
          className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light"
        >
          {turn.cta}
        </Link>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{turn.detail}</p>
    </div>
  );
}

function VerifiedLine() {
  return (
    <p className="mt-4 flex items-start gap-2 border-t border-neutral-100 pt-3 text-sm text-neutral-500">
      <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
      <span>
        <span className="font-medium text-neutral-600">Your complaint has been verified and is now with CODI.</span>
      </span>
    </p>
  );
}

function WaitingLine({ caseRow }) {
  if (windowClosed(caseRow)) {
    return (
      <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-500">
        Your window to answer has closed. CODI will proceed on the records it already has.
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-start gap-2 border-t border-neutral-100 pt-3 text-sm text-neutral-500">
      <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
      <span>
        <span className="font-medium text-neutral-600">Waiting on CODI — </span>
        {waitingOn(caseRow)}
      </span>
    </p>
  );
}
