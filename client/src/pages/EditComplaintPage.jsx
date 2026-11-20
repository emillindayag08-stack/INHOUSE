import RequiredMark, { RequiredKey } from "../components/RequiredMark.jsx";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import CaseDocuments from "../components/CaseDocuments.jsx";
import RespondentList, {
  respondentFromCase,
  respondentsPayload,
} from "../components/RespondentList.jsx";
import { DESCRIPTION_MAX, caseLabel } from "../lib/constants.js";

const EDITABLE_STATUSES = new Set(["RETURNED_FOR_CORRECTION"]);

export default function EditComplaintPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(null); // null = still loading
  const [caseDetail, setCaseDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [wasReturned, setWasReturned] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Everyone the complaint names, as editable rows. A row keeps its id so the
  // server can tell an edited respondent from a new one.
  const [respondents, setRespondents] = useState([]);

  const refresh = useCallback(() => {
    api.get(`/cases/${id}`).then((res) => setCaseDetail(res.data));
  }, [id]);

  useEffect(() => {
    api
      .get(`/cases/${id}`)
      .then((res) => {
        const c = res.data;
        if (c.complainantId !== user.id) {
          setLoadError("You can only edit your own complaint.");
          return;
        }
        if (!EDITABLE_STATUSES.has(c.status)) {
          setLoadError("This complaint can only be edited after the Secretariat returns it for correction.");
          return;
        }
        setWasReturned(c.status === "RETURNED_FOR_CORRECTION");
        setCaseDetail(c);
        setForm({
          description: c.description,
          isPeerToPeer: c.isPeerToPeer,
          isFirstOffense: c.isFirstOffense,
          caseNumber: caseLabel(c),
        });
        setRespondents(
          c.respondents?.length
            ? c.respondents.map(respondentFromCase)
            : [
                // A case loaded without respondent rows: its single mirrored respondent.
                respondentFromCase({
                  claimedName: c.claimedRespondentName,
                  claimedType: c.claimedRespondentType,
                  claimedCollege: c.claimedRespondentCollege,
                  user: c.respondentUser,
                  typeAtFiling: c.respondentTypeAtFiling,
                  collegeAtFiling: c.respondentCollegeAtFiling,
                }),
              ]
        );
      })
      .catch((err) => setLoadError(err.response?.data?.error || "Failed to load case"));
  }, [id, user.id]);

  function update(field) {
    return (e) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.patch(`/cases/${id}`, {
        ...form,
        respondents: respondentsPayload(respondents),
      });
      navigate(`/cases/${id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <Layout>
        <p className="text-sm text-red-600">{loadError}</p>
        <Link to={`/cases/${id}`} className="mt-2 inline-block text-sm text-maroon hover:underline">
          Back to case
        </Link>
      </Layout>
    );
  }

  if (!form) {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <Link to={`/cases/${id}`} className="mb-4 inline-block text-sm text-maroon hover:underline">
          ← Back to case
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">
          Edit complaint {form.caseNumber}
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          {wasReturned
            ? "This complaint was returned for correction. Saving your changes will resubmit it to the Secretariat for verification."
            : "You can edit your complaint until the Secretariat verifies it."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6">
          <RequiredKey />
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Description of the incident
              <RequiredMark />
            </label>
            <textarea
              required
              rows={5}
              maxLength={DESCRIPTION_MAX}
              value={form.description}
              onChange={update("description")}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
            />
            <p className="mt-1 text-right text-xs text-neutral-400">
              {form.description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
            </p>
          </div>

          <RespondentList value={respondents} onChange={setRespondents} disabled={saving} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md bg-maroon py-2.5 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
            >
              {saving ? "Saving…" : wasReturned ? "Save and resubmit" : "Save changes"}
            </button>
            <Link
              to={`/cases/${id}`}
              className="rounded-md border border-neutral-300 px-6 py-2.5 text-center text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Cancel
            </Link>
          </div>
        </form>

        {caseDetail && (
          <div className="mt-6">
            <CaseDocuments caseDetail={caseDetail} user={user} onDone={refresh} />
          </div>
        )}
      </div>
    </Layout>
  );
}
