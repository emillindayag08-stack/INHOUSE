// How many of the required voters have voted so far, e.g. "1 of 5 voted".
export default function VoteProgressBadge({ voted, required }) {
  if (required === null || required === undefined) return null;
  const complete = required > 0 && voted >= required;
  const styles = complete
    ? "bg-green-50 text-green-700 border-green-300"
    : "bg-amber-50 text-amber-800 border-amber-300";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {voted} of {required} voted
    </span>
  );
}
