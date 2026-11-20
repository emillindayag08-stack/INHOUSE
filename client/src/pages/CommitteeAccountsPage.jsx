import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

// The Secretariat's page for the Committee's membership: who is on it, create an
// account for a new member, and deactivate the account of one who resigns or is
// replaced. Deactivating never deletes anything — what the person did stays
// attributed to them — and the account can be reactivated.
export default function CommitteeAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    api
      .get("/auth/committee-accounts")
      .then((res) => setAccounts(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load the accounts"));
  }, []);

  useEffect(() => {
    if (user.role === "SECRETARIAT") load();
  }, [load, user.role]);

  if (user.role !== "SECRETARIAT") {
    return (
      <Layout>
        <p className="text-sm text-neutral-500">This page is only available to the CODI Secretariat.</p>
      </Layout>
    );
  }

  const active = (accounts || []).filter((a) => !a.deactivatedAt);

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Committee accounts</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Create an account for a new Committee member, and deactivate the account of a member who
            resigns or is replaced. Complainant and respondent accounts come from the BulSU directory.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setMessage("");
            }}
            className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light"
          >
            Create account
          </button>
        )}
      </div>

      {message && <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}

      {creating && (
        <ProvisionForm
          onCancel={() => setCreating(false)}
          onCreated={(account) => {
            setCreating(false);
            setMessage(`Account created for ${account.fullName} (${account.email}) as CODI Committee.`);
            load();
          }}
        />
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <p className="mb-2 text-xs text-neutral-500">
        {accounts === null
          ? "Loading…"
          : `${active.length} active member${active.length === 1 ? "" : "s"}${
              accounts.length > active.length ? ` · ${accounts.length - active.length} deactivated` : ""
            }`}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {accounts && accounts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-neutral-500">No Committee accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Department</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Last sign-in</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(accounts || []).map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  isLastActive={!account.deactivatedAt && active.length === 1}
                  onChanged={(text) => {
                    setMessage(text);
                    load();
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

function AccountRow({ account, isLastActive, onChanged }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deactivated = Boolean(account.deactivatedAt);

  async function run(path, body, text) {
    setBusy(true);
    setError("");
    try {
      await api.post(path, body);
      setOpen(false);
      setNote("");
      onChanged(text);
    } catch (err) {
      setError(err.response?.data?.error || "That did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-neutral-50 align-top last:border-0">
      <td className="px-5 py-3">
        <p className={`font-medium ${deactivated ? "text-neutral-500" : "text-neutral-800"}`}>{account.fullName}</p>
        <p className="break-all text-xs text-neutral-400">{account.email}</p>
        {deactivated && (
          <p className="mt-1 text-xs italic text-neutral-500">
            Deactivated{account.deactivatedBy ? ` by ${account.deactivatedBy.fullName}` : ""} on{" "}
            {new Date(account.deactivatedAt).toLocaleDateString()}: {account.deactivationNote}
          </p>
        )}

        {open && (
          <div className="mt-3 rounded-md border border-maroon/30 bg-maroon/[0.03] p-3">
            <p className="text-xs font-medium text-neutral-800">Deactivate {account.fullName}?</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              They can no longer sign in, and their votes and scores stop counting toward the panel. Nothing
              they did is deleted, and you can reactivate the account later.
            </p>
            {isLastActive && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This is the last active Committee member. Prima facie voting can&apos;t be completed until another
                account is created or this one is reactivated.
              </p>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Reason, e.g. resigned or replaced (required)"
              className={`${inputClass} mt-2`}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(
                    `/auth/accounts/${account.id}/deactivate`,
                    { note: note.trim() },
                    `${account.fullName}'s account was deactivated.`
                  )
                }
                className="rounded-md bg-maroon px-3 py-1.5 text-xs font-medium text-white hover:bg-maroon-light disabled:opacity-50"
              >
                {busy ? "Deactivating…" : "Yes, deactivate"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>
      <td className="hidden px-5 py-3 text-neutral-600 md:table-cell">{account.department || "—"}</td>
      <td className="whitespace-nowrap px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            deactivated ? "bg-neutral-200 text-neutral-700" : "bg-green-100 text-green-800"
          }`}
        >
          {deactivated ? "Deactivated" : "Active"}
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-5 py-3 text-neutral-500 md:table-cell">
        {account.lastSignIn ? new Date(account.lastSignIn).toLocaleString() : "Never"}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        {deactivated ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(`/auth/accounts/${account.id}/reactivate`, {}, `${account.fullName}'s account was reactivated.`)
            }
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
          >
            Reactivate
          </button>
        ) : (
          !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
            >
              Deactivate
            </button>
          )
        )}
        {deactivated && error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

const EMPTY_FORM = { fullName: "", email: "", department: "", password: "" };

// Posts through the authenticated `api` client directly — NOT
// useAuth().register(), which logs the caller in as the newly created
// account. This creates the account on someone else's behalf while leaving
// the Secretariat's own session untouched.
function ProvisionForm({ onCancel, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/provision", { ...form, role: "COMMITTEE" });
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 max-w-lg space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-bold text-neutral-800">New Committee account</h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Full name</label>
        <input required value={form.fullName} onChange={update("fullName")} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
        <input type="email" required value={form.email} onChange={update("email")} className={inputClass} />
        <p className="mt-1 text-xs text-neutral-500">Sign-in codes are sent to this address, so it must be theirs.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Department</label>
        <input
          value={form.department}
          onChange={update("department")}
          placeholder="e.g. College of ICT"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Initial password</label>
        <input
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={update("password")}
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-maroon px-5 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-md border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
