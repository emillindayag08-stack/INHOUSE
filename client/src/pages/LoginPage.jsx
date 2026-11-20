import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { DetailsStep, NoticeStep, privacyPayload } from "../components/PrivacyGate.jsx";
import { PRIVACY_GATE_ENABLED } from "../lib/privacyNotice.js";

// Where the "Watch Video" button goes. Paste the video link between the quotes
// (or set VITE_INTRO_VIDEO_URL in client/.env). Until there is one, the button
// says the video is coming soon.
const INTRO_VIDEO_URL = import.meta.env.VITE_INTRO_VIDEO_URL || "";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M6 4l10 6-10 6z" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, verifyMfa, resendMfa, unlockAccount } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Wrong passwords left before the account locks, as the server last said.
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  // The server said this account is locked: only then is the unlock link offered.
  const [locked, setLocked] = useState(false);
  // Set once the password is accepted and the account needs an emailed code.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef(null);
  // Entering the code emailed when the account locked, to unlock it at once.
  const [unlocking, setUnlocking] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const unlockRef = useRef(null);
  const [videoSoon, setVideoSoon] = useState(false);
  // Before the sign-in form: the privacy notice, then the person's details.
  // Both are required on every sign-in (the server checks) while the gate is on.
  const [step, setStep] = useState(PRIVACY_GATE_ENABLED ? "notice" : "signin");
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState("");

  useEffect(() => {
    if (unlocking) unlockRef.current?.focus();
  }, [unlocking]);

  // The "send another code" button unlocks after the server's cooldown.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return setError("Enter your email.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Check your email address.");
    if (!password) return setError("Enter your password.");
    setError("");
    setAttemptsLeft(null);
    setLocked(false);
    setLoading(true);
    try {
      const result = await login(email, password, PRIVACY_GATE_ENABLED ? privacyPayload(details) : undefined);
      if (result?.mfaRequired) {
        setChallenge(result);
        setCooldown(result.resendAfterSeconds || 60);
        setNotice("");
        return;
      }
      navigate("/");
    } catch (err) {
      const data = err.response?.data;
      // A problem with the acknowledgment or details sends the person back to fix it.
      if (data?.privacyRequired) {
        setPassword("");
        setDetailsError(data.error);
        setStep(data.stale ? "notice" : "details");
        return;
      }
      setError(data?.error || "Login failed");
      setAttemptsLeft(data?.attemptsLeft ?? null);
      setLocked(data?.locked === true);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(e) {
    e.preventDefault();
    if (!email.trim()) return setError("Enter your email.");
    if (!/^\d{6}$/.test(unlockCode.trim())) return setError("Enter the 6-digit code from the email.");
    setError("");
    setLoading(true);
    try {
      await unlockAccount(email, unlockCode.trim());
      setUnlocking(false);
      setUnlockCode("");
      setPassword("");
      setLocked(false);
      setNotice("Your account is unlocked. Sign in with your password.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not unlock the account");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your email.");
    setError("");
    setLoading(true);
    try {
      await verifyMfa(email, challenge.challengeId, code.trim(), trust);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Could not verify the code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    try {
      const next = await resendMfa(challenge.challengeId);
      setChallenge((c) => ({ ...c, challengeId: next.challengeId }));
      setCooldown(next.resendAfterSeconds || 60);
      setCode("");
      setNotice("A new code is on its way.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not send another code");
    }
  }

  function backToPassword() {
    setChallenge(null);
    setCode("");
    setPassword("");
    setError("");
    setNotice("");
  }

  const gate =
    step === "notice" ? (
      <NoticeStep
        onContinue={() => {
          setDetailsError("");
          setStep("details");
        }}
      />
    ) : step === "details" ? (
      <DetailsStep
        initial={details}
        serverError={detailsError}
        onBack={() => setStep("notice")}
        onContinue={(given) => {
          setDetails(given);
          setDetailsError("");
          setError("");
          setStep("signin");
        }}
      />
    ) : null;

  return (
    <div className="relative min-h-screen overflow-clip bg-white">
      {/* Soft geometric backdrop, with the maroon wave and the library building
          along the bottom. All decoration: nothing here is read by a screen reader. */}
      <img
        src="/login/background.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full sm:h-32 lg:h-40"
      >
        <path d="M0,78 C220,28 470,26 720,66 C970,106 1210,104 1440,42 L1440,160 L0,160 Z" fill="#8f0000" />
      </svg>
      <img
        src="/login/building.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 -right-[1%] hidden w-[30%] max-w-[480px] translate-y-[16%] lg:block"
      />

      {gate ? (
        <div
          className={`relative z-10 mx-auto flex min-h-screen items-center px-4 py-10 sm:px-5 lg:pb-28 ${
            step === "notice" ? "max-w-2xl" : "max-w-md"
          }`}
        >
          <div className="w-full rounded-xl border border-neutral-100 bg-white p-6 shadow-xl sm:p-8">{gate}</div>
        </div>
      ) : (
      <div className="relative z-10 mx-auto grid min-h-screen max-w-5xl content-center items-start gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16 lg:px-8 lg:pb-28">
      <div className="hidden lg:block">
        <p className="text-base font-medium text-maroon">Bulacan State University</p>
        <h2 className="mt-3 max-w-[28rem] text-4xl font-bold leading-[1.1] tracking-tight text-neutral-900 xl:text-6xl">
          Committee on Decorum and Investigation
        </h2>
        <p className="mt-6 max-w-[22rem] text-xs leading-relaxed text-neutral-500 xl:max-w-sm xl:text-sm">
          A committee established to address concerns related to Gender-Based Sexual Harassment
          (GBSH) and other forms of misconduct within the institution. It works to promote a safe,
          respectful, and inclusive environment for all members of the community.
        </p>
        <div className="mt-8">
          {INTRO_VIDEO_URL ? (
            <a
              href={INTRO_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-md bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon-light"
            >
              <PlayIcon /> Watch Video
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setVideoSoon(true)}
              className="inline-flex items-center gap-3 rounded-md bg-maroon px-5 py-2.5 text-sm font-medium text-white hover:bg-maroon-light"
            >
              <PlayIcon /> Watch Video
            </button>
          )}
          {videoSoon && !INTRO_VIDEO_URL && (
            <p role="status" className="mt-2 text-xs text-neutral-500">
              The video is coming soon.
            </p>
          )}
        </div>
      </div>
      <div className="w-full max-w-sm justify-self-center rounded-xl border border-neutral-100 bg-white p-8 shadow-xl lg:justify-self-end">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/bulsu-logo.png" alt="BulSU" className="mb-3 h-14 w-14" />
          <h1 className="text-lg font-bold text-maroon">CODI-IS</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Gender Case Information Governance &amp; Decision Support System
          </p>
        </div>

        {unlocking ? (
          <form onSubmit={handleUnlock} noValidate className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Unlock your account</h2>
              <p className="mt-1 text-xs text-neutral-500">
                When an account locks after too many wrong passwords, a 6-digit code is emailed to it. Enter it here
                to unlock the account now. You will still need your password to sign in.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@bulsu.edu.ph"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Unlock code</label>
              <input
                ref={unlockRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center text-lg tracking-[0.5em]`}
                placeholder="••••••"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
            >
              {loading ? "Unlocking…" : "Unlock account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUnlocking(false);
                setError("");
              }}
              className="text-xs font-medium text-maroon hover:underline"
            >
              ← Back to sign in
            </button>
          </form>
        ) : challenge ? (
          <form onSubmit={handleVerify} noValidate className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Check your email</h2>
              <p className="mt-1 text-xs text-neutral-500">
                We sent a 6-digit code to <span className="font-medium text-neutral-700">{challenge.email}</span>. It
                expires in {Math.round((challenge.expiresInSeconds || 600) / 60)} minutes.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Sign-in code</label>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center text-lg tracking-[0.5em]`}
                placeholder="••••••"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="mt-0.5" />
              <span>
                Trust this site for {challenge.trustDays || 3} days
                <span className="block text-xs text-neutral-500">
                  Skip the code on this browser. Only tick this on a device you control.
                </span>
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            {notice && <p className="text-sm text-green-700">{notice}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify and sign in"}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={backToPassword} className="font-medium text-maroon hover:underline">
                ← Use a different account
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0}
                className="font-medium text-maroon hover:underline disabled:text-neutral-400 disabled:no-underline"
              >
                {cooldown > 0 ? `Send another code (${cooldown}s)` : "Send another code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@bulsu.edu.ph"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div role="alert" className="text-sm text-red-600">
                <p>{error}</p>
                {attemptsLeft != null && (
                  <p className="mt-0.5 font-medium">
                    {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left before this account is locked.
                  </p>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-maroon py-2 text-sm font-medium text-white hover:bg-maroon-light disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            {notice && <p className="text-sm text-green-700">{notice}</p>}
            {locked && (
              <button
                type="button"
                onClick={() => {
                  setUnlocking(true);
                  setError("");
                  setNotice("");
                }}
                className="text-sm font-medium text-maroon hover:underline"
              >
                Account locked? Unlock my account
              </button>
            )}
          </form>
        )}
        <p className="mt-4 text-center text-xs text-neutral-500">
          Sign in with your BulSU account. Accounts come from the university directory — there is
          no sign-up here.
        </p>
      </div>

      </div>
      )}
    </div>
  );
}
