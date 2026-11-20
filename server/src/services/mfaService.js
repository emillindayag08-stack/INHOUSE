import crypto from "node:crypto";
import { prisma } from "../prismaClient.js";
import { sendEmail } from "./emailService.js";

// Two-step sign-in for every account — staff, the Disciplining Authority and
// university members alike. After the password, a 6-digit code is emailed to
// the account; entering it finishes the sign-in. A browser can be "trusted"
// for TRUST_DAYS, after which it skips the code until the trust expires, is
// forgotten, or the password changes.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const TRUST_DAYS = 3;
export const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODES_PER_WINDOW = 8; // per user, per 15 minutes
const WINDOW_MS = 15 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// Keyed with the server secret and bound to the challenge, so a stolen
// database row cannot be turned into a valid code offline.
function hashCode(challengeId, code) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

// Every account, whatever its role.
// TEMPORARY: MFA disabled for local dev/testing. Restore `Boolean(user)` to re-enable.
export const requiresMfa = (user) => false;

export function maskEmail(email) {
  const [name, domain] = String(email).split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

// Creates a challenge and emails the code. Returns { challengeId } or { error, status }.
// privacyAck: the sign-in's privacy acknowledgment, kept until the code is entered.
export async function startChallenge(user, req, privacyAck = null) {
  const now = new Date();
  const recent = await prisma.mfaChallenge.count({
    where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - WINDOW_MS) } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) {
    return { status: 429, error: "Too many codes requested. Wait a few minutes and sign in again." };
  }
  // Housekeeping: spent and expired challenges have no further use.
  await prisma.mfaChallenge.deleteMany({
    where: { userId: user.id, OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
  });

  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.mfaChallenge.create({
    data: {
      id,
      userId: user.id,
      codeHash: hashCode(id, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      ipAddress: req.ip || null,
      ...(privacyAck && { privacyAck }),
    },
  });

  // Without SMTP configured nothing can be mailed, so a developer could never
  // finish signing in; echo the code to the server console in that case only.
  if (!process.env.SMTP_HOST) console.log(`[MFA code for ${user.email}] ${code}`);
  sendEmail({
    to: user.email,
    subject: "CODI-IS sign-in code",
    text: `Hello ${user.fullName},\n\nYour CODI-IS sign-in code is ${code}.\nIt expires in ${CODE_TTL_MS / 60000} minutes and can be used once.\n\nIf you did not try to sign in, do not share this code — someone may have your password. Change it after signing in.\n`,
  });
  return { challengeId: id };
}

// Checks a code. Returns { user } on success, or { error, status, userId? }.
export async function verifyChallenge(challengeId, code) {
  const challenge = await prisma.mfaChallenge.findUnique({
    where: { id: String(challengeId ?? "") },
    include: { user: true },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
    return { status: 400, error: "That code has expired. Sign in again to get a new one." };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { status: 429, error: "Too many wrong codes. Sign in again to get a new one.", userId: challenge.userId };
  }

  const expected = Buffer.from(hashCode(challenge.id, String(code ?? "").trim()), "hex");
  const actual = Buffer.from(challenge.codeHash, "hex");
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!ok) {
    await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return { status: 401, error: "That code is not right.", userId: challenge.userId, wrongCode: true, email: challenge.user.email };
  }
  // Single use, even if two requests race.
  const used = await prisma.mfaChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (used.count === 0) return { status: 400, error: "That code has already been used." };
  return { user: challenge.user, privacyAck: challenge.privacyAck };
}

// --- Trusted devices -----------------------------------------------------------
export async function trustDevice(user, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000);
  await prisma.trustedDevice.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await prisma.trustedDevice.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      label: String(req.get("user-agent") || "").slice(0, 200) || null,
      expiresAt,
    },
  });
  return { deviceToken: token, trustedUntil: expiresAt };
}

export async function isTrustedDevice(userId, token) {
  if (!token || typeof token !== "string") return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device || device.userId !== userId || device.expiresAt < new Date()) return false;
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
}

export const forgetTrustedDevices = (userId) => prisma.trustedDevice.deleteMany({ where: { userId } });
