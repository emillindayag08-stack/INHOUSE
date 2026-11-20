import { DEADLINE_STAGE_LABELS } from "./constants.js";

// Plain-language deadline text, shared by the calendar and the dashboard's
// case progress tracker. Kept here rather than in either page so both say the
// same thing about the same date.

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Deadline stages are stored as raw, all-caps text (see DEADLINE_STAGE_LABELS
// in constants.js).
export function toTitleCase(text) {
  return text.replace(/\w\S*/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
}

export function friendlyDeadlineLabel(stage) {
  if (!stage) return "";
  return DEADLINE_STAGE_LABELS[stage] || toTitleCase(stage);
}

// "Overdue by 4 days" / "Due today" / "Due in 3 days", rather than the raw
// PENDING/OVERDUE/MET status. Measured from the start of today, so something
// due later today reads as due, not already missed.
export function deadlineUrgency(status, date) {
  if (status === "MET") return "Completed";
  const diffDays = Math.round((new Date(date) - startOfDay(new Date())) / 86400000);
  if (status === "OVERDUE" || diffDays < 0) {
    const days = Math.abs(diffDays);
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
}

// How loudly to say it: overdue is red, the last couple of days amber, the
// rest neutral. Text carries the meaning; colour only reinforces it.
export function urgencyTone(status, date) {
  if (status === "MET") return "done";
  const diffDays = Math.round((new Date(date) - startOfDay(new Date())) / 86400000);
  if (status === "OVERDUE" || diffDays < 0) return "overdue";
  return diffDays <= 2 ? "soon" : "later";
}
