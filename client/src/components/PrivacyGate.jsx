import { useEffect, useRef, useState } from "react";
import {
  AFFILIATIONS,
  CONFIDENTIALITY_REMINDERS,
  NOTICE_SECTIONS,
  PRIVACY_NOTICE_VERSION,
  PURPOSES,
} from "../lib/privacyNotice.js";

// The two steps before the sign-in form: read and acknowledge the privacy
// notice, then give the details used to identify and document the sign-in.
// Both are asked for every time: the details are never remembered or
// autofilled, so nothing about the last person to sign in is left on the
// browser.

const EMPTY = { fullName: "", idNumber: "", affiliation: "", purpose: "", purposeOther: "" };

// Details remembered by earlier versions are cleared from browsers that
// still have them.
try {
  localStorage.removeItem("codi_signin_details_v1");
} catch {
  // Storage blocked: nothing was saved there either.
}

// What the server expects with the password.
export function privacyPayload(details) {
  return { noticeVersion: PRIVACY_NOTICE_VERSION, acknowledged: true, confidentiality: true, ...details };
}

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

export function NoticeStep({ onContinue }) {
  const boxRef = useRef(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confidential, setConfidential] = useState(false);

  // A notice short enough to fit needs no scrolling to count as read.
  useEffect(() => {
    const box = boxRef.current;
    if (box && box.scrollHeight <= box.clientHeight + 8) setReadToEnd(true);
  }, []);

  function onScroll() {
    const box = boxRef.current;
    if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 16) setReadToEnd(true);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <img src="/bulsu-logo.png" alt="BulSU" className="h-11 w-11" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-maroon">Step 1 of 3 · Before you sign in</p>
          <h1 className="text-lg font-bold text-neutral-900">Data Privacy Notice and Confidentiality</h1>
        </div>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Privacy notice"
        className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700 focus:outline-none focus:ring-1 focus:ring-maroon"
      >
        <p>
          CODI-IS processes sensitive personal information about people involved in harassment and misconduct
          cases. Please read how it is collected, used and protected before you continue.
        </p>
        {NOTICE_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-semibold text-neutral-900">{section.title}</h2>
            {section.body?.map((text) => (
              <p key={text} className="mt-1">
                {text}
              </p>
            ))}
            {section.list && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {section.list.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section className="rounded-md border border-maroon/20 bg-maroon/5 p-3">
          <h2 className="font-semibold text-maroon">Confidentiality reminders</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {CONFIDENTIALITY_REMINDERS.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
        <p className="text-xs text-neutral-500">Notice version {PRIVACY_NOTICE_VERSION}.</p>
      </div>

      {!readToEnd && (
        <p className="mt-2 text-xs text-neutral-500">Scroll to the end of the notice to continue.</p>
      )}

      <div className="mt-4 space-y-2">
        <label className={`flex items-start gap-2 text-sm ${readToEnd ? "text-neutral-800" : "text-neutral-400"}`}>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={!readToEnd}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I have read and understood the Data Privacy Notice, and I consent to the collection and processing of my
            personal information for the purposes stated.
          </span>
        </label>
        <label className={`flex items-start gap-2 text-sm ${readToEnd ? "text-neutral-800" : "text-neutral-400"}`}>
          <input
            type="checkbox"
            checked={confidential}
            disabled={!readToEnd}
            onChange={(e) => setConfidential(e.target.checked)}
            className="mt-0.5"
          />
          <span>I will keep all information I access in CODI-IS confidential and use it only for its official purpose.</span>
        </label>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!(readToEnd && acknowledged && confidential)}
        className="mt-5 w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        I agree, continue
      </button>
    </div>
  );
}

export function DetailsStep({ initial, serverError, onBack, onContinue }) {
  const [details, setDetails] = useState(initial || EMPTY);
  const [error, setError] = useState("");
  const set = (key) => (e) => setDetails((d) => ({ ...d, [key]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    const clean = {
      fullName: details.fullName.replace(/\s+/g, " ").trim(),
      idNumber: details.idNumber.trim().toUpperCase(),
      affiliation: details.affiliation,
      purpose: details.purpose,
      purposeOther: details.purpose === "OTHER" ? details.purposeOther.trim() : "",
    };
    if (clean.fullName.length < 2) return setError("Enter your full name.");
    if (clean.idNumber.length < 3) return setError("Enter your student or employee number.");
    if (!clean.affiliation) return setError("Choose your role or affiliation.");
    if (!clean.purpose) return setError("Choose your purpose for signing in.");
    if (clean.purpose === "OTHER" && !clean.purposeOther) return setError("Describe your purpose for signing in.");
    setError("");
    onContinue(clean);
  }

  const shown = error || serverError;

  return (
    <form onSubmit={submit} noValidate autoComplete="off" className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-maroon">Step 2 of 3</p>
        <h1 className="text-lg font-bold text-neutral-900">Your details</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Used to identify you and document this sign-in. University members' numbers are checked against their
          account.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Full name</label>
        <input value={details.fullName} onChange={set("fullName")} maxLength={120} autoComplete="off" className={inputClass} placeholder="Juan Dela Cruz" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Student / employee number</label>
        <input value={details.idNumber} onChange={set("idNumber")} maxLength={40} autoComplete="off" className={inputClass} placeholder="e.g. 2022-10431 or EMP-1042" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Role / affiliation</label>
          <select value={details.affiliation} onChange={set("affiliation")} className={inputClass}>
            <option value="">Choose…</option>
            {Object.entries(AFFILIATIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Purpose of access</label>
          <select value={details.purpose} onChange={set("purpose")} className={inputClass}>
            <option value="">Choose…</option>
            {Object.entries(PURPOSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {details.purpose === "OTHER" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Describe your purpose</label>
          <input value={details.purposeOther} onChange={set("purposeOther")} maxLength={120} className={inputClass} />
        </div>
      )}
      {shown && (
        <p role="alert" className="text-sm text-red-600">
          {shown}
        </p>
      )}
      <button type="submit" className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light">
        Continue to sign in
      </button>
      <button type="button" onClick={onBack} className="text-xs font-medium text-maroon hover:underline">
        ← Back to the privacy notice
      </button>
    </form>
  );
}
