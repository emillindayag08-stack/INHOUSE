import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction, notify } from "../services/auditService.js";
import { recordLoginAttempt } from "../services/loginAttemptService.js";
import { checkIdentity, readAcknowledgment } from "../services/privacyNotice.js";
import { sendEmail } from "../services/emailService.js";
import {
  clearFailedPasswords,
  isLocked,
  lockedMessage,
  lockedMinutesMessage,
  recordFailedPassword,
  recordUnknownFailure,
  unknownEmailLockedMinutes,
  unlockWithCode,
} from "../services/lockoutService.js";
import {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  TRUST_DAYS,
  forgetTrustedDevices,
  isTrustedDevice,
  maskEmail,
  requiresMfa,
  startChallenge,
  trustDevice,
  verifyChallenge,
} from "../services/mfaService.js";

export const authRouter = Router();

// Nobody self-registers. University members sign in with the account the
// BulSU directory gives them (see services/directory), and CODI staff
// accounts are seeded or provisioned by the Secretariat.
// The Secretariat may provision accounts for this role only via the manual
// form below; Chairperson and Secretariat accounts stay seed/admin-only.
// Parties are never provisioned here — they come from the directory.
const SECRETARIAT_PROVISIONABLE_ROLES = new Set(["COMMITTEE", "DISCIPLINING_AUTHORITY"]);

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, fullName: user.fullName, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const typedEmail = String(email ?? "").trim().toLowerCase();
    // No sign-in without the privacy notice acknowledged and the person's
    // details given. Checked first: it is not a password attempt.
    const privacy = readAcknowledgment(req.body);
    if (privacy.error) return res.status(400).json({ error: privacy.error, privacyRequired: true, stale: privacy.stale === true });
    const user = await prisma.user.findUnique({ where: { email: typedEmail } });
    // The caller is told the same thing either way; only the record keeps the
    // difference.
    if (!user) {
      // Answered exactly as a real account would be, counts and lock included,
      // so the number of tries left gives nothing away.
      const lockedFor = unknownEmailLockedMinutes(typedEmail);
      if (lockedFor > 0) {
        await recordLoginAttempt(req, { email: typedEmail, success: false, reason: "UNKNOWN_EMAIL" });
        return res.status(423).json({ error: lockedMinutesMessage(lockedFor), locked: true });
      }
      await recordLoginAttempt(req, { email: typedEmail, success: false, reason: "UNKNOWN_EMAIL" });
      const guess = recordUnknownFailure(typedEmail);
      if (guess.locked) {
        return res.status(423).json({
          error: "Too many incorrect passwords. This account is locked for 1 hour, and an email has been sent to it.",
          locked: true,
        });
      }
      return res.status(401).json({ error: "Invalid email or password", attemptsLeft: guess.attemptsLeft });
    }
    // A locked account is refused without looking at the password at all.
    if (isLocked(user)) {
      await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: false, reason: "ACCOUNT_LOCKED" });
      return res.status(423).json({ error: lockedMessage(user), locked: true });
    }
    const valid = await bcrypt.compare(String(password ?? ""), user.passwordHash);
    if (!valid) {
      await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: false, reason: "WRONG_PASSWORD" });
      const result = await recordFailedPassword(user, req);
      if (result.locked) {
        return res.status(423).json({
          error: "Too many incorrect passwords. This account is locked for 1 hour, and an email has been sent to it.",
          locked: true,
        });
      }
      return res.status(401).json({ error: "Invalid email or password", attemptsLeft: result.attemptsLeft });
    }
    await clearFailedPasswords(user);
    // Told only once the password is right, so it says nothing to a guesser.
    if (user.deactivatedAt) {
      await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: false, reason: "ACCOUNT_DEACTIVATED" });
      return res.status(403).json({
        error: "This account has been deactivated. Contact the CODI Secretariat.",
        deactivated: true,
      });
    }

    // A university member's number must be the one on their account. Asked only
    // once the password is right, so it tells a guesser nothing.
    const privacyAck = checkIdentity(privacy.ack, user);
    if (privacyAck?.idMatches === false) {
      await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: false, reason: "ID_MISMATCH" });
      return res.status(400).json({
        error: "The student or employee number you entered doesn't match this account. Go back and check your details.",
        privacyRequired: true,
      });
    }

    // Every account needs a second step. A browser trusted earlier skips it.
    if (requiresMfa(user)) {
      if (await isTrustedDevice(user.id, req.body.deviceToken)) {
        await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: true, reason: "TRUSTED_DEVICE", privacyAck });
        return res.json(await finishLogin(user));
      }
      const started = await startChallenge(user, req, privacyAck);
      if (started.error) return res.status(started.status).json({ error: started.error });
      // Password was right but the sign-in is not complete: recorded as pending.
      await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: false, reason: "MFA_PENDING" });
      return res.json({
        mfaRequired: true,
        challengeId: started.challengeId,
        email: maskEmail(user.email),
        expiresInSeconds: CODE_TTL_MS / 1000,
        resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
        trustDays: TRUST_DAYS,
      });
    }

    await recordLoginAttempt(req, { email: typedEmail, userId: user.id, success: true, privacyAck });
    res.json(await finishLogin(user));
  })
);

