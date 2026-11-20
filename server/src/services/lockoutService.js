import crypto from "node:crypto";
import { prisma } from "../prismaClient.js";
import { sendEmail } from "./emailService.js";
import { logAction } from "./auditService.js";

// Three wrong passwords in a row lock the account for an hour, and the account
// is emailed. While locked, the password is not even checked, so guessing
// during the lock gets nowhere. The lock lifts by itself; a correct password
// before it falls clears the count.
// A switch, so the lock can be turned off for now without removing it: set
// ACCOUNT_LOCKOUT=off in .env (anything else, or nothing, leaves it on). While
// off, wrong passwords are not counted and no account is ever treated as locked.
export const LOCKOUT_ENABLED = process.env.ACCOUNT_LOCKOUT !== "off";
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_MS = 60 * 60 * 1000;
export const MAX_UNLOCK_ATTEMPTS = 5;

// Keyed with the server secret and bound to the account, so a leaked row is not
// a usable code.
const unlockHash = (userId, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`unlock:${userId}:${code}`).digest("hex");

export const isLocked = (user, now = new Date()) =>
  LOCKOUT_ENABLED && Boolean(user.lockedUntil && user.lockedUntil > now);

export function minutesLeft(user, now = new Date()) {
  return Math.max(1, Math.ceil((user.lockedUntil - now) / 60000));
}

export const lockedMessage = (user) =>
  `This account is locked after too many incorrect passwords. Try again in ${minutesLeft(user)} minute${
    minutesLeft(user) === 1 ? "" : "s"
  }.`;

// Telling someone how many tries they have left must not tell an attacker which
// emails are real. So an email with no account is counted and "locked" in memory
// exactly as a real one is in the database, and gets the same answers. Forgotten
// after the lock period, and bounded in size.
const unknown = new Map(); // email -> { count, lockedUntil }
const UNKNOWN_LIMIT = 5000;

export function unknownEmailLockedMinutes(email, now = Date.now()) {
  if (!LOCKOUT_ENABLED) return 0;
  const entry = unknown.get(email);
  if (!entry?.lockedUntil || entry.lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((entry.lockedUntil - now) / 60000));
}

export function recordUnknownFailure(email, now = Date.now()) {
  if (!LOCKOUT_ENABLED) return { locked: false };
  if (unknown.size >= UNKNOWN_LIMIT) unknown.delete(unknown.keys().next().value);
  let entry = unknown.get(email);
  if (!entry || (entry.lockedUntil && entry.lockedUntil <= now)) entry = { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.count = 0;
    entry.lockedUntil = now + LOCK_MS;
    unknown.set(email, entry);
    return { locked: true };
  }
  unknown.set(email, entry);
  return { locked: false, attemptsLeft: MAX_FAILED_ATTEMPTS - entry.count };
}

export const lockedMinutesMessage = (minutes) =>
  `This account is locked after too many incorrect passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

// Records one wrong password. Returns { locked: true, lockedUntil } when this
// one was the last allowed, else { locked: false, attemptsLeft }.
export async function recordFailedPassword(user, req) {
  if (!LOCKOUT_ENABLED) return { locked: false };
  // Atomic, so two simultaneous guesses cannot both slip under the limit.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (updated.failedLoginCount < MAX_FAILED_ATTEMPTS) {
    return { locked: false, attemptsLeft: MAX_FAILED_ATTEMPTS - updated.failedLoginCount };
  }

  const lockedUntil = new Date(Date.now() + LOCK_MS);
  // The way out before the hour is up: a code sent only to the account's email.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lockedUntil,
      failedLoginCount: 0,
      unlockCodeHash: unlockHash(user.id, code),
      unlockCodeExpiresAt: lockedUntil,
      unlockAttempts: 0,
    },
  });
  // Without SMTP configured nothing can be mailed; echo it for development only.
  if (!process.env.SMTP_HOST) console.log(`[Unlock code for ${user.email}] ${code}`);

  await logAction({
    userId: user.id,
    caseId: null,
    action: "ACCOUNT_LOCKED",
    details: `Account locked for ${LOCK_MS / 3600000} hour after ${MAX_FAILED_ATTEMPTS} incorrect passwords${
      req.ip ? ` (last attempt from ${req.ip})` : ""
    }`,
  });
  // Best effort, like every email here: a failed send is logged and never
  // changes the lock.
  sendEmail({
    to: user.email,
    subject: "CODI-IS: your account has been locked",
    text: `Hello ${user.fullName},\n\nYour CODI-IS account was locked for ${LOCK_MS / 3600000} hour after ${MAX_FAILED_ATTEMPTS} incorrect password attempts${
      req.ip ? ` (the last from ${req.ip})` : ""
    }.\n\nTo unlock it now, open the CODI-IS sign-in page, choose “Unlock my account”, and enter this code:\n\n    ${code}\n\nThe code works until ${lockedUntil.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time), when the account unlocks by itself anyway. Unlocking does not sign you in — you still need your password.\n\nIf this was not you, someone may be trying to get into your account. Do not share the code; tell the CODI Secretariat.\n`,
  });
  return { locked: true, lockedUntil };
}

// A correct password: forget earlier wrong guesses and any expired lock.
export function clearFailedPasswords(user) {
  if (!user.failedLoginCount && !user.lockedUntil && !user.unlockCodeHash) return null;
  return prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, unlockCodeHash: null, unlockCodeExpiresAt: null, unlockAttempts: 0 },
  });
}

// The emailed code, entered on the sign-in page. Returns { ok: true, user }, or
// { error }. Every failure reads the same, so it says nothing about whether an
// account exists or is locked. Five wrong guesses burn the code.
export async function unlockWithCode(email, code) {
  const refused = { error: "That code is not valid. Check the latest email, or wait for the lock to end." };
  const user = await prisma.user.findUnique({ where: { email: String(email ?? "").trim().toLowerCase() } });
  if (!user || !isLocked(user) || !user.unlockCodeHash || !user.unlockCodeExpiresAt || user.unlockCodeExpiresAt < new Date()) {
    return refused;
  }
  if (user.unlockAttempts >= MAX_UNLOCK_ATTEMPTS) return refused;

  const expected = Buffer.from(unlockHash(user.id, String(code ?? "").trim()), "hex");
  const actual = Buffer.from(user.unlockCodeHash, "hex");
  if (!(expected.length === actual.length && crypto.timingSafeEqual(expected, actual))) {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { unlockAttempts: { increment: 1 } }, select: { unlockAttempts: true } });
    if (updated.unlockAttempts >= MAX_UNLOCK_ATTEMPTS) {
      await prisma.user.update({ where: { id: user.id }, data: { unlockCodeHash: null } });
    }
    return { ...refused, userId: user.id, wrongCode: true };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lockedUntil: null, failedLoginCount: 0, unlockCodeHash: null, unlockCodeExpiresAt: null, unlockAttempts: 0 },
  });
  await logAction({
    userId: user.id,
    caseId: null,
    action: "ACCOUNT_UNLOCKED",
    details: "Account unlocked with the code emailed to it",
  });
  return { ok: true, user };
}
