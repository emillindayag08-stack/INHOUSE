import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { caseLabel, caseLabelPrefix } from "../lib/constants.js";
import { viewerOf } from "../lib/caseRole.js";

// The respondent's details as they stood when the case was filed, falling
// back to their current directory record.
const respondentTypeOf = (c) =>
  c.respondentTypeAtFiling || c.claimedRespondentType || c.respondentUser?.userType || null;
const respondentCollegeOf = (c) =>
  c.respondentCollegeAtFiling || c.claimedRespondentCollege || c.respondentUser?.department || "";

const RESPONDENT_TYPE_LABELS = {
  STUDENT: "Student",
  PERSONNEL: "University Personnel",
};

// Complaints are only editable after the Secretariat returns them for
// correction — mirrors the backend rule on PATCH /cases/:id (cases.routes.js).
const EDITABLE_STATUSES = new Set(["RETURNED_FOR_CORRECTION"]);

// Standalone, print-friendly rendition of the complaint. The complainant can
// print it (or save as PDF from the browser dialog) and take it to a notary,
// then upload the notarized copy back to the case within the 3-day window.
export default function PrintComplaintPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [caseDetail, setCaseDetail] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api
      .get(`/cases/${id}`)
      .then((res) => setCaseDetail(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load case"));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-red-600">
        {error} — <Link to="/" className="text-maroon underline">back to dashboard</Link>
      </div>
    );
  }
  if (!caseDetail) {
    return <div className="mx-auto max-w-2xl p-8 text-sm text-neutral-500">Loading…</div>;
  }
  if (viewerOf(caseDetail, user).isRespondent) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-red-600">
        This page isn't available to you — you can view the show-cause order for this case
        instead. — <Link to={`/cases/${caseDetail.id}`} className="text-maroon underline">back to case</Link>
      </div>
    );
  }

  const filedDate = new Date(caseDetail.filedAt).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const canEdit =
    viewerOf(caseDetail, user).isComplainant &&
    EDITABLE_STATUSES.has(caseDetail.status);
  // A printout can travel, so an anonymous complaint never names its
  // complainant on paper — not even the complainant's own copy — and has no
  // oath or notary block, since it is not notarized.
  const anonymous = !!caseDetail.isAnonymous;

  return (
    <div className="min-h-dvh bg-neutral-100 py-8 print:bg-white print:py-0">
      {/* Controls — hidden on paper */}
      <div className="mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-4 print:hidden">
        <Link to={`/cases/${caseDetail.id}`} className="text-sm text-maroon hover:underline">
          ← Back to case
        </Link>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Edit before printing
            </button>
          )}
          {!editing && (
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-maroon px-5 py-2 text-sm font-medium text-white hover:bg-maroon-light"
            >
              Print / Save as PDF
            </button>
          )}
        </div>
      </div>

      {/* The document */}
      <div className="mx-auto max-w-[8.5in] bg-white p-10 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center justify-center gap-4 border-b-2 border-neutral-800 pb-4 text-center">
          <img src="/bulsu-logo.png" alt="Bulacan State University" className="h-16 w-16 object-contain" />
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-600">Republic of the Philippines</p>
            <p className="text-base font-bold text-neutral-900">BULACAN STATE UNIVERSITY</p>
            <p className="text-xs text-neutral-600">City of Malolos, Bulacan</p>
            <p className="mt-1 text-xs font-medium text-neutral-800">
              Committee on Decorum and Investigation (CODI)
            </p>
          </div>
        </header>

        <h1 className="mt-6 text-center text-lg font-bold tracking-wide text-neutral-900">
          {anonymous ? "ANONYMOUS COMPLAINT" : "SWORN COMPLAINT"}
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-600">
          {caseLabelPrefix(caseDetail)} {caseLabel(caseDetail)} · Filed on {filedDate}
        </p>

        {editing ? (
          <ComplaintEditForm
            caseDetail={caseDetail}
            onSaved={(updated) => {
              setCaseDetail(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="mt-8 space-y-6 text-sm text-neutral-900">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {anonymous ? (
                  <Row label="Complainant" value="CODI (anonymous complaint)" />
                ) : (
                  <>
                    <Row label="Complainant" value={caseDetail.complainant.fullName} />
                    <Row label="Department / College" value={caseDetail.complainant.department || "—"} />
                  </>
                )}
                {(caseDetail.respondents || []).length > 1 ? (
                  caseDetail.respondents.map((r, i) => (
                    <Row
                      key={r.id}
                      label={`Respondent ${i + 1}`}
                      value={`${r.user?.fullName || r.claimedName} — ${
                        RESPONDENT_TYPE_LABELS[r.typeAtFiling || r.claimedType] || "—"
                      }, ${r.collegeAtFiling || r.claimedCollege || "—"}`}
                    />
                  ))
                ) : (
                  <>
                    <Row
                      label="Respondent"
                      value={caseDetail.respondentUser?.fullName || caseDetail.claimedRespondentName || "—"}
                    />
                    <Row
                      label="Respondent status"
                      value={RESPONDENT_TYPE_LABELS[respondentTypeOf(caseDetail)] || "—"}
                    />
                    <Row label="Respondent department" value={respondentCollegeOf(caseDetail) || "—"} />
                  </>
                )}
                <Row
                  label="Governing framework"
                  value={caseDetail.governingFramework === "GBSH_CODE" ? "BulSU Anti-GBSH Code" : "2025 RACCS (Civil Service)"}
                />
              </tbody>
            </table>

            <div>
              <p className="font-medium">STATEMENT OF THE COMPLAINT</p>
              <p className="mt-2 whitespace-pre-wrap break-words border border-neutral-300 p-4">
                {caseDetail.description}
              </p>
            </div>

            {anonymous ? (
              <p className="text-neutral-700">
                Filed anonymously. The facts above are stated as verifiable public knowledge.
              </p>
            ) : (
            <>
            <p>
              I hereby attest that the foregoing statements are true and correct to the best of my
              personal knowledge and belief.
            </p>

            <div className="mt-10 flex justify-end">
              <div className="w-64 text-center">
                <div className="border-t border-neutral-800 pt-1">
                  <p className="font-medium uppercase">{caseDetail.complainant.fullName}</p>
                  <p className="text-xs text-neutral-600">Complainant (signature over printed name)</p>
                </div>
              </div>
            </div>

            <div className="mt-10 border border-neutral-400 p-4 text-sm">
              <p className="font-medium">ACKNOWLEDGMENT</p>
              <p className="mt-2">
                SUBSCRIBED AND SWORN to before me this ____ day of ____________, 20____, in
                ____________________, Philippines, affiant exhibiting to me a competent evidence of
                identity: ____________________________.
              </p>
              <div className="mt-8 flex justify-end">
                <div className="w-64 text-center">
                  <div className="border-t border-neutral-800 pt-1">
                    <p className="text-xs text-neutral-600">Notary Public</p>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-1 text-xs text-neutral-700">
                <p>Doc. No. ______;</p>
                <p>Page No. ______;</p>
                <p>Book No. ______;</p>
                <p>Series of 20____.</p>
              </div>
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ComplaintEditForm({ caseDetail, onSaved, onCancel }) {
  const [description, setDescription] = useState(caseDetail.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { data } = await api.patch(`/cases/${caseDetail.id}`, {
        description,
        isPeerToPeer: caseDetail.isPeerToPeer,
        isFirstOffense: caseDetail.isFirstOffense,
      });
      onSaved({ ...caseDetail, ...data, complainant: caseDetail.complainant, respondentUser: caseDetail.respondentUser });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-sm">
      <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        Respondent: <span className="font-medium text-neutral-800">{caseDetail.respondentUser.fullName}</span>. To
        name someone else, use Edit complaint on the case page.
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-600">
          Statement of the complaint
        </label>
        <textarea
          required
          rows={8}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }) {
  return (
    <tr>
      <td className="w-48 border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600 print:bg-white">
        {label}
      </td>
      <td className="border border-neutral-300 px-3 py-2">{value}</td>
    </tr>
  );
}
