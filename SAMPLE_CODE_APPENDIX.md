# SAMPLE SOURCE CODE

This appendix presents selected excerpts from the implemented CODI-IS system. Each excerpt is copied from the source file identified above it; the line numbers refer to that source file.

## Figure B.1. User Authentication Module

**File:** `server/src/routes/auth.routes.js`  
**Source lines:** 82–118

```js
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
```

## Figure B.2. Role-Based Access Control

**File:** `server/src/middleware/auth.js`  
**Source lines:** 1–38

```js
import jwt from "jsonwebtoken";
import { prisma } from "../prismaClient.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  // A token outlives the account's standing, so it is checked each time: a
  // deactivated (or deleted) account stops working at once, not when the token
  // expires.
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { deactivatedAt: true } });
    if (!user || user.deactivatedAt) {
      return res.status(401).json({ error: "This account has been deactivated." });
    }
  } catch (err) {
    return next(err);
  }
  req.user = payload;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this resource" });
    }
    next();
  };
}
```

## Figure B.3. Complaint Management

**File:** `server/src/routes/cases.routes.js`  
**Source lines:** 85–119

```js
casesRouter.post(
  "/",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const { description, isPeerToPeer, isFirstOffense } = req.body;
    const isAnonymous = req.body.isAnonymous === true;

    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }
    if (String(description).trim().length > DESCRIPTION_MAX) {
      return res.status(400).json({
        error: `The description of the incident can be at most ${DESCRIPTION_MAX.toLocaleString()} characters.`,
      });
    }

    // One to three respondents. A pick from the directory is a suggestion, not
    // the answer: it is validated now so an impossible one is caught at filing,
    // but it stays unconfirmed.
    const parsed = await parseRespondents(req.body, req.user.sub);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const respondents = parsed.list;

    // An anonymous complainant does nothing after sending the complaint, so
    // their evidence links come with it, checked before anything is saved.
    const rawLinks = isAnonymous && Array.isArray(req.body.evidenceLinks) ? req.body.evidenceLinks : [];
    if (rawLinks.length > EVIDENCE_LINK_MAX) {
      return res.status(400).json({ error: `You can add up to ${EVIDENCE_LINK_MAX} evidence links.` });
    }
    const evidenceLinks = [];
    for (const raw of rawLinks) {
      const link = parseEvidenceLink({ externalUrl: raw?.url, fileName: raw?.name });
      if (link.error) return res.status(400).json({ error: `Evidence link: ${link.error}` });
      evidenceLinks.push(link);
    }
```

## Figure B.4. Case Status Management

**File:** `server/src/routes/cases.routes.js`  
**Source lines:** 627–650

```js
    // Verification is what turns the REF number into a CPI number. Kept if the
    // case is verified again after a return.
    const newCpi = approved && !caseRecord.cpiNumber ? await nextCpiNumber() : null;
    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status, ...(newCpi ? { cpiNumber: newCpi } : {}) },
    });

    await logAction({
      userId: req.user.sub,
      caseId: updated.id,
      action: "COMPLAINT_VERIFICATION",
      details:
        (note || (approved ? "Complaint verified as compliant" : "Returned for correction")) +
        (newCpi ? ` — now numbered ${newCpi}` : ""),
    });
    await notify({
      userId: updated.complainantId,
      caseId: updated.id,
      message: approved
        ? `Your complaint ${caseRecord.referenceNumber} has been verified and forwarded to CODI. It is now case ${caseLabel(updated)}.`
        : `Your complaint ${caseLabel(updated)} was returned for correction: ${note || "see secretariat"}`,
    });
    res.json(updated);
```

## Figure B.5. Audit Trail

**File:** `server/src/routes/cases.routes.js`  
**Source lines:** 168–200

```js
    await logAction({
      userId: req.user.sub,
      caseId: created.id,
      action: "COMPLAINT_SUBMITTED",
      details: `Case ${referenceNumber} filed against ${respondents
        .map((r) => `${r.name}${r.user ? ` (suggested account: ${r.user.email})` : ""}`)
        .join("; ")}`,
    });

    for (const link of evidenceLinks) {
      await prisma.document.create({
        data: {
          caseId: created.id,
          uploadedById: req.user.sub,
          fileName: link.label,
          externalUrl: link.url,
          docType: "EVIDENCE",
          reviewStatus: "PENDING",
        },
      });
      await logAction({
        userId: req.user.sub,
        caseId: created.id,
        action: "EVIDENCE_UPLOADED",
        details: `Linked evidence "${link.label}" (${link.hostname})`,
      });
    }

    // Other filers' recent open reports about the same person, flagged so the
    // Secretariat reads them together. Never a reason to refuse this one.
    const related = isAnonymous
      ? await relatedReports({ ...created, respondents: respondents.map((r) => ({ userId: r.user?.id ?? null, claimedName: r.name })) })
      : [];
```

## Figure B.6. Report Generation

**File:** `server/src/services/reportService.js`  
**Source lines:** 366–394

```js
  // Anonymous complaints by the month filed, and how screening went: entertained
  // (verified), not entertained under Section 12, or still waiting. A rising
  // not-entertained share is the early sign of anonymous filing being misused.
  // A CPI number is only ever assigned at verification.
  const anonymousOutcome = (f) => (f.notEntertained ? "notEntertained" : f.verifiedAt || f.cpiNumber ? "entertained" : "pending");
  const anonymousCases = cohort.filter((f) => f.isAnonymous);
  const anonymous = {
    months: months.map((month) => {
      const filed = anonymousCases.filter((f) => monthKey(f.filedAt) === month);
      return { month, filed: filed.length, ...countBy(filed, anonymousOutcome, ["entertained", "notEntertained", "pending"]) };
    }),
    totals: { filed: anonymousCases.length, ...countBy(anonymousCases, anonymousOutcome, ["entertained", "notEntertained", "pending"]) },
  };

  // Workload counts activity *during* each month across every case that
  // matches the non-date filters — a case filed last year but closed this
  // month still counts as work closed this month.
  const workload = months.map((month) => {
    const end = monthEnd(month);
    const hearingsThisMonth = matching.flatMap((f) => f.hearings).filter((h) => monthKey(h.scheduledAt) === month);
    return {
      month,
      filed: matching.filter((f) => monthKey(f.filedAt) === month).length,
      closed: matching.filter((f) => f.closedAt && monthKey(f.closedAt) === month).length,
      openAtMonthEnd: matching.filter((f) => f.filedAt <= end && (!f.closedAt || f.closedAt > end)).length,
      preTrialHearings: hearingsThisMonth.filter((h) => h.type === "PRE_TRIAL").length,
      trialHearings: hearingsThisMonth.filter((h) => h.type === "TRIAL").length,
    };
  });
```
