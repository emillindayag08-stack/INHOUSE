import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { SearchIcon, XIcon, UserIcon } from "./icons.jsx";

// Naming the respondent means picking the actual person out of the BulSU
// directory, not typing their details. Their name, college and whether they
// are a student or personnel come from the directory record, so a complaint
// can't be filed against a misspelling and the respondent already has an
// account to answer with.

const TYPE_LABELS = { STUDENT: "Student", PERSONNEL: "Personnel" };

export default function RespondentPicker({ value, onChange, disabled = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Debounced: the real directory is a network call per keystroke otherwise.
    const timer = setTimeout(() => {
      api
        .get("/directory/search", { params: { q } })
        .then((res) => setResults(res.data))
        .catch(() => setError("Could not search the directory. Please try again."))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="rounded-lg border border-maroon/30 bg-maroon/[0.03] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-maroon/10 text-maroon">
              <UserIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-900">{value.fullName}</p>
              <p className="text-xs text-neutral-600">
                {TYPE_LABELS[value.type]} · {value.idNumber}
              </p>
              <p className="text-xs text-neutral-500">{value.college}</p>
              <p className="text-xs text-neutral-400">{value.email}</p>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setQuery("");
                setTouched(false);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = query.trim();
  const showEmpty = touched && q.length >= 2 && !searching && results.length === 0;

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setTouched(true);
            setError("");
          }}
          placeholder="Search the BulSU directory by name or ID number"
          className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700"
            aria-label="Clear search"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {q.length > 0 && q.length < 2 && (
        <p className="mt-1 text-xs text-neutral-500">Type at least 2 characters.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-neutral-100 overflow-y-auto rounded-md border border-neutral-200">
          {results.map((person) => (
            <li key={person.directoryId}>
              <button
                type="button"
                onClick={() => onChange(person)}
                className="block w-full px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="block text-sm font-medium text-neutral-800">{person.fullName}</span>
                <span className="block text-xs text-neutral-500">
                  {TYPE_LABELS[person.type]} · {person.idNumber} · {person.college}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <p className="mt-2 rounded-md border border-dashed border-neutral-300 px-3 py-3 text-center text-xs text-neutral-500">
          No one in the BulSU directory matches "{q}". Check the spelling, or search by ID number.
        </p>
      )}
      {searching && q.length >= 2 && results.length === 0 && (
        <p className="mt-2 text-xs text-neutral-400">Searching…</p>
      )}
    </div>
  );
}
