import { useState } from "react";
import RespondentPicker from "./RespondentPicker.jsx";
import RequiredMark from "./RequiredMark.jsx";
import { BULSU_COLLEGES, RESPONDENT_NAME_MAX } from "../lib/constants.js";

// The respondents a complaint names: one to MAX_RESPONDENTS, edited in place as
// a list of rows — the same shape as the candidate slots on the scheduling
// form. "+ Add another respondent" appends a row and disappears at the cap;
// every row has Remove, except that one row always stays.
export const MAX_RESPONDENTS = 3;

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon disabled:bg-neutral-100 disabled:text-neutral-500";

let nextKey = 0;

// The name is entered as Last name, First name and middle initial, and sent
// as one string in that order: "Dela Cruz, Juan A."
export function composeName({ lastName = "", firstName = "", mi = "" }) {
  const last = lastName.trim();
  const first = firstName.trim();
  const initial = mi.trim().replace(/\.+$/, "");
  return [last, [first, initial && `${initial}.`].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

// "Last, First M." back into its parts. A name without a comma (older filings)
// goes into Last name whole, for the filer to sort out.
export function splitName(name = "") {
  const text = name.trim();
  const comma = text.indexOf(",");
  if (comma < 0) return { lastName: text, firstName: "", mi: "" };
  const lastName = text.slice(0, comma).trim();
  const rest = text.slice(comma + 1).trim();
  const m = rest.match(/^(.*?)\s+([A-Za-z])\.?$/);
  return m ? { lastName, firstName: m[1].trim(), mi: m[2] } : { lastName, firstName: rest, mi: "" };
}

// A directory full name ("Juan A. Dela Cruz") into the same parts.
function splitFullName(fullName = "") {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const initialAt = words.findIndex((w, i) => i > 0 && /^[A-Za-z]\.?$/.test(w));
  if (initialAt > 0) {
    return {
      firstName: words.slice(0, initialAt).join(" "),
      mi: words[initialAt].replace(/\.$/, ""),
      lastName: words.slice(initialAt + 1).join(" "),
    };
  }
  return { firstName: words.slice(0, -1).join(" "), mi: "", lastName: words[words.length - 1] || "" };
}

// A blank row. `id` is set only on a row that already exists on the case, so
// the server can tell an edited respondent from a new one.
export function emptyRespondent(overrides = {}) {
  const row = {
    key: `r${nextKey++}`,
    id: null,
    lastName: "",
    firstName: "",
    mi: "",
    type: "STUDENT",
    college: "",
    person: null, // the BulSU directory account picked for this row, if any
    ...overrides,
  };
  return { ...row, name: composeName(row) };
}

// What the API takes.
export function respondentsPayload(rows) {
  return rows.map((r) => ({
    id: r.id || undefined,
    name: r.name.trim(),
    type: r.type,
    college: r.college,
    directoryId: r.person?.directoryId || null,
  }));
}

// A row from a case the user is editing.
export function respondentFromCase(row) {
  const user = row.user;
  return emptyRespondent({
    id: row.id,
    ...(row.claimedName ? splitName(row.claimedName) : splitFullName(user?.fullName)),
    type: row.claimedType || user?.userType || "STUDENT",
    college: row.claimedCollege || user?.department || "",
    person: user
      ? {
          directoryId: user.directoryId,
          fullName: user.fullName,
          idNumber: user.directoryId,
          type: row.typeAtFiling || user.userType,
          college: row.collegeAtFiling || user.department,
          email: user.email,
        }
      : null,
  });
}

export const TYPE_LABEL = { STUDENT: "Student", PERSONNEL: "Teaching or Non-Teaching Personnel" };

export default function RespondentList({ value, onChange, disabled = false }) {
  const [openPickers, setOpenPickers] = useState(() => new Set());

  function update(key, patch) {
    onChange(
      value.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        return { ...next, name: composeName(next) };
      })
    );
  }

  function pick(row, person) {
    // A directory record settles the status and college, which decide the rules
    // and the reports.
    update(row.key, {
      person,
      ...(person?.type ? { type: person.type } : {}),
      ...(person?.college ? { college: person.college } : {}),
      ...(person && !row.name.trim() ? splitFullName(person.fullName) : {}),
    });
  }

  function remove(key) {
    onChange(value.filter((r) => r.key !== key));
  }

  function togglePicker(key) {
    setOpenPickers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-neutral-700">
          Respondents{" "}
          <span className="font-normal text-neutral-500">
            ({value.length}/{MAX_RESPONDENTS})
          </span>
        </p>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Name everyone the complaint is against. The CODI Secretariat confirms who each person is
        before the case is assigned.
      </p>

      <div className="space-y-3">
        {value.map((row, i) => (
          <div key={row.key} className="rounded-lg border border-dashed border-neutral-300 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Respondent {i + 1}
              </p>
              {value.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  disabled={disabled}
                  className="text-xs font-medium text-neutral-500 hover:text-red-600 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>

            <fieldset>
              <legend className="mb-1 block text-xs font-medium text-neutral-600">
                Name <span className="font-normal text-neutral-500">(Last Name, First Name, MI.)</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_7.5rem]">
                <label className="block">
                  <span className="sr-only">Last name</span>
                  <input
                    required
                    maxLength={RESPONDENT_NAME_MAX}
                    value={row.lastName}
                    disabled={disabled}
                    onChange={(e) => update(row.key, { lastName: e.target.value })}
                    placeholder="Last name *"
                    aria-required="true"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="sr-only">First name</span>
                  <input
                    required
                    maxLength={RESPONDENT_NAME_MAX}
                    value={row.firstName}
                    disabled={disabled}
                    onChange={(e) => update(row.key, { firstName: e.target.value })}
                    placeholder="First name *"
                    aria-required="true"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Middle initial</span>
                  <input
                    maxLength={3}
                    value={row.mi}
                    disabled={disabled}
                    onChange={(e) => update(row.key, { mi: e.target.value })}
                    placeholder="MI (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
              {row.name && <p className="mt-1 text-xs text-neutral-500">Will read: {row.name}</p>}
            </fieldset>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">
                  Status
                  <RequiredMark />
                </label>
                <select
                  value={row.type}
                  disabled={disabled || !!row.person}
                  onChange={(e) => update(row.key, { type: e.target.value })}
                  className={inputClass}
                >
                  <option value="STUDENT">Student</option>
                  <option value="PERSONNEL">Teaching or Non-Teaching Personnel</option>
                </select>
              </div>
              <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                College / Department
                <RequiredMark />
              </label>
              <select
                required
                value={row.college}
                disabled={disabled || !!row.person}
                onChange={(e) => update(row.key, { college: e.target.value })}
                className={inputClass}
              >
                <option value="" disabled>
                  Select a college
                </option>
                {BULSU_COLLEGES.map((college) => (
                  <option key={college} value={college}>
                    {college}
                  </option>
                ))}
              </select>
              {row.person && (
                <p className="mt-1 text-xs text-neutral-500">
                  From {row.person.fullName}'s BulSU directory record.
                </p>
              )}
              </div>
            </div>

            <div className="mt-3">
              {row.person || openPickers.has(row.key) ? (
                <>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">
                    BulSU account <span className="font-normal text-neutral-500">(optional)</span>
                  </label>
                  <RespondentPicker value={row.person} onChange={(p) => pick(row, p)} disabled={disabled} />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => togglePicker(row.key)}
                  disabled={disabled}
                  className="text-xs font-medium text-maroon hover:underline disabled:opacity-50"
                >
                  Know their BulSU account? Search the directory
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {value.length < MAX_RESPONDENTS && (
        <button
          type="button"
          onClick={() => onChange([...value, emptyRespondent()])}
          disabled={disabled}
          className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
        >
          + Add another respondent ({value.length}/{MAX_RESPONDENTS})
        </button>
      )}
    </div>
  );
}
