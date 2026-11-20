import { prisma } from "../prismaClient.js";
import { sendNotificationEmail } from "./emailService.js";

export async function logAction({ userId, caseId, action, details }) {
  // An anonymous complainant acting on their own case is recorded, but marked
  // so the Audit Log never shows who they are.
  let actorHidden = false;
  if (caseId && userId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { isAnonymous: true, complainantId: true } });
    actorHidden = !!c?.isAnonymous && c.complainantId === userId;
  }
  return prisma.auditLog.create({
    data: { userId, caseId, action, details, actorHidden },
  });
}

export async function notify({ userId, caseId, message }) {
  const notification = await prisma.notification.create({
    data: { userId, caseId, message },
    include: { user: { select: { email: true, fullName: true } } },
  });
  // Fire and forget: the email is a copy of the notification, not part of it.
  sendNotificationEmail(notification.user, message);
  copySecretariat(notification, caseId, message);
  return notification;
}

// The Secretariat runs the case, so they get an email for every update, not
// only the ones addressed to them. An event that notifies several people
// would repeat the same message, so each (case, message) is sent once.
const sentToSecretariat = new Set();
async function copySecretariat(notification, caseId, message) {
  try {
    const key = `${caseId}|${message}`;
    if (sentToSecretariat.has(key)) return;
    sentToSecretariat.add(key);
    if (sentToSecretariat.size > 500) sentToSecretariat.delete(sentToSecretariat.values().next().value);

    const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" } });
    const caseRecord = caseId
      ? await prisma.case.findUnique({ where: { id: caseId }, select: { caseNumber: true, cpiNumber: true, referenceNumber: true } })
      : null;
    const ref = caseRecord ? ` [${caseRecord.caseNumber || caseRecord.cpiNumber || caseRecord.referenceNumber}]` : "";
    for (const user of secretariat) {
      if (user.id === notification.userId) continue; // already emailed directly
      sendNotificationEmail(user, message, `Update${ref}`);
    }
  } catch (err) {
    console.error(`Secretariat email copy failed: ${err.message}`);
  }
}