// Unlock a locked account with the code emailed when it locked. This does not
// sign anyone in: the password is still needed afterwards.
authRouter.post(
  "/unlock",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const result = await unlockWithCode(email, req.body.code);
    if (!result.ok) {
      if (result.wrongCode) {
        await recordLoginAttempt(req, { email, userId: result.userId, success: false, reason: "WRONG_UNLOCK_CODE" });
      }
      return res.status(400).json({ error: result.error });
    }
    res.json({ unlocked: true });
  })
);

// --- Committee accounts: list, deactivate, reactivate (Secretariat) ----------
// Committee membership changes: people resign or are replaced. Deactivating an
// account stops it signing in and takes its holder off the panel; nothing they
// did is touched. Only Committee accounts are managed here.
authRouter.get(
  "/committee-accounts",
  requireAuth,
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const accounts = await prisma.user.findMany({
      where: { role: "COMMITTEE" },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        createdAt: true,
        deactivatedAt: true,
        deactivationNote: true,
        deactivatedBy: { select: { fullName: true } },
      },
      orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { fullName: "asc" }],
    });
    const last = await prisma.loginAttempt.groupBy({
      by: ["userId"],
      where: { success: true, userId: { in: accounts.map((a) => a.id) } },
      _max: { createdAt: true },
    });
    const lastById = new Map(last.map((l) => [l.userId, l._max.createdAt]));
    res.json(accounts.map((a) => ({ ...a, lastSignIn: lastById.get(a.id) ?? null })));
  })
);

async function loadCommitteeAccount(req, res) {
  const account = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!account || account.role !== "COMMITTEE") {
    res.status(404).json({ error: "Committee account not found" });
    return null;
  }
  return account;
}

authRouter.post(
  "/accounts/:id/deactivate",
  requireAuth,
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const note = String(req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "Give a reason, such as resigned or replaced." });
    if (note.length > 500) return res.status(400).json({ error: "The reason can be at most 500 characters." });
    const account = await loadCommitteeAccount(req, res);
    if (!account) return;
    if (account.id === req.user.sub) return res.status(409).json({ error: "You cannot deactivate your own account." });
    if (account.deactivatedAt) return res.status(409).json({ error: "This account is already deactivated." });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: account.id },
        data: { deactivatedAt: new Date(), deactivatedById: req.user.sub, deactivationNote: note },
      }),
      // Nothing left to sign back in with.
      prisma.trustedDevice.deleteMany({ where: { userId: account.id } }),
      prisma.mfaChallenge.deleteMany({ where: { userId: account.id } }),
    ]);
    await logAction({
      userId: req.user.sub,
      caseId: null,
      action: "ACCOUNT_DEACTIVATED",
      details: `Deactivated the Committee account of ${account.fullName} (${account.email}): ${note}`,
    });
    sendEmail({
      to: account.email,
      subject: "CODI-IS: your account has been deactivated",
      text: `Hello ${account.fullName},\n\nYour CODI-IS Committee account has been deactivated by the Secretariat and can no longer be used to sign in.\n\nIf you think this is a mistake, contact the CODI Secretariat.\n`,
    });
    res.json({ ok: true });
  })
);

authRouter.post(
  "/accounts/:id/reactivate",
  requireAuth,
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const account = await loadCommitteeAccount(req, res);
    if (!account) return;
    if (!account.deactivatedAt) return res.status(409).json({ error: "This account is not deactivated." });
    await prisma.user.update({
      where: { id: account.id },
      data: { deactivatedAt: null, deactivatedById: null, deactivationNote: null },
    });
    await logAction({
      userId: req.user.sub,
      caseId: null,
      action: "ACCOUNT_REACTIVATED",
      details: `Reactivated the Committee account of ${account.fullName} (${account.email})`,
    });
    res.json({ ok: true });
  })
);

// What a completed sign-in returns. First login clears any auto-provisioned
// temporary password (see cases.routes.js's verify handler) — it's no longer
// needed or shown once the account has actually been used.
async function finishLogin(user) {
  if (user.tempPassword) {
    await prisma.user.update({ where: { id: user.id }, data: { tempPassword: null } });
  }
  return {
    token: signToken(user),
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
      userType: user.userType,
    },
  };
}

