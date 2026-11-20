import RequiredMark, { RequiredKey } from "../components/RequiredMark.jsx";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import Layout from "../components/Layout.jsx";
import { XIcon } from "../components/icons.jsx";
import ReviewSummary, { fileListValue } from "../components/ReviewSummary.jsx";
import NotarizedFilePicker, { appendNotarizedFiles, NOTARIZED_HINT } from "../components/NotarizedFilePicker.jsx";
import RespondentList, { TYPE_LABEL, emptyRespondent, respondentsPayload } from "../components/RespondentList.jsx";
import { DESCRIPTION_MAX, EVIDENCE_LINK_MAX } from "../lib/constants.js";


// Step 1: how the complainant files. An anonymous complaint hides who filed it
// from everyone else on the case, needs no notarized copy, and proceeds by the
// respondent's position paper only. `anonymousBlocked` is the reason this
// account can't file anonymously right now (limits in anonymousGuard.js), if any.
function FilingModeStep({ onChoose, anonymousBlocked }) {
  const card =
    "flex w-full flex-col items-start gap-1 rounded-xl border border-neutral-200 bg-white p-5 text-left transition hover:border-maroon hover:ring-1 hover:ring-maroon disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-200 disabled:hover:ring-0";
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-maroon">Step 1 of 2</p>
      <h2 className="text-base font-bold text-neutral-900">How do you want to file?</h2>
      <button type="button" onClick={() => onChoose(false)} className={card}>
        <span className="text-sm font-semibold text-neutral-900">Non-anonymously</span>
        <span className="text-sm text-neutral-600">
          File under your name. You upload a notarized copy within 3 days, and you take part in the
          proceedings.
        </span>
      </button>
      <button type="button" onClick={() => onChoose(true)} disabled={Boolean(anonymousBlocked)} className={card}>
        <span className="text-sm font-semibold text-neutral-900">Anonymously</span>
        <span className="text-sm text-neutral-600">
          CODI takes the case against the respondent in your place, and your identity is hidden from
          everyone on it. No notarized copy is needed, and once you send it there is nothing else for
          you to do.
        </span>
        <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Note: CODI can only act on an anonymous complaint in certain cases. You'll see them in the
          next step.
        </span>
      </button>
      {anonymousBlocked && (
        <p role="status" className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
          {anonymousBlocked}
        </p>
      )}
    </div>
  );
}

// Section 12 of the 2025 RACCS: the grounds on which an anonymous complaint may
// be entertained. Any one of them is enough. `plain` is what the complainant
// reads; `official` is the rule as written, one click away.
const ANONYMOUS_CONDITIONS = [
  {
    key: "PUBLIC_KNOWLEDGE",
    title: "Many people already know about it",
    plain: "What happened is public knowledge, not something only you saw or heard.",
    official: "of public knowledge;",
  },
  {
    key: "VERIFIABLE",
    title: "It can be checked",
    plain: "CODI can confirm it happened, for example by asking others or looking at records.",
    official: "verifiable;",
  },
  {
    key: "DOCUMENTARY_EVIDENCE",
    title: "You have strong evidence",
    plain:
      "Documents, photos, messages, recordings or witnesses that show the person most likely did it. Add at least one evidence link below: you can't add anything after you send.",
    official:
      "shown by documentary or direct evidence sufficient to establish reasonable ground to believe that the person complained of committed the offense; or",
  },
  {
    key: "AGENCY_REFERRAL",
    title: "An office already looked into it",
    plain:
      "It was reported anonymously, investigated by an office or agency, and passed to the Civil Service Commission. That office then stands as the complainant.",
    official:
      "reported anonymously and investigated by an agency and is referred to the Commission or any CSC ROs. For this purpose, the agency which made the referral shall be considered a nominal complainant, and the verification of the complaint as well as submission of Certificate of Non-Forum Shopping will no longer be required.",
  },
];

// What an anonymous complaint needs on top of the usual form (the server
// checks the same in services/anonymousGuard.js).
const ANONYMOUS_DESCRIPTION_MIN = 100;

