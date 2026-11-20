import { useState } from "react";
import { api } from "../api/client.js";
import { CalendarIcon, CheckCircleIcon } from "./icons.jsx";

// Mirrors the server's gating in scheduling.routes.js: meeting slots can only
// be proposed once the respondent has answered, and not once the case has
// concluded.
const PRE_ANSWER_STATUSES = new Set([
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "VERIFIED",
  "SHOW_CAUSE_PENDING_APPROVAL",
  "SHOW_CAUSE_APPROVED",
  "SHOW_CAUSE_ISSUED",
  "ANSWER_UNDER_REVIEW",
]);
const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

// Mirrors the server's quorum in scheduling.routes.js — a slot needs this
// many votes before it can be confirmed, for either meeting type.
const MIN_SLOT_VOTES_TO_FINALIZE = 5;

const ROUND_STATUS_LABELS = {
  PROPOSED: "Awaiting votes",
  FINALIZED: "Confirmed",
  SUPERSEDED: "Superseded",
};
const ROUND_STATUS_COLORS = {
  PROPOSED: "bg-amber-100 text-amber-800",
  FINALIZED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-neutral-200 text-neutral-600",
};

function formatSlot(date) {
  return new Date(date).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function voterNames(slot) {
  return slot.votes.map((v) => v.voter.fullName).join(", ");
}

function voteCountLabel(slot) {
  return `${slot.votes.length} ${slot.votes.length === 1 ? "vote" : "votes"}`;
}

// Hover text naming who marked themselves available. Uses the native `title`
// attribute, matching how tooltips are done elsewhere in the app (see
// CaseAnalytics.jsx and CalendarPage.jsx) — no tooltip library needed.
function availabilityTooltip(slot) {
  return slot.votes.length === 0
    ? "No one has marked availability for this slot yet"
    : `Available: ${voterNames(slot)}`;
}

// The same calendar serves two things. A meeting round is just announced once
// confirmed; a hearing round becomes the hearing itself, so the Secretariat
// also says how it will be held when they confirm the slot.
const COPY = {
  COMMITTEE_MEETING: {
    heading: "Collab calendar",
    blurb:
      "Propose candidate meeting times for the Committee and Chairperson, or mark your own availability once slots are proposed.",
    confirmed: "Meeting confirmed for",
    empty: "No meeting proposed yet.",
    noun: "meeting",
  },
  HEARING: {
    heading: "Collab calendar — hearing",
    blurb:
      "Propose candidate hearing times for the Committee and Chairperson, or mark your own availability once slots are proposed. Confirming a slot schedules the hearing.",
    confirmed: "Hearing confirmed for",
    empty: "No hearing proposed yet.",
    noun: "hearing",
  },
};

export default function CaseSchedulingPanel({ caseDetail, user, onDone, purpose = "COMMITTEE_MEETING" }) {
  const copy = COPY[purpose] || COPY.COMMITTEE_MEETING;
  // Rounds carry what they are for; older rows predate that and are meetings.
  const rounds = (caseDetail.schedulingRounds || []).filter(
    (r) => (r.purpose || "COMMITTEE_MEETING") === purpose
  );
  const activeRound = rounds.find((r) => r.status === "PROPOSED");
  const latestFinalized = rounds.find((r) => r.status === "FINALIZED");
  // Hearings are only scheduled while the investigation is actually running:
  // once it ends the calendar has nothing left to arrange.
  const canSchedule =
    purpose === "HEARING"
      ? caseDetail.finalPathway === "FORMAL_INVESTIGATION" &&
        (caseDetail.status === "FORMAL_CHARGE_ISSUED" || caseDetail.status === "HEARING_SCHEDULED")
      : !PRE_ANSWER_STATUSES.has(caseDetail.status) && !TERMINAL_STATUSES.has(caseDetail.status);

  const isSecretariat = user.role === "SECRETARIAT";
  const isVoter = user.role === "COMMITTEE" || user.role === "CHAIRPERSON";

  if (!isSecretariat && !isVoter) {
    if (!latestFinalized) return null;
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <ConfirmedBanner round={latestFinalized} copy={copy} />
      </section>
    );
  }

  if (!isSecretariat && !activeRound && !latestFinalized) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-neutral-800">
        <CalendarIcon className="h-4 w-4 text-maroon" />
        {copy.heading}
      </h2>
      <p className="mb-4 text-xs text-neutral-500">{copy.blurb}</p>

      {latestFinalized && <ConfirmedBanner round={latestFinalized} copy={copy} />}

      {isSecretariat && canSchedule && (
        <ProposeForm
          caseId={caseDetail.id}
          hasActiveRound={!!activeRound}
          purpose={purpose}
          copy={copy}
          onDone={onDone}
        />
      )}

      {activeRound &&
        (isSecretariat ? (
          <TallyView
            caseId={caseDetail.id}
            round={activeRound}
            purpose={purpose}
            copy={copy}
            onDone={onDone}
          />
        ) : (
          <VoteForm caseId={caseDetail.id} round={activeRound} user={user} onDone={onDone} />
        ))}

      {!activeRound && !latestFinalized && !isSecretariat && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-center text-sm text-neutral-500">
          {copy.empty}
        </p>
      )}
    </section>
  );
}

function ConfirmedBanner({ round, copy = COPY.COMMITTEE_MEETING }) {
  const hearingType =
    round.hearing?.type === "PRE_TRIAL" ? "Pre-Trial hearing" : round.hearing ? "Trial hearing" : null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
      <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>
        {hearingType ? `${hearingType} confirmed for` : copy.confirmed}{" "}
        <strong>{formatSlot(round.finalizedSlot.startAt)}</strong>.
      </span>
    </div>
  );
}

