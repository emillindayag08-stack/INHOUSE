export default function DeadlineBadge({ deadline }) {
  if (!deadline) return null;
  const due = new Date(deadline.dueAt);
  const label = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const styles = {
    PENDING: "bg-neutral-100 text-neutral-700 border-neutral-300",
    MET: "bg-green-50 text-green-700 border-green-300",
    OVERDUE: "bg-red-50 text-red-700 border-red-300",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
        styles[deadline.status] || styles.PENDING
      }`}
    >
      {deadline.stage}: {label}
    </span>
  );
}
