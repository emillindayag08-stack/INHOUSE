import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import Layout from "../components/Layout.jsx";
import { CalendarIcon, ClockIcon, AlertIcon, CheckCircleIcon, UserIcon } from "../components/icons.jsx";
import { caseLabel } from "../lib/constants.js";
import { deadlineUrgency, friendlyDeadlineLabel } from "../lib/deadlines.js";

// Everyone can narrow the calendar to one case — CODI staff work across many at
// once, and a university member can be on several (on either side).
const TERMINAL_STATUSES = new Set(["RESOLVED", "ESCALATED", "DISMISSED", "PRIMA_FACIE_NOT_FOUND"]);

// "Done" means a deadline that was submitted (MET), or a hearing/meeting whose
// time has already passed.
function isDone(event, now = new Date()) {
  if (event.type === "DEADLINE") return event.status === "MET";
  return new Date(event.date) < now;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Not yet done" },
  { value: "DONE", label: "Submitted / finished" },
];
const TYPE_FILTERS = [
  { value: "ALL", label: "Deadlines, hearings & meetings" },
  { value: "DEADLINE", label: "Deadlines only" },
  { value: "MEETINGS", label: "Hearings & meetings only" },
];

// Chip/legend tones per event kind. Deadlines are colored by their status;
// hearings and meetings get their own colors. Color is never the only
// signal — each tone also has a distinct icon (see EVENT_ICONS) so the
// calendar still reads correctly for colorblind users.
const EVENT_TONES = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  OVERDUE: "bg-red-100 text-red-700 border-red-200",
  MET: "bg-green-100 text-green-700 border-green-200",
  HEARING: "bg-blue-100 text-blue-700 border-blue-200",
  MEETING: "bg-purple-100 text-purple-700 border-purple-200",
};

const DOT_TONES = {
  PENDING: "bg-amber-500",
  OVERDUE: "bg-red-500",
  MET: "bg-green-500",
  HEARING: "bg-blue-500",
  MEETING: "bg-purple-500",
};

const ICON_TONES = {
  PENDING: "text-amber-500",
  OVERDUE: "text-red-500",
  MET: "text-green-500",
  HEARING: "text-blue-500",
  MEETING: "text-purple-500",
};

const EVENT_ICONS = {
  PENDING: ClockIcon,
  OVERDUE: AlertIcon,
  MET: CheckCircleIcon,
  HEARING: UserIcon,
  MEETING: CalendarIcon,
};

function toneKey(event) {
  if (event.type === "HEARING") return "HEARING";
  if (event.type === "MEETING") return "MEETING";
  return event.status;
}

function EventIcon({ event, className }) {
  const Icon = EVENT_ICONS[toneKey(event)];
  return <Icon className={`${className} ${ICON_TONES[toneKey(event)]}`} />;
}

function friendlyLabel(event) {
  if (event.type !== "DEADLINE") return event.label;
  return friendlyDeadlineLabel(event.label);
}

// The label already says *what* the event is (e.g. "Committee meeting",
// "Hearing (In-person)"); the badge says its *status* — so for
// hearings/meetings it should never just repeat the label back.
function badgeText(event) {
  if (event.type === "HEARING" || event.type === "MEETING") return "Confirmed";
  return deadlineUrgency(event.status, event.date);
}