function ProposeForm({ caseId, hasActiveRound, purpose, copy, onDone }) {
  const [open, setOpen] = useState(!hasActiveRound);
  const [slots, setSlots] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateSlot(index, value) {
    setSlots((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addSlot() {
    if (slots.length < 5) setSlots((prev) => [...prev, ""]);
  }

  function removeSlot(index) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    const values = slots.filter((s) => s.trim());
    if (values.length === 0) {
      setError("Add at least one candidate date/time.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/cases/${caseId}/scheduling/rounds`, { slots: values, purpose });
      setSlots([""]);
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to propose ${copy.noun} slots`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
      >
        Propose new {copy.noun} slots
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-dashed border-neutral-300 p-4">
      <p className="mb-2 text-xs font-medium text-neutral-600">
        Candidate slots ({slots.length}/5)
      </p>
      <div className="space-y-2">
        {slots.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => updateSlot(i, e.target.value)}
              className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
            />
            {slots.length > 1 && (
              <button
                onClick={() => removeSlot(i)}
                className="text-xs font-medium text-neutral-400 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {slots.length < 5 && (
          <button
            onClick={addSlot}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            + Add another slot
          </button>
        )}
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-maroon px-4 py-1.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send to Committee & Chairperson"}
        </button>
        {hasActiveRound && (
          <button
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-600 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function TallyView({ caseId, round, purpose = "COMMITTEE_MEETING", copy = COPY.COMMITTEE_MEETING, onDone }) {
  const [busySlotId, setBusySlotId] = useState(null);
  // The slot the viewer has clicked "Confirm" on and is being asked to be sure of.
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState("");
  const isHearing = purpose === "HEARING";
  // Confirming a hearing slot is what schedules it, so how it will be held is
  // settled here rather than in a separate form.
  const [mode, setMode] = useState("In-person");
  const [notes, setNotes] = useState("");

  async function finalize(slotId) {
    setBusySlotId(slotId);
    setError("");
    try {
      await api.post(`/cases/${caseId}/scheduling/rounds/${round.id}/finalize`, {
        slotId,
        ...(isHearing ? { mode, notes: notes.trim() || undefined } : {}),
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to finalize the ${copy.noun}`);
      setBusySlotId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${ROUND_STATUS_COLORS[round.status]}`}
        >
          {ROUND_STATUS_LABELS[round.status]}
        </span>
        <p className="text-xs text-neutral-500">Review availability, then confirm one slot.</p>
      </div>
      {isHearing && (
        <div className="mb-3 space-y-2 rounded-lg border border-dashed border-neutral-300 p-3">
          <p className="text-xs font-medium text-neutral-600">
            How the hearing will be held — applied to whichever slot you confirm.
          </p>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          >
            <option>In-person</option>
            <option>Online</option>
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes (optional)"
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          />
        </div>
      )}
      <ul className="space-y-2">
        {round.slots.map((slot) => {
          const underQuorum = slot.votes.length < MIN_SLOT_VOTES_TO_FINALIZE;
          return (
          <li key={slot.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-neutral-800">{formatSlot(slot.startAt)}</p>
                <p className="cursor-help text-xs text-neutral-500" title={availabilityTooltip(slot)}>
                  {slot.votes.length === 0
                    ? "No votes yet"
                    : `${voteCountLabel(slot)} · ${voterNames(slot)}`}
                </p>
                {underQuorum && (
                  <p className="mt-0.5 text-xs text-amber-700">
                    Needs at least {MIN_SLOT_VOTES_TO_FINALIZE} votes to confirm (currently {slot.votes.length}).
                  </p>
                )}
              </div>
              {confirmingId !== slot.id && (
                <button
                  onClick={() => {
                    setError("");
                    setConfirmingId(slot.id);
                  }}
                  disabled={busySlotId !== null || underQuorum}
                  title={underQuorum ? `Needs at least ${MIN_SLOT_VOTES_TO_FINALIZE} votes to confirm` : undefined}
                  className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
                >
                  Confirm this slot
                </button>
              )}
            </div>
            {confirmingId === slot.id && (
              <div className="mt-3 rounded-md border border-maroon/30 bg-maroon/[0.03] p-3">
                <p className="text-sm font-medium text-neutral-800">
                  Confirm {formatSlot(slot.startAt)} as the final {copy.noun} time?
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  This settles the {copy.noun} and tells everyone involved.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => finalize(slot.id)}
                    disabled={busySlotId === slot.id}
                    className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
                  >
                    {busySlotId === slot.id ? "Confirming…" : "Yes, confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    disabled={busySlotId === slot.id}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function VoteForm({ caseId, round, user, onDone }) {
  const initialSelected = new Set(
    round.slots.filter((s) => s.votes.some((v) => v.voter.id === user.id)).map((s) => s.id)
  );
  const [selected, setSelected] = useState(initialSelected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function toggle(slotId) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/cases/${caseId}/scheduling/rounds/${round.id}/votes`, {
        slotIds: Array.from(selected),
      });
      setSaved(true);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save your availability");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-neutral-600">
        Select every slot you&apos;re available for
      </p>
      <ul className="space-y-2">
        {round.slots.map((slot) => (
          <li key={slot.id}>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
              <span className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={selected.has(slot.id)}
                  onChange={() => toggle(slot.id)}
                />
                {formatSlot(slot.startAt)}
              </span>
              <span className="cursor-help text-xs text-neutral-400" title={availabilityTooltip(slot)}>
                {slot.votes.length} available
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-maroon px-4 py-1.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save my availability"}
        </button>
        {saved && <span className="text-xs text-green-700">Saved</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
