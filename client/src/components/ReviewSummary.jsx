// What a filer sees between "Review" and the final "Confirm and submit": the
// things they entered, read back, so they can confirm them or go back and edit.
export default function ReviewSummary({ rows, note }) {
  return (
    <div>
      <p className="mb-3 text-xs text-neutral-500">
        {note || "Check everything below. Nothing is sent until you confirm."}
      </p>
      <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {rows.map(({ label, value }) => (
          <div key={label} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[10rem_1fr] sm:gap-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-line text-neutral-800">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// A list of files as a summary value, in the order they will be joined.
export function fileListValue(files) {
  return (
    <ol className="space-y-0.5">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          {i + 1}. {f.name}
        </li>
      ))}
    </ol>
  );
}
