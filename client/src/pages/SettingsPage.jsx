import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import { ROLE_LABELS } from "../lib/constants.js";
import { LogOutIcon } from "../components/icons.jsx";

// Every account signs in with an emailed code as well as its password (see
// services/mfaService.js on the server).

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Profile &amp; Settings</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Your account details.</p>
      </div>

      <div className="max-w-xl space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-maroon text-lg font-medium text-white">
                {initials}
              </span>
              <div>
                <p className="text-lg font-medium text-neutral-900">{user.fullName}</p>
                <p className="text-sm text-neutral-500">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white"
              >
                Edit
              </button>
            )}
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-6">
            {editing ? (
              <ProfileEditForm user={user} onDone={() => setEditing(false)} />
            ) : (
              <dl className="space-y-4">
                <Field label="Full name" value={user.fullName} />
                <Field label="Department" value={user.department || "—"} />
                <Field label="Email" value={user.email} />
                <Field label="Role" value={ROLE_LABELS[user.role]} />
              </dl>
            )}
          </div>
        </div>

        <ChangePasswordCard />

        <TwoStepCard />

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-neutral-800">Session</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Sign out of CODI-IS on this device.
          </p>
          <button
            onClick={handleLogout}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOutIcon className="h-4 w-4" /> Log out
          </button>
        </div>
      </div>
    </Layout>
  );
}

function ChangePasswordCard() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      reset();
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-neutral-800">Change password</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Update the password you use to sign in to CODI-IS.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Current password</label>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">New password</label>
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          />
          <p className="mt-1 text-xs text-neutral-400">At least 8 characters.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Confirm new password</label>
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Password changed successfully.</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-50"
        >
          {saving ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

function ProfileEditForm({ user, onDone }) {
  const { updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateProfile({ fullName, department });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Full name</label>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Department</label>
        <input
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="e.g. College of ICT"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon"
        />
      </div>

      <dl className="space-y-4 border-t border-neutral-100 pt-4">
        <Field label="Email" value={user.email} hint="Cannot be changed" />
        <Field
          label="Role"
          value={ROLE_LABELS[user.role]}
          hint="Whether you are the complainant or the respondent is decided per case"
        />
      </dl>

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
          onClick={onDone}
          disabled={saving}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-neutral-500">
        {label}
        {hint && <span className="ml-1 text-xs text-neutral-400">({hint})</span>}
      </dt>
      <dd className="text-sm font-medium text-neutral-800">{value}</dd>
    </div>
  );
}

function TwoStepCard() {
  const { user, forgetTrustedDevices } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function forget() {
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await forgetTrustedDevices();
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not forget trusted browsers");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-neutral-800">Two-step sign-in</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Signing in asks for a 6-digit code sent to <span className="font-medium text-neutral-700">{user.email}</span>. If
        you tick “Trust this site for 3 days”, that browser skips the code until the 3 days are up.
      </p>
      <button
        onClick={forget}
        disabled={busy}
        className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-maroon hover:bg-maroon hover:text-white disabled:opacity-60"
      >
        {busy ? "Working…" : "Forget all trusted browsers"}
      </button>
      {done && <p className="mt-2 text-sm text-green-700">Done. Every browser will ask for a code next time.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
