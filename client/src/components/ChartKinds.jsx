import { EmptyNote } from "./ReportCharts.jsx";
import { labelFor, monthLabel } from "../lib/reports.js";
import { CASE_PHASE_HEX } from "../lib/constants.js";

// More chart shapes for the Reports page, drawn with plain SVG (no chart
// library): a ring for parts of a whole, columns for an ordered scale, and
// lines for how a quantity moves month to month.

const SLICE_COLORS = ["#7f1d1d", "#eab308", "#d97706", "#059669", "#7c3aed", "#737373", "#0891b2", "#db2777"];

// Parts of a whole as a ring, with the legend (counts and shares) beside it.
// Rows the server suppressed are listed but not drawn.
export function DonutChart({ rows, dimension, total, onSelect, centerLabel = "cases" }) {
  const visible = rows.filter((r) => r.suppressed || r.count > 0);
  const drawn = visible.filter((r) => !r.suppressed);
  const sum = drawn.reduce((s, r) => s + r.count, 0);
  if (visible.length === 0 || total === 0 || sum === 0) return <EmptyNote />;

  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = drawn.map((row, i) => {
    const len = (row.count / sum) * C;
    const arc = { row, color: (dimension === "status" && CASE_PHASE_HEX[row.key]) || SLICE_COLORS[i % SLICE_COLORS.length], len, offset };
    offset += len;
    return arc;
  });
  const colorOf = (row) => arcs.find((a) => a.row === row)?.color;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Share of cases">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f5f5f5" strokeWidth="14" />
        {arcs.map((a) => (
          <circle
            key={a.row.key}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth="14"
            strokeDasharray={`${Math.max(a.len - 0.6, 0.1)} ${C}`}
            strokeDashoffset={-a.offset}
          >
            <title>{`${labelFor(dimension, a.row.key)}: ${a.row.count} (${a.row.pct}%)`}</title>
          </circle>
        ))}
        <g transform="rotate(90 50 50)" textAnchor="middle">
          <text x="50" y="52" fontSize="16" fontWeight="700" fill="#171717">
            {sum}
          </text>
          <text x="50" y="63" fontSize="6" fill="#737373">
            {centerLabel}
          </text>
        </g>
      </svg>
      <ul className="min-w-[8rem] flex-1 space-y-1.5 text-xs">
        {visible.map((row) => {
          const label = labelFor(dimension, row.key);
          const clickable = onSelect && !row.suppressed && row.count > 0;
          const body = (
            <>
              {/* Names wrap rather than cut off, and the figures sit in fixed,
                  right-aligned columns, so every row reads the same way. */}
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-sm" style={{ background: colorOf(row) || "#d4d4d4" }} />
              <span className="min-w-0 flex-1 break-words leading-snug text-neutral-700">{label}</span>
              {row.suppressed ? (
                <span className="shrink-0 self-start italic text-neutral-500">Fewer than 3</span>
              ) : (
                <span className="flex shrink-0 self-start tabular-nums">
                  <span className="w-6 text-right font-medium text-neutral-700">{row.count}</span>
                  <span className="w-10 text-right text-neutral-400">{row.pct}%</span>
                </span>
              )}
            </>
          );
          return (
            <li key={row.key}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect(row.key, label)}
                  className="flex w-full items-start gap-2 rounded text-left transition hover:bg-neutral-50"
                  title={`Show the ${row.count} case${row.count === 1 ? "" : "s"}`}
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Offense levels run light to grave: yellow, orange, red; unclassified is gray.
const OFFENSE_COLUMN = {
  LIGHT: "bg-yellow-400",
  LESS_GRAVE: "bg-orange-500",
  GRAVE: "bg-red-600",
  UNCLASSIFIED: "bg-neutral-400",
};

// Vertical columns for an ordered scale (offense levels).
export function ColumnChart({ rows, dimension, total, color = "bg-amber-500/80", onSelect }) {
  const visible = rows.filter((r) => r.suppressed || r.count > 0);
  if (visible.length === 0 || total === 0) return <EmptyNote />;
  const max = Math.max(1, ...visible.map((r) => r.count ?? 0));
  return (
    <div className="flex h-44 items-end gap-3">
      {visible.map((row) => {
        const label = labelFor(dimension, row.key);
        const clickable = onSelect && !row.suppressed && row.count > 0;
        const body = (
          <div className="flex h-full w-full flex-col justify-end">
            <span className="mb-1 text-center text-xs font-medium tabular-nums text-neutral-600">
              {row.suppressed ? "<3" : row.count}
            </span>
            <div
              className={`w-full rounded-t ${row.suppressed ? "bg-neutral-200" : (dimension === "offense" && OFFENSE_COLUMN[row.key]) || color}`}
              style={{ height: `${row.suppressed ? 8 : (row.count / max) * 75}%`, minHeight: 3 }}
            />
          </div>
        );
        return (
          <div
            key={row.key}
            className="flex h-full min-w-0 flex-1 flex-col"
            title={`${label}: ${row.suppressed ? "fewer than 3" : row.count}`}
          >
            <div className="min-h-0 flex-1">
              {clickable ? (
                <button type="button" onClick={() => onSelect(row.key, label)} className="h-full w-full transition hover:opacity-80">
                  {body}
                </button>
              ) : (
                body
              )}
            </div>
            <span className="mt-1 break-words border-t border-neutral-200 pt-1 text-center text-xs leading-tight text-neutral-500">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// One or more lines across the months. `series` is [{ key, label, color }]
// with a hex colour.
export function LineChart({ months, series, valueFor, height = 176 }) {
  if (months.length === 0) return <EmptyNote />;
  const W = 400;
  const H = 120;
  const pad = { l: 22, r: 8, t: 8, b: 4 };
  const all = months.flatMap((m) => series.map((s) => valueFor(m, s.key) || 0));
  const max = Math.max(1, ...all);
  const x = (i) => pad.l + (months.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (months.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const step = Math.ceil(months.length / 8);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} style={{ height }} className="w-full" role="img" aria-label="Monthly trend">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth="0.5" />
            <text x={pad.l - 4} y={y(t) + 2} fontSize="6" textAnchor="end" fill="#a3a3a3">
              {t}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              points={months.map((m, i) => `${x(i)},${y(valueFor(m, s.key) || 0)}`).join(" ")}
            />
            {months.map((m, i) => (
              <circle key={m.month} cx={x(i)} cy={y(valueFor(m, s.key) || 0)} r="2" fill={s.color}>
                <title>{`${monthLabel(m.month)}: ${s.label} ${valueFor(m, s.key) || 0}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {months.map((m, i) =>
          i % step === 0 ? (
            <text key={m.month} x={x(i)} y={H + 8} fontSize="6" textAnchor="middle" fill="#a3a3a3">
              {monthLabel(m.month, { month: "short" })}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
