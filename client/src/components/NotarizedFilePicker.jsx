import { useRef, useState } from "react";
import { XIcon } from "./icons.jsx";

// A notarized document is often several scanned pages, so a party may attach up
// to NOTARIZED_MAX_FILES files, each up to NOTARIZED_MAX_MB. The server joins
// them, in the order shown here, into one PDF that CODI reviews as one document.
export const NOTARIZED_MAX_FILES = 10;
export const NOTARIZED_MAX_MB = 10;
export const NOTARIZED_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
export const NOTARIZED_HINT = `JPG, PNG, WebP or PDF · up to ${NOTARIZED_MAX_FILES} files, ${NOTARIZED_MAX_MB} MB each`;

// Adds the staged files to a FormData, in order, under the field the upload
// route reads. A single file keeps its own name; several are named by the server.
export function appendNotarizedFiles(formData, files) {
  files.forEach((file) => formData.append("file", file));
  if (files.length === 1) formData.append("fileName", files[0].name);
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const BUTTON =
  "rounded-full p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30";

// The filer checks the list and confirms it before anything can be sent; the
// parent holds `confirmed` and keeps its submit button disabled until then.
// Any change to the list withdraws the confirmation.
export default function NotarizedFilePicker({
  files,
  onChange,
  confirmable = true, // false where a review step before submitting does the confirming
  confirmed = false,
  onConfirmedChange = () => {},
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  function update(next) {
    onConfirmedChange(false);
    onChange(next);
  }

  function pick(e) {
    const picked = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = ""; // so the same file can be picked again
    const problems = [];

    const sized = picked.filter((f) => {
      if (f.size <= NOTARIZED_MAX_MB * 1024 * 1024) return true;
      problems.push(`"${f.name}" is larger than ${NOTARIZED_MAX_MB} MB`);
      return false;
    });
    const room = NOTARIZED_MAX_FILES - files.length;
    if (sized.length > room) {
      problems.push(`you can attach at most ${NOTARIZED_MAX_FILES} files`);
    }
    setError(problems.length ? `Not added: ${problems.join("; ")}.` : "");
    if (room > 0) update([...files, ...sized.slice(0, room)]);
  }

  function move(index, by) {
    const next = [...files];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    update(next);
  }

  const full = files.length >= NOTARIZED_MAX_FILES;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={NOTARIZED_ACCEPT}
        onChange={pick}
        disabled={disabled || full}
        className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-maroon/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-maroon hover:file:bg-maroon/20 disabled:opacity-60"
      />
      {files.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-neutral-500">
            {files.length} of {NOTARIZED_MAX_FILES} files
            {files.length > 1 && " · joined in this order into one document"}
          </p>
          <ol className="space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${i}`}
                className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
              >
                <span className="w-5 shrink-0 text-xs text-neutral-400">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-neutral-700" title={file.name}>
                  {file.name}
                </span>
                <span className="whitespace-nowrap text-xs text-neutral-400">{formatSize(file.size)}</span>
                {files.length > 1 && (
                  <>
                    <button type="button" className={BUTTON} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${file.name} up`}>
                      ↑
                    </button>
                    <button type="button" className={BUTTON} disabled={disabled || i === files.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${file.name} down`}>
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => update(files.filter((_, j) => j !== i))}
                  aria-label={`Remove ${file.name}`}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ol>
          {confirmable && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {confirmed ? (
              <>
                <span className="text-sm font-medium text-green-700">✓ Files confirmed</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onConfirmedChange(false)}
                  className="text-xs font-medium text-maroon hover:underline disabled:opacity-50"
                >
                  Change
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onConfirmedChange(true)}
                  className="rounded-md border border-maroon px-4 py-2 text-sm font-medium text-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
                >
                  Confirm {files.length === 1 ? "file" : `${files.length} files`}
                </button>
                <span className="text-xs text-neutral-500">
                  Check the files and order, then confirm. CODI reviews the document, and once approved
                  it can no longer be replaced.
                </span>
              </>
            )}
          </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