const FILTER_SELECT =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [filterCaseId, setFilterCaseId] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  useEffect(() => {
    api
      .get("/dashboard/calendar")
      .then((res) => setEvents(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get("/cases").then((res) => setCases(res.data));
  }, []);

  const activeCases = useMemo(() => cases.filter((c) => !TERMINAL_STATUSES.has(c.status)), [cases]);
  const closedCases = useMemo(() => cases.filter((c) => TERMINAL_STATUSES.has(c.status)), [cases]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter((e) => {
      if (filterCaseId && e.caseId !== filterCaseId) return false;
      if (typeFilter === "DEADLINE" && e.type !== "DEADLINE") return false;
      if (typeFilter === "MEETINGS" && e.type === "DEADLINE") return false;
      if (statusFilter === "OPEN" && isDone(e, now)) return false;
      if (statusFilter === "DONE" && !isDone(e, now)) return false;
      return true;
    });
  }, [events, filterCaseId, statusFilter, typeFilter]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of filteredEvents) {
      const key = dayKey(event.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
    return map;
  }, [filteredEvents]);

  // Build the 6x7 grid (Sunday-first) for the viewed month.
  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const start = new Date(firstOfMonth);
    start.setDate(1 - firstOfMonth.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [viewYear, viewMonth]);

  const monthEvents = useMemo(
    () =>
      filteredEvents.filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
      }),
    [filteredEvents, viewYear, viewMonth]
  );

  const overdueCount = useMemo(
    () => monthEvents.filter((e) => e.type === "DEADLINE" && e.status === "OVERDUE").length,
    [monthEvents]
  );

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Calendar</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Deadlines, hearings, and meetings for your cases, colored and labeled by what's
            happening and how urgent it is.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            ←
          </button>
          <span className="min-w-40 text-center text-sm font-medium text-neutral-800">
            {monthLabel}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            →
          </button>
          <button
            onClick={goToday}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
          >
            Today
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {cases.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-600">
            Case:
            <select
              value={filterCaseId}
              onChange={(e) => setFilterCaseId(e.target.value)}
              className={FILTER_SELECT}
            >
              <option value="">All cases</option>
              {activeCases.length > 0 && (
                <optgroup label="Active">
                  {activeCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {caseLabel(c)}
                    </option>
                  ))}
                </optgroup>
              )}
              {closedCases.length > 0 && (
                <optgroup label="Closed">
                  {closedCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {caseLabel(c)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-600">
          Show:
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER_SELECT}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-600">
          Type:
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={FILTER_SELECT}>
            {TYPE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {(filterCaseId || statusFilter !== "ALL" || typeFilter !== "ALL") && (
          <button
            onClick={() => {
              setFilterCaseId("");
              setStatusFilter("ALL");
              setTypeFilter("ALL");
            }}
            className="text-sm font-medium text-maroon hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {overdueCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <AlertIcon className="h-4 w-4 shrink-0 text-red-500" />
          {overdueCount} overdue deadline{overdueCount === 1 ? "" : "s"} this month — look for the{" "}
          <AlertIcon className="inline h-3.5 w-3.5 text-red-500" /> icon below.
        </div>
      )}

      {/* Legend, grouped by what each color family means so it's clear
          deadline status and event type are two different things. */}
      <div className="mb-4 space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Deadlines:
          </span>
          <LegendItem tone="PENDING" label="Upcoming" />
          <LegendItem tone="OVERDUE" label="Overdue" />
          <LegendItem tone="MET" label="Completed" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Meetings:
          </span>
          <LegendItem tone="HEARING" label="Hearing" />
          <LegendItem tone="MEETING" label="Committee meeting" />
        </div>
      </div>

      {/* Month grid */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50 text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((date) => {
            const inMonth = date.getMonth() === viewMonth;
            const isToday = dayKey(date) === dayKey(today);
            const dayEvents = eventsByDay.get(dayKey(date)) || [];
            return (
              <div
                key={date.toISOString()}
                className={`min-h-20 border-b border-r border-neutral-100 p-1.5 sm:min-h-24 ${
                  inMonth ? "bg-white" : "bg-neutral-50/60"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-maroon font-medium text-white"
                      : inMonth
                      ? "text-neutral-700"
                      : "text-neutral-400"
                  }`}
                >
                  {date.getDate()}
                </span>

                {/* Mobile: dots. Desktop: chips with icon + plain-language label. */}
                <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                  {dayEvents.slice(0, 4).map((e) => (
                    <Link
                      key={e.id}
                      to={`/cases/${e.caseId}`}
                      aria-label={`${e.caseNumber}: ${friendlyLabel(e)} (${badgeText(e)})`}
                    >
                      <span className={`block h-2.5 w-2.5 rounded-full ${DOT_TONES[toneKey(e)]}`} />
                    </Link>
                  ))}
                </div>
                <div className="mt-1 hidden space-y-1 sm:block">
                  {dayEvents.slice(0, 3).map((e) => (
                    <Link
                      key={e.id}
                      to={`/cases/${e.caseId}`}
                      title={`${e.caseNumber} · ${friendlyLabel(e)} — ${badgeText(e)}`}
                      className={`flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-xs font-medium hover:opacity-80 ${EVENT_TONES[toneKey(e)]}`}
                    >
                      <EventIcon event={e} className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {e.caseNumber} · {friendlyLabel(e)}
                      </span>
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="px-1 text-xs text-neutral-400">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Month event list (also serves as the mobile detail view) */}
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-sm font-bold text-neutral-800">Events in {monthLabel}</h2>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Loading…</p>
        ) : monthEvents.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <CalendarIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-neutral-700">Nothing scheduled</p>
            <p className="mt-1 text-sm text-neutral-500">
              No deadlines, hearings, or meetings fall in this month.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {monthEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <EventIcon event={e} className="h-4 w-4 shrink-0" />
                <span className="w-24 shrink-0 text-sm text-neutral-500">
                  {new Date(e.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </span>
                <Link to={`/cases/${e.caseId}`} className="text-sm font-medium text-maroon hover:underline">
                  {e.caseNumber}
                </Link>
                <span className="text-sm text-neutral-700">{friendlyLabel(e)}</span>
                <span
                  className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${EVENT_TONES[toneKey(e)]}`}
                >
                  {badgeText(e)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}

function LegendItem({ tone, label }) {
  const Icon = EVENT_ICONS[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
      <Icon className={`h-3.5 w-3.5 ${ICON_TONES[tone]}`} />
      {label}
    </span>
  );
}
