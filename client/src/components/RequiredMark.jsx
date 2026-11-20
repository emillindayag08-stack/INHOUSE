// The red asterisk after the label of a field that must be filled in. The star
// is decoration; screen readers are told "required" instead.
export default function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-red-600">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

// The one-line key shown above a form that uses the mark.
export function RequiredKey() {
  return (
    <p className="text-xs text-neutral-500">
      <span aria-hidden="true" className="text-red-600">
        *
      </span>{" "}
      Required
    </p>
  );
}
