import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge.jsx";
import { XIcon } from "./icons.jsx";
import { formatDate, healthTone, labelFor, monthLabel } from "../lib/reports.js";

// Lightweight chart building blocks for the Reports page — plain divs and
// Tailwind, no chart library, matching CaseAnalytics.jsx.

export function ReportSection({ title, description, children, actions }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-neutral-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, subtitle, children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="text-sm font-medium text-neutral-800">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </div>
  );
}

export function EmptyNote({ children = "No cases match these filters." }) {
  return <p className="py-4 text-sm text-neutral-400">{children}</p>;
}

// A headline number with its change against the previous, equally long period.
// `goodWhen` says which direction is an improvement ("up", "down", or null
// when neither is — more filings isn't good or bad in itself).
// `health` (a percentage) colours the figure and adds a meter: red below 40%,
// amber 40-80%, green above 80%.
export function KpiTile({ label, value, display, previous, goodWhen = null, unit = "", hint, health }) {
  const tone = health === undefined ? null : healthTone(health);
  let delta = null;
  if (previous !== undefined && previous !== null && value !== null && value !== undefined) {
    const diff = Math.round((value - previous) * 10) / 10;
    const tone =
      diff === 0 || !goodWhen
        ? "text-neutral-500"
        : (diff > 0) === (goodWhen === "up")
        ? "text-emerald-700"
        : "text-red-700";
    delta = (
      <span className={`text-xs font-medium ${tone}`}>
        {diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} {diff === 0 ? "No change" : `${diff > 0 ? "+" : ""}${diff}${unit}`}{" "}
        <span className="font-normal text-neutral-400">vs previous period</span>
      </span>
    );
  }
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ? tone.text : "text-neutral-900"}`}>{display ?? value ?? "—"}</p>
      {tone && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100" title={`Healthy above 80%, warning 40-80%, critical below 40%`}>
          <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${Math.max(0, Math.min(100, health ?? 0))}%` }} />
        </div>
      )}
      <div className="mt-1 min-h-[1rem]">{delta || (hint && <span className="text-xs text-neutral-400">{hint}</span>)}</div>
    </div>
  );
}

// Horizontal bars with count and share.
export function BarList({ rows, dimension, total, color = "bg-maroon/70", onSelect, hideZero = true }) {
  const visible = hideZero ? rows.filter((r) => r.count > 0) : rows;
  if (visible.length === 0 || total === 0) return <EmptyNote />;
  const max = Math.max(1, ...visible.map((r) => r.count ?? 0));

  return (
    <ul className="space-y-3">
      {visible.map((row) => {
        const label = labelFor(dimension, row.key);
        const clickable = onSelect && row.count > 0;
        const content = (
          <>
            {/* Same layout as the donut legends: the name wraps, the figures
                sit in fixed right-aligned columns. */}
            <div className="mb-1 flex items-start gap-3 text-xs">
              <span className="min-w-0 flex-1 break-words leading-snug text-neutral-700">{label}</span>
              <span className="flex shrink-0 tabular-nums">
                <span className="w-6 text-right font-medium text-neutral-700">{row.count}</span>
                <span className="w-10 text-right text-neutral-400">{row.pct}%</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={row.key}>
            {clickable ? (
              <button
                type="button"
                onClick={() => onSelect(row.key, label)}
                className="block w-full rounded-md text-left outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-maroon/40"
                title={`Show the ${row.count} case${row.count === 1 ? "" : "s"}`}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Legend({ series }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// Monthly columns, either stacked (parts of a whole) or grouped side by side
// (independent measures such as filed vs closed).
export function MonthChart({ months, series, valueFor, mode = "stacked", onSelectMonth, height = "h-44" }) {
  if (months.length === 0) return <EmptyNote />;
  const totals = months.map((m) => series.reduce((sum, s) => sum + (valueFor(m, s.key) || 0), 0));
  const max =
    mode === "stacked"
      ? Math.max(1, ...totals)
      : Math.max(1, ...months.flatMap((m) => series.map((s) => valueFor(m, s.key) || 0)));
  const compact = months.length > 12;

  return (
    <div>
      <div className="overflow-x-auto">
        <div className={`flex ${height} items-end gap-2`} style={{ minWidth: `${months.length * (compact ? 28 : 44)}px` }}>
          {months.map((m, i) => {
            const tooltip = `${monthLabel(m.month)}: ${series.map((s) => `${s.label} ${valueFor(m, s.key) || 0}`).join(", ")}`;
            const body =
              mode === "stacked" ? (
                <div className="flex h-full w-full flex-col justify-end">
                  <span className="mb-1 text-center text-xs font-medium tabular-nums text-neutral-600">
                    {totals[i] || ""}
                  </span>
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                    style={{ height: `${(totals[i] / max) * 85}%` }}
                  >
                    {series.map((s) => {
                      const v = valueFor(m, s.key) || 0;
                      return v ? <div key={s.key} className={s.color} style={{ height: `${(v / totals[i]) * 100}%` }} /> : null;
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  {series.map((s) => {
                    const v = valueFor(m, s.key) || 0;
                    return (
                      <div key={s.key} className="flex h-full flex-1 flex-col justify-end">
                        <span className="mb-0.5 text-center text-xs tabular-nums text-neutral-500">{v || ""}</span>
                        <div className={`w-full rounded-t ${s.color}`} style={{ height: `${(v / max) * 85}%`, minHeight: v ? 2 : 0 }} />
                      </div>
                    );
                  })}
                </div>
              );
            return (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center" title={tooltip}>
                {onSelectMonth && totals[i] > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectMonth(m.month)}
                    className="h-full w-full rounded outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-maroon/40"
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2 border-t border-neutral-200 pt-1" style={{ minWidth: `${months.length * (compact ? 28 : 44)}px` }}>
          {months.map((m) => (
            <span key={m.month} className="flex-1 whitespace-nowrap text-center text-xs text-neutral-400">
              {monthLabel(m.month, compact ? { month: "narrow" } : { month: "short" })}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <Legend series={series} />
      </div>
    </div>
  );
}

// A segmented control for small either/or choices.
export function Toggle({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            value === o.value ? "bg-maroon text-white" : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Slide-over list of the cases behind a clicked bar. Reference numbers and
// categories only — never names.
export function CaseDrawer({ title, cases, onClose }) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl" role="dialog" aria-label={title}>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Matching cases</p>
            <h2 className="mt-0.5 text-sm font-bold text-neutral-900">{title}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {cases.length} case{cases.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {cases.map((c) => (
            <li key={c.id}>
              <Link to={`/cases/${c.id}`} className="block px-5 py-3 hover:bg-neutral-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-maroon">{c.label}</span>
                  <StatusBadge phase={c.phase} />
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Filed {formatDate(c.filedAt)} · {labelFor("offense", c.offense)} ·{" "}
                  {c.closure ? `${labelFor("closure", c.closure)} after ${c.daysOpen} days` : `Open for ${c.daysOpen} days`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
