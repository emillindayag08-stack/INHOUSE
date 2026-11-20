// Page controls shared by the dashboard's case tracker and case list, the
// records list, and the audit log: previous/next arrows around a "page of
// pages" count.

const ARROW =
  "flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === "left" ? "M12 5l-5 5 5 5" : "M8 5l5 5-5 5"} />
    </svg>
  );
}

// A single previous/next arrow, also used on its own to flank a card.
export function PageArrow({ direction, onClick, disabled, className = "" }) {
  return (
    <button
      type="button"
      aria-label={direction === "left" ? "Previous page" : "Next page"}
      className={`${ARROW} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Chevron direction={direction} />
    </button>
  );
}

export default function Pagination({ page, pageCount, onChange, label = "Pages" }) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-center gap-3">
      <PageArrow direction="left" onClick={() => onChange(page - 1)} disabled={page === 1} />
      <span className="text-xs font-medium tabular-nums text-neutral-600" aria-live="polite">
        {page} / {pageCount}
      </span>
      <PageArrow direction="right" onClick={() => onChange(page + 1)} disabled={page === pageCount} />
    </nav>
  );
}