// Shown above an anonymous complaint, while it is filled in and on review. The
// complainant ticks every condition their complaint meets (at least one)
// before the form lets them go on; CODI screens it against those.
function AnonymousConditions({ grounds, onChange, disabled }) {
  // A checkbox group has no "at least one" rule of its own, so the first box
  // carries it: the browser stops the form there until one is ticked.
  const firstRef = useRef(null);
  useEffect(() => {
    firstRef.current?.setCustomValidity(grounds.length ? "" : "Tick at least one condition your complaint meets.");
  }, [grounds]);
  const toggle = (key) => onChange(grounds.includes(key) ? grounds.filter((g) => g !== key) : [...grounds, key]);

  return (
    <fieldset className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <legend className="sr-only">Which Section 12 conditions does your complaint meet?</legend>
      <h2 className="font-semibold">Before you file anonymously</h2>
      <p className="mt-1">
        CODI can only act on an anonymous complaint if <span className="font-semibold">at least one</span> of
        these is true. Tick every one that fits yours:
        <RequiredMark />
      </p>
      <div className="mt-3 space-y-2">
        {ANONYMOUS_CONDITIONS.map((condition, i) => {
          const checked = grounds.includes(condition.key);
          return (
            <label
              key={condition.key}
              className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 ${
                checked ? "border-amber-400 bg-white" : "border-transparent hover:bg-white/60"
              }`}
            >
              <input
                ref={i === 0 ? firstRef : undefined}
                type="checkbox"
                name="anonymousGrounds"
                value={condition.key}
                checked={checked}
                onChange={() => toggle(condition.key)}
                disabled={disabled}
                className="mt-1 h-4 w-4 shrink-0 accent-maroon"
              />
              <span>
                <span className="block font-medium">{condition.title}</span>
                <span className="block text-amber-800">{condition.plain}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-amber-900">
        <span className="font-medium">None of these fit?</span> File under your name instead: go back with{" "}
        <span className="font-medium">Change</span> above.
      </p>
      <details className="mt-3 text-xs text-amber-800">
        <summary className="cursor-pointer font-medium hover:underline">
          Read the official wording (Section 12, 2025 RACCS)
        </summary>
        <p className="mt-2">
          No anonymous complaint shall be entertained unless the alleged act/s or omission/s complained of
          is/are:
        </p>
        <ol className="mt-1.5 space-y-1 pl-1">
          {ANONYMOUS_CONDITIONS.map((condition, i) => (
            <li key={condition.title} className="flex gap-2">
              <span className="shrink-0 font-medium">{String.fromCharCode(97 + i)}.</span>
              <span>{condition.official}</span>
            </li>
          ))}
        </ol>
      </details>
    </fieldset>
  );
}

// The last thing an anonymous complainant confirms before sending.
function FalseComplaintDeclaration({ accepted, onChange, disabled }) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
      <input
        type="checkbox"
        required
        checked={accepted}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-maroon"
      />
      <span>
        I declare that this complaint is true to the best of my knowledge. I understand that knowingly filing a
        false complaint is itself an offense, and that the system records which account filed it, even though no
        one on the case can see who I am.
        <RequiredMark />
      </span>
    </label>
  );
}

export default function SubmitComplaintPage() {
  const navigate = useNavigate();
  const evidenceUrlRef = useRef(null);
  // null until the complainant picks how to file (step 1).
  const [anonymous, setAnonymous] = useState(null);
  // What an anonymous complaint adds: the Section 12 condition it meets, when
  // and where it happened, and the declaration. Asked again if they switch
  // modes and come back.
  const [anonymousGrounds, setAnonymousGrounds] = useState([]);
  const [incident, setIncident] = useState({ date: "", place: "" });
  const [declared, setDeclared] = useState(false);
  // Why this account can't file anonymously right now, or "" if it can.
  const [anonymousBlocked, setAnonymousBlocked] = useState("");
  useEffect(() => {
    api
      .get("/cases/anonymous-allowance")
      .then((res) => setAnonymousBlocked(res.data.allowed ? "" : res.data.reason))
      .catch(() => {}); // the filing itself is checked again on the server
  }, []);
  const [form, setForm] = useState({
    description: "",
    isPeerToPeer: true,
    isFirstOffense: true,
  });
  // Who the complaint is against: one to three people, in the complainant's own
  // words. Pointing a row at a directory account is optional — the Secretariat
  // confirms each identity either way, and only then is the case assigned.
  const [respondents, setRespondents] = useState(() => [emptyRespondent()]);

  // Staged evidence links: [{ key, url, name }] — the case doesn't exist yet, so
  // these are held here and posted once it does. Evidence is never uploaded:
  // it stays in the complainant's own storage and is referenced by link.
  const [evidence, setEvidence] = useState([]);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  // Staged notarized complaint document — single optional file.
  const [complaintFiles, setComplaintFiles] = useState([]);
  // After the form is filled in, the complainant reads it back before it is sent.
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  function update(field) {
    return (e) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
    };
  }

  function addEvidenceLink() {
    setEvidenceError("");
    const url = evidenceUrl.trim();
    if (!url) return;
    if (evidence.length >= EVIDENCE_LINK_MAX) {
      setEvidenceError(`You can add up to ${EVIDENCE_LINK_MAX} evidence links. Remove one to add another.`);
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      setEvidenceError("Enter a valid link, including https://");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setEvidenceError("Links must start with http:// or https://");
      return;
    }
    setEvidence((prev) => [
      ...prev,
      {
        key: `${url}-${Date.now()}-${Math.random()}`,
        url: parsed.toString(),
        name: evidenceName.trim() || parsed.hostname,
      },
    ]);
    setEvidenceUrl("");
    setEvidenceName("");
    if (evidenceUrlRef.current) evidenceUrlRef.current.focus();
  }

  function renameEvidence(key, name) {
    setEvidence((prev) => prev.map((item) => (item.key === key ? { ...item, name } : item)));
  }

  function removeEvidence(key) {
    setEvidence((prev) => prev.filter((item) => item.key !== key));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // First submit (after the browser has checked the required fields) opens the
    // review; only the confirmation there files the complaint.
    if (!reviewing) {
      // The one rule the browser can't check by itself.
      if (anonymous && anonymousGrounds.includes("DOCUMENTARY_EVIDENCE") && evidence.length === 0) {
        setError("You chose \"You have strong evidence\". Add at least one evidence link before reviewing.");
        return;
      }
      setError("");
      setReviewing(true);
      window.scrollTo({ top: 0 });
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/cases", {
        ...form,
        isAnonymous: anonymous,
        respondents: respondentsPayload(respondents),
        // An anonymous complainant can't add anything once it is sent, so
        // their evidence goes with the complaint itself, with what CODI
        // screens it on.
        ...(anonymous
          ? {
              evidenceLinks: evidence.map((item) => ({ url: item.url, name: item.name.trim() })),
              anonymousGrounds,
              incidentDate: incident.date,
              incidentPlace: incident.place.trim(),
              falseComplaintAck: declared,
            }
          : {}),
      });

      const failed = [];

      // The notarized complaint document is optional here — the complainant
      // can also print and upload it later within the 3-day window. An
      // anonymous complaint has none.
      if (!anonymous && complaintFiles.length > 0) {
        setProgress("Uploading notarized complaint…");
        try {
          const formData = new FormData();
          appendNotarizedFiles(formData, complaintFiles);
          formData.append("docType", "COMPLAINT");
          await api.post(`/cases/${data.id}/documents`, formData);
        } catch {
          failed.push("notarized complaint");
        }
      }

      // Evidence is optional, and is recorded as links rather than uploads.
      for (let i = 0; i < (anonymous ? 0 : evidence.length); i++) {
        const item = evidence[i];
        setProgress(`Saving evidence link ${i + 1} of ${evidence.length}…`);
        try {
          await api.post(`/cases/${data.id}/documents/links`, {
            externalUrl: item.url,
            fileName: item.name.trim(),
          });
        } catch {
          failed.push(item.name || item.url);
        }
      }
      if (failed.length > 0) {
        window.alert(
          `Your complaint was submitted, but these attachments failed to save: ${failed.join(", ")}. You can add them again from the case page.`
        );
      }
      navigate(`/cases/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit complaint");
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">File a complaint</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Information submitted here is routed to the CODI Secretariat for verification.
          The governing framework (BulSU Anti-GBSH Code or RACCS 2025) is determined
          automatically based on the respondent's status.
        </p>

        {anonymous === null ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
            <FilingModeStep onChoose={setAnonymous} anonymousBlocked={anonymousBlocked} />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-maroon">
              Step 2 of 2 · Filing {anonymous ? "anonymously" : "non-anonymously"}
            </p>
            {!reviewing && (
              <button
                type="button"
                onClick={() => {
                  setAnonymous(null);
                  setAnonymousGrounds([]);
                  setIncident({ date: "", place: "" });
                  setDeclared(false);
                  setError("");
                }}
                disabled={loading}
                className="text-xs font-medium text-maroon hover:underline"
              >
                Change
              </button>
            )}
          </div>
          {anonymous && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              This complaint won't expose your identity to anyone.
            </p>
          )}
          {anonymous && (
            <AnonymousConditions
              grounds={anonymousGrounds}
              onChange={setAnonymousGrounds}
              disabled={loading || reviewing}
            />
          )}
          <RequiredKey />
          {reviewing && (
            <>
              <h2 className="text-base font-bold text-neutral-900">Review your complaint</h2>
              <ReviewSummary
                note="Check everything below. Nothing is sent to CODI until you confirm."
                rows={[
                  { label: "Filed", value: anonymous ? "Anonymously: your identity is hidden from everyone on the case" : "Under your name" },
                  ...(anonymous
                    ? [
                        {
                          label: anonymousGrounds.length > 1 ? "Section 12 conditions" : "Section 12 condition",
                          value:
                            ANONYMOUS_CONDITIONS.filter((c) => anonymousGrounds.includes(c.key))
                              .map((c) => c.title)
                              .join("\n") || "—",
                        },
                        {
                          label: "Incident",
                          value: `${incident.date ? new Date(`${incident.date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" }) : "—"} · ${incident.place.trim()}`,
                        },
                      ]
                    : []),
                  { label: "Description", value: form.description },
                  ...respondents.map((r, i) => ({
                    label: respondents.length > 1 ? `Respondent ${i + 1}` : "Respondent",
                    value: [
                      r.name.trim(),
                      `${TYPE_LABEL[r.type]} · ${r.college}`,
                      r.person
                        ? `BulSU account: ${r.person.fullName}`
                        : "No account given — the Secretariat will identify them",
                    ].join("\n"),
                  })),
                  ...(anonymous
                    ? []
                    : [
                        {
                          label: "Notarized document",
                          value:
                            complaintFiles.length > 0
                              ? fileListValue(complaintFiles)
                              : "Not attached — you can upload it from the case page within 3 days",
                        },
                      ]),
                  {
                    label: "Evidence links",
                    value:
                      evidence.length > 0
                        ? evidence.map((item) => `${item.name} — ${item.url}`).join("\n")
                        : "None",
                  },
                ]}
              />
              {/* A last nudge, not a block: evidence stays optional unless "strong evidence" was ticked. */}
              {anonymous && evidence.length === 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span className="font-semibold">You haven't added any evidence.</span> CODI highly recommends
                  it: an anonymous complaint can't be added to after you send it. Choose{" "}
                  <span className="font-medium">Edit</span> to add evidence links, or confirm to send it as it is.
                </p>
              )}
            </>
          )}
          <div className={reviewing ? "hidden" : "space-y-5"}>
          {/* Who it is against comes first: the respondent's details are what an
              anonymous complaint stands on. */}
          <RespondentList value={respondents} onChange={setRespondents} disabled={loading} />

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Description of the incident
              <RequiredMark />
            </label>
            {anonymous && (
              <p className="mb-1.5 text-xs text-amber-800">
                Detail the specific event that happened, in at least {ANONYMOUS_DESCRIPTION_MIN} characters, so
                CODI can check it.
              </p>
            )}
            <textarea
              required
              rows={5}
              minLength={anonymous ? ANONYMOUS_DESCRIPTION_MIN : undefined}
              maxLength={DESCRIPTION_MAX}
              value={form.description}
              onChange={update("description")}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              placeholder="Describe what happened, including dates and circumstances."
            />
            <p className="mt-1 text-right text-xs text-neutral-400">
              {anonymous && form.description.trim().length < ANONYMOUS_DESCRIPTION_MIN
                ? `${(ANONYMOUS_DESCRIPTION_MIN - form.description.trim().length).toLocaleString()} more characters needed · `
                : ""}
              {form.description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
            </p>
          </div>

          {anonymous && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">
                  Date of the incident
                  <RequiredMark />
                </span>
                <input
                  type="date"
                  required
                  max={new Date().toLocaleDateString("en-CA")}
                  value={incident.date}
                  onChange={(e) => setIncident((i) => ({ ...i, date: e.target.value }))}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">
                  Where it happened
                  <RequiredMark />
                </span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  value={incident.place}
                  onChange={(e) => setIncident((i) => ({ ...i, place: e.target.value }))}
                  placeholder="e.g. CICT laboratory, 2nd floor"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                />
              </label>
            </div>
          )}

          {!anonymous && (
          <div className="rounded-lg border border-dashed border-neutral-300 p-4">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Notarized complaint document <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              {NOTARIZED_HINT}. Don't have it notarized yet? You
              can file now and print/upload it from the case page within 3 days.
            </p>
            <NotarizedFilePicker
              files={complaintFiles}
              onChange={setComplaintFiles}
              confirmable={false}
              disabled={loading}
            />
          </div>
          )}

          <div className="rounded-lg border border-dashed border-neutral-300 p-4">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Evidence{" "}
              <span className="font-normal text-neutral-500">
                {anonymous ? "(highly recommended)" : "(optional)"}
              </span>
            </label>
            {anonymous && (
              <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold">CODI highly recommends that you provide evidence.</span> An
                anonymous complaint can't be followed up with you, so the evidence you add here is what CODI
                relies on to check it. Without it, your complaint is much less likely to be entertained.
              </p>
            )}
            <p className="mb-2 text-xs text-neutral-500">
              Photos, videos, voice recordings, screenshots, or PDFs. Upload them to Google Drive,
              OneDrive, or similar, then add the share links here — make sure they're viewable by
              CODI. Up to {EVIDENCE_LINK_MAX}
              {anonymous
                ? ". Add all of it now: you can't add anything after sending an anonymous complaint."
                : "; you can also add evidence later from the case page."}
            </p>
            {evidence.length >= EVIDENCE_LINK_MAX ? (
              <p className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500">
                You have added all {EVIDENCE_LINK_MAX} evidence links. Remove one below to add a
                different one.
              </p>
            ) : (
            <div className="flex flex-wrap gap-2">
              <input
                ref={evidenceUrlRef}
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              />
              <input
                type="text"
                value={evidenceName}
                maxLength={200}
                onChange={(e) => setEvidenceName(e.target.value)}
                placeholder="Description (optional)"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
              />
              <button
                type="button"
                onClick={addEvidenceLink}
                disabled={!evidenceUrl.trim()}
                className="rounded-md border border-maroon/30 bg-maroon/5 px-3 py-2 text-sm font-medium text-maroon hover:bg-maroon/10 disabled:opacity-50"
              >
                Add link
              </button>
            </div>
            )}
            {evidenceError && <p className="mt-2 text-xs text-red-600">{evidenceError}</p>}

            {evidence.length > 0 && (
              <ul className="mt-3 space-y-2">
                {evidence.map((item) => (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 p-2"
                  >
                    <input
                      type="text"
                      value={item.name}
                      maxLength={200}
                      onChange={(e) => renameEvidence(item.key, e.target.value)}
                      aria-label={`Description for ${item.url}`}
                      className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
                    />
                    <span
                      className="max-w-[14rem] truncate text-xs text-neutral-400"
                      title={item.url}
                    >
                      {item.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEvidence(item.key)}
                      disabled={loading}
                      title="Remove link"
                      aria-label={`Remove ${item.name}`}
                      className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          </div>

          {anonymous && (
            <FalseComplaintDeclaration accepted={declared} onChange={setDeclared} disabled={loading || reviewing} />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {reviewing ? (
            <div className="flex flex-wrap gap-3">
              <button
                key="edit"
                type="button"
                onClick={() => setReviewing(false)}
                disabled={loading}
                className="flex-1 rounded-md border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-60"
              >
                Edit
              </button>
              <button
                key="confirm"
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-maroon py-2.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
              >
                {loading ? progress || "Submitting…" : "Confirm and submit"}
              </button>
            </div>
          ) : (
            <button
              key="review"
              type="submit"
              className="w-full rounded-md bg-maroon py-2.5 text-sm font-medium text-white hover:bg-maroon-light"
            >
              Review before submitting
            </button>
          )}
          {anonymous && (
            <p className="text-center text-xs text-neutral-500">
              Note: this complaint won't expose your identity to anyone.
            </p>
          )}
        </form>
        )}
      </div>
    </Layout>
  );
}
