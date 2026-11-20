import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { OFFENSE_SERIES } from "../lib/reports.js";
import { ColumnChart, DonutChart } from "./ChartKinds.jsx";

// Dashboard requirement: case counts, case status breakdown, incident
// distribution per college, and offense-level breakdown — for the Secretariat,
// Chairperson, and Committee roles (see GET /dashboard/analytics).
export default function CaseAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/analytics")
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load analytics"));
  }, []);

  if (error) return null; // silently skip — the stat cards above already cover the essentials
  if (!data) {
    return (
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50" />
        ))}
      </div>
    );
  }

  const withShare = (rows) => {
    const sum = rows.reduce((n, r) => n + r.count, 0) || 1;
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / sum) * 100) }));
  };
  const statusRows = withShare(
    Object.entries(data.byStatus)
      .filter(([, count]) => count > 0)
      .sort((x, y) => y[1] - x[1])
      .map(([key, count]) => ({ key, count }))
  );
  const statusTotal = statusRows.reduce((n, r) => n + r.count, 0);
  const maxCollegeCount = Math.max(1, ...data.byCollege.map((c) => c.count));
  const offenseRows = withShare(OFFENSE_SERIES.map(({ key }) => ({ key, count: data.byOffense?.[key] || 0 })));
  const offenseTotal = offenseRows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Case status">
        <DonutChart rows={statusRows} dimension="status" total={statusTotal} />
      </Panel>

      <Panel title="Incidents by college">
        {data.byCollege.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="space-y-2.5">
            {data.byCollege.map(({ college, count }) => (
              <li key={college}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-neutral-700" title={college}>
                    {college}
                  </span>
                  <span className="shrink-0 font-medium text-neutral-700">{count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-blue-500/70"
                    style={{ width: `${(count / maxCollegeCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Offense level">
        <ColumnChart rows={offenseRows} dimension="offense" total={offenseTotal} />
      </Panel>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold text-neutral-800">{title}</h2>
      {children}
    </section>
  );
}

function EmptyNote() {
  return <p className="text-sm text-neutral-400">No data yet.</p>;
}