// Second step: the emailed code. On success the sign-in completes, and — if the
// person asked — this browser is trusted for TRUST_DAYS.
authRouter.post(
  "/mfa/verify",
  asyncHandler(async (req, res) => {
    const { challengeId, code, trustDevice: wantsTrust } = req.body;
    const result = await verifyChallenge(challengeId, code);
    if (!result.user) {
      if (result.wrongCode) {
        await recordLoginAttempt(req, { email: result.email, userId: result.userId, success: false, reason: "WRONG_MFA_CODE" });
      }
      return res.status(result.status).json({ error: result.error });
    }
    const user = result.user;
    await recordLoginAttempt(req, { email: user.email, userId: user.id, success: true, privacyAck: result.privacyAck });
    const payload = await finishLogin(user);
    if (wantsTrust === true) Object.assign(payload, await trustDevice(user, req));
    res.json(payload);
  })
);

// A fresh code for the same sign-in, no sooner than RESEND_COOLDOWN_MS after the last.
authRouter.post(
  "/mfa/resend",
  asyncHandler(async (req, res) => {
    const old = await prisma.mfaChallenge.findUnique({
      where: { id: String(req.body.challengeId ?? "") },
      include: { user: true },
    });
    if (!old || old.consumedAt || old.expiresAt < new Date()) {
      return res.status(400).json({ error: "That sign-in has expired. Sign in again." });
    }
    const wait = old.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) {
      return res.status(429).json({ error: `Wait ${Math.ceil(wait / 1000)} seconds before asking for another code.` });
    }
    // The new code completes the same sign-in, so it carries the same acknowledgment.
    const started = await startChallenge(old.user, req, old.privacyAck);
    if (started.error) return res.status(started.status).json({ error: started.error });
    await prisma.mfaChallenge.update({ where: { id: old.id }, data: { consumedAt: new Date() } });
    res.json({
      challengeId: started.challengeId,
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    });
  })
);

// Forget every browser this account trusted: the next sign-in from each asks for a code.
authRouter.post(
  "/mfa/forget-devices",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { count } = await forgetTrustedDevices(req.user.sub);
    await logAction({
      userId: req.user.sub,
      caseId: null,
      action: "TRUSTED_DEVICES_FORGOTTEN",
      details: `Stopped trusting ${count} browser${count === 1 ? "" : "s"} for sign-in`,
    });
    res.json({ forgotten: count });
  })
);

// Secretariat provisions a Committee account on someone else's behalf. This
// does NOT log the caller in as the new user or touch the caller's own
// session — it just creates the account and returns its public fields.
authRouter.post(
  "/provision",
  requireAuth,
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, role, department } = req.body;
    if (!email || !password || !fullName || !role) {
      return res.status(400).json({ error: "email, password, fullName, and role are required" });
    }
    if (!SECRETARIAT_PROVISIONABLE_ROLES.has(role)) {
      return res.status(400).json({ error: "This role cannot be provisioned here" });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, role, department },
    });

    await logAction({
      userId: req.user.sub,
      caseId: null,
      action: "ACCOUNT_PROVISIONED",
      details: `Created ${role} account for ${fullName} (${email})`,
    });
    await notify({
      userId: user.id,
      caseId: null,
      message: "Your CODI-IS account has been created by the Secretariat. You can now log in.",
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
    });
  })
);

// Self-service password change. Requires the current password so a hijacked
// session token can't be used to lock the real account owner out.
authRouter.patch(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Also clear tempPassword, if any is still set — a self-chosen password
    // supersedes the auto-provisioned one.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tempPassword: null },
    });

    // A new password ends every trusted browser: they were trusted on the old one.
    await forgetTrustedDevices(user.id);

    await logAction({
      userId: user.id,
      caseId: null,
      action: "PASSWORD_CHANGED",
      details: "Changed their own password",
    });

    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
      userType: user.userType,
    });
  })
);

// Self-service profile editing. Deliberately narrow: only fullName and
// department are editable here. Email is the login identifier (there's no
// email-verification flow to safely confirm a change) and role is
// security-sensitive (provisioned only via seed/admin) — neither is
// accepted by this endpoint, even if present in the request body.
authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const fullName = String(req.body.fullName ?? "").trim();
    if (!fullName) {
      return res.status(400).json({ error: "Full name is required" });
    }
    const department = String(req.body.department ?? "").trim() || null;

    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: { fullName, department },
    });

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
    });
  })
);
