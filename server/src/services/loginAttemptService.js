import { prisma } from "../prismaClient.js";

// Records one sign-in attempt. Best-effort: a failure to write the record is
// logged and never changes the outcome of the login itself.
export async function recordLoginAttempt(req, { email, userId = null, success, reason = null, privacyAck = undefined }) {
  try {
    await prisma.loginAttempt.create({
      data: {
        email: String(email ?? "").slice(0, 254),
        userId,
        success,
        reason,
        ipAddress: req.ip || null,
        userAgent: String(req.get("user-agent") || "").slice(0, 300) || null,
        ...(privacyAck && { privacyAck }),
      },
    });
  } catch (err) {
    console.error(`Could not record login attempt: ${err.message}`);
  }
}
