import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction, notify } from "../services/auditService.js";
import {
  createDeadline,
  ensureDeadline,
  markDeadlineMet,
  startReportClock,
  sweepOverdueDeadlines,
} from "../services/deadlineService.js";
import { generateTempPassword } from "../services/accountProvisioning.js";
import { OFFENSE_LEVELS, recordRiskAssessment, recordOverride, withdrawRiskAssessments } from "../services/riskScoringService.js";
import { caseLabel } from "../utils/caseLabel.js";
import { notifySecretariatToScheduleMeeting, getPrimaFacieRequiredVoters } from "../services/schedulingService.js";
import { DESCRIPTION_MAX, RESPONDENT_NAME_MAX, RETURN_NOTE_MAX } from "../utils/limits.js";
import { CASE_DETAIL_INCLUDE, applyViewerFilters, hideRunningClassification, maskAnonymousComplainant } from "../services/caseView.js";
import { EVIDENCE_LINK_MAX, parseEvidenceLink } from "../utils/evidenceLink.js";
import {
  anonymousAllowance,
  duplicateOpenComplaint,
  filerStrikeCount,
  readAnonymousDetails,
  relatedReports,
} from "../services/anonymousGuard.js";
import {
  CURRENT_DOCUMENTS,
  assertSide,
  caseScopeFilter,
  caseViewer,
  documentAttached,
  documentsShared,
  isCoRespondentFiling,
  partySide,
} from "../services/caseAccess.js";
import { getPersonById, resolveUserByDirectoryId } from "../services/directory/index.js";
import {
  frameworkFor,
  parseRespondents,
  syncPrimaryRespondent,
  respondentRows,
  respondentRowFor,
  respondentNames,
  notifyRespondents,
  showCauseProgress,
  notifyPathwayReady,
  respondentsAwaitingApproval,
  activeRespondentRows,
  belongsToRow,
  isActiveRespondent,
  respondentRowForRequest,
  syncCaseClassification,
} from "../services/respondentService.js";
import bcrypt from "bcryptjs";

export const casesRouter = Router();
casesRouter.use(requireAuth);

// referenceNumber (REF-YYYY-NNNN) is assigned to every case at filing.
// caseNumber (CODI-YYYY-NNNN) is the official docket number, assigned only
// once a prima facie case is found (see POST /:id/prima-facie) — see
// caseLabel() in utils/caseLabel.js for how the two are displayed.
async function nextSequenceNumber(field, prefix) {
  const year = new Date().getFullYear();
  const count = await prisma.case.count({
    where: { [field]: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}
const nextReferenceNumber = () => nextSequenceNumber("referenceNumber", "REF");
const nextCaseNumber = () => nextSequenceNumber("caseNumber", "CODI");
const nextCpiNumber = () => nextSequenceNumber("cpiNumber", "CPI");

// Staff see every case; a university member sees every case they are on,
// whichever side they are on (see services/caseAccess.js).
const visibilityFilter = caseScopeFilter;

export { DESCRIPTION_MAX, RESPONDENT_NAME_MAX, RETURN_NOTE_MAX } from "../utils/limits.js";

// --- Submit a complaint (any university member) ---------------------------
// The complainant names the respondent in their own words and may also point
// at a directory account if they know exactly who it is. Either way the
// Secretariat confirms the identity before the complaint is verified.
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

    // One open complaint per filer per respondent, named or anonymous.
    const duplicate = await duplicateOpenComplaint(req.user.sub, respondents);
    if (duplicate) return res.status(409).json({ error: duplicate });

    // An anonymous complaint must say which Section 12 condition it meets and
    // give enough to check it, and the account must be within its limits.
    let anonymousFields = {};
    if (isAnonymous) {
      const details = readAnonymousDetails(req.body, evidenceLinks.length);
      if (details.error) return res.status(400).json({ error: details.error });
      const allowance = await anonymousAllowance(req.user.sub);
      if (!allowance.allowed) return res.status(429).json({ error: allowance.reason, until: allowance.until });
      anonymousFields = details.fields;
    }
    const [claimed] = respondents;

    const governingFramework = frameworkFor(claimed.type);
    const referenceNumber = await nextReferenceNumber();

    const created = await prisma.case.create({
      data: {
        referenceNumber,
        complainantId: req.user.sub,
        // The first respondent is mirrored here; the rows below are the record.
        respondentId: claimed.user?.id ?? null,
        claimedRespondentName: claimed.name,
        claimedRespondentType: claimed.type,
        claimedRespondentCollege: claimed.college,
        description,
        isAnonymous,
        ...anonymousFields,
        isPeerToPeer: Boolean(isPeerToPeer),
        isFirstOffense: isFirstOffense !== false,
        governingFramework,
        status: "SUBMITTED",
        respondents: {
          create: respondents.map((r, position) => ({
            position,
            userId: r.user?.id ?? null,
            claimedName: r.name,
            claimedType: r.type,
            claimedCollege: r.college,
          })),
        },
      },
    });

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

    // The Secretariat has to put a name to an account before this can move.
    const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
    for (const member of secretariat) {
      await notify({
        userId: member.id,
        caseId: created.id,
        message: `New ${isAnonymous ? "anonymous " : ""}complaint ${referenceNumber} against ${respondents.map((r) => `"${r.name}"`).join(", ")}. Confirm who ${respondents.length > 1 ? "each is" : "this is"} in the BulSU directory before verifying it.${
          related.length ? ` Possibly related to ${related.map((r) => r.label).join(", ")}, filed by someone else about the same person.` : ""
        }`,
      });
    }

    // Intake rule: the complainant has 3 days to submit the notarized copy of
    // this complaint (uploaded already-notarized, or printed from the case
    // page and taken to a notary). Notarizing would name an anonymous
    // complainant, so theirs needs none.
    if (isAnonymous) {
      await notify({
        userId: req.user.sub,
        caseId: created.id,
        message: `Your anonymous complaint ${referenceNumber} was filed. Your name is hidden from everyone else on the case, including CODI staff.`,
      });
    } else {
      await createDeadline(created.id, "NOTARIZED_COMPLAINT", new Date(), governingFramework);
      await notify({
        userId: req.user.sub,
        caseId: created.id,
        message: `Your complaint ${referenceNumber} is ready. If it is not yet notarized, print it from the case page, have it notarized, and upload the notarized copy within 3 days.`,
      });
    }

    res.status(201).json(created);
  })
);

// --- Whether the signed-in member may file anonymously right now ------------
// Read by the filing form so a blocked option says why before any typing.
// The same check runs again on POST /, which is what actually enforces it.
casesRouter.get(
  "/anonymous-allowance",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    res.json(await anonymousAllowance(req.user.sub));
  })
);

// --- Secretariat: close an anonymous complaint as not entertained ----------
// Section 12 of the 2025 RACCS: an anonymous complaint is entertained only if
// it meets one of its conditions. One that meets none is closed here, with a
// reason, before any respondent hears of it. It counts toward the filer's
// pause on anonymous filing (services/anonymousGuard.js).
casesRouter.post(
  "/:id/not-entertained",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Say why this complaint is not entertained." });
    if (reason.length > RETURN_NOTE_MAX) {
      return res.status(400).json({ error: `Keep the reason to ${RETURN_NOTE_MAX.toLocaleString()} characters.` });
    }
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (!caseRecord.isAnonymous) {
      return res.status(409).json({ error: "Only an anonymous complaint can be closed as not entertained." });
    }
    if (caseRecord.status !== "SUBMITTED") {
      return res.status(409).json({ error: "A complaint can only be closed as not entertained before it is verified." });
    }

    const now = new Date();
    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: {
        status: "DISMISSED",
        dismissalType: "WITHOUT_PREJUDICE",
        statusBeforeClose: caseRecord.status,
        notEntertainedAt: now,
        notEntertainedReason: reason,
      },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "COMPLAINT_NOT_ENTERTAINED",
      details: `Not entertained under Section 12 of the 2025 RACCS: ${reason}`,
    });
    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `Your anonymous complaint ${caseLabel(caseRecord)} was not entertained under Section 12 of the 2025 RACCS. Reason: ${reason} You can file it under your name instead.`,
    });
    res.json(updated);
  })
);

// --- List cases visible to the current user -------------------------------
casesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await sweepOverdueDeadlines();
    const cases = await prisma.case.findMany({
      where: visibilityFilter(req.user),
      include: {
        complainant: { select: { id: true, fullName: true } },
        respondentUser: { select: { id: true, fullName: true, department: true, userType: true } },
        respondents: {
          orderBy: { position: "asc" },
          select: { id: true, position: true, userId: true, claimedName: true, assignedAt: true, confirmedAt: true, primaFacieFound: true },
        },
        deadlines: true,
        // Lightweight document info so dashboards can flag cases that are
        // still missing their notarized requirement document.
        // uploadedById lets the dashboard tell whose position paper is still
        // missing — see lib/caseProgress.js.
        documents: { where: CURRENT_DOCUMENTS, select: { id: true, reviewStatus: true, docType: true, uploadedById: true } },
      },
      orderBy: { filedAt: "desc" },
    });
    // Which side the viewer is on, per case — null for CODI staff.
    res.json(
      cases.map((c) => {
        const yourSide = partySide(c, req.user.sub);
        const mine = yourSide === "RESPONDENT" ? respondentRowFor(c, req.user.sub) : null;
        maskAnonymousComplainant(c, req.user.sub);
        // Committee members vote independently; see hideRunningClassification.
        if (req.user.role === "COMMITTEE") hideRunningClassification(c);
        if (!mine) return { ...c, yourSide };
        // A respondent sees their own response window and only the names of the
        // others the complaint names.
        return {
          ...c,
          yourSide,
          deadlines: c.deadlines.filter((d) => !d.respondentRowId || d.respondentRowId === mine.id),
          respondents: c.respondents.map((r) =>
            r.id === mine.id ? r : { id: r.id, position: r.position, claimedName: r.claimedName, other: true }
          ),
        };
      })
    );
  })
);

// --- Case detail ------------------------------------------------------------
casesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: CASE_DETAIL_INCLUDE,
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const viewer = caseViewer(caseRecord, req.user);
    if (!viewer.canView) {
      return res.status(403).json({ error: "You do not have access to this case" });
    }
    // Tells the client which side it is looking from, so the UI never has to
    // guess and then disagree with what the payload actually contains.
    caseRecord.yourSide = viewer.side;

    // What the Secretariat weighs when screening an anonymous complaint: how
    // often this filer's anonymous complaints were not entertained (a count,
    // never a name), and other filers' recent reports about the same person.
    if (caseRecord.isAnonymous && viewer.isStaff) {
      caseRecord.anonymousScreening = {
        filerNotEntertained: await filerStrikeCount(caseRecord),
        related: await relatedReports(caseRecord),
      };
    }

    // The respondent's temp password is only ever visible to the Secretariat
    // (who needs to relay it) — strip it for every other role, including the
    // respondent themselves.
    // Who's required to vote on this case's prima facie question — the
    // Committee/Chairperson members who voted for the finalized meeting date,
    // once there is one (see getPrimaFacieRequiredVoters). The client uses
    // this to tell a complete prima facie vote from a partial one (see
    // PrimaFacieTally).
    const caseRequiredVoters = await getPrimaFacieRequiredVoters(caseRecord.id);
    caseRecord.committeeMemberCount = caseRequiredVoters.count;
    caseRecord.primaFacieVotesRequired = caseRequiredVoters.scoped ? null : PRIMA_FACIE_VOTES_REQUIRED;

    applyViewerFilters(caseRecord, viewer, req.user.sub);
    res.json(caseRecord);
  })
);

// --- Complainant: edit own complaint during Secretariat-requested correction -
// The sworn complaint is otherwise immutable once filed. Editing is only
// allowed after the Secretariat explicitly returns it for correction; saving
// sends it back to SUBMITTED so the Secretariat re-verifies the corrected
// version.
const EDITABLE_STATUSES = new Set(["RETURNED_FOR_CORRECTION"]);

casesRouter.patch(
  "/:id",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.complainantId !== req.user.sub) {
      return res.status(403).json({ error: "You can only edit your own complaint" });
    }
    if (caseRecord.isAnonymous) {
      return res.status(409).json({ error: "An anonymous complaint can't be edited once it is sent." });
    }
    if (!EDITABLE_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({
        error: "This complaint can only be edited after the Secretariat returns it for correction.",
      });
    }

    const description = String(req.body.description ?? "").trim();
    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }
    if (description.length > DESCRIPTION_MAX) {
      return res.status(400).json({
        error: `The description of the incident can be at most ${DESCRIPTION_MAX.toLocaleString()} characters.`,
      });
    }

    // The whole list is sent back, edited. Rows are matched by id: one that
    // keeps its id and its details keeps the Secretariat's confirmation, a
    // changed one has it cleared, a new one is added, a missing one is removed.
    // Nobody has been served yet (the case is back with the complainant), so
    // nothing here touches a respondent who already has a stake in the case.
    const parsed = await parseRespondents(req.body, req.user.sub);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const incoming = parsed.list;
    const existing = respondentRows(caseRecord);
    const existingById = new Map(existing.map((r) => [r.id, r]));
    if (incoming.some((r) => r.id && !existingById.has(r.id))) {
      return res.status(400).json({ error: "One of the respondents does not belong to this case." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const keepIds = new Set(incoming.filter((r) => r.id).map((r) => r.id));
      const dropped = existing.filter((r) => !keepIds.has(r.id));
      if (dropped.length) {
        await tx.caseRespondent.deleteMany({ where: { id: { in: dropped.map((r) => r.id) } } });
      }
      // Positions are unique per case, so park every survivor out of the way
      // before renumbering.
      await tx.caseRespondent.updateMany({
        where: { caseId: caseRecord.id },
        data: { position: { increment: 100 } },
      });
      for (const [position, r] of incoming.entries()) {
        const before = r.id ? existingById.get(r.id) : null;
        const sameAccount = (before?.userId ?? null) === (r.user?.id ?? before?.userId ?? null);
        const unchanged =
          before &&
          before.claimedName === r.name &&
          before.claimedType === r.type &&
          before.claimedCollege === r.college &&
          sameAccount;
        if (before) {
          await tx.caseRespondent.update({
            where: { id: before.id },
            data: {
              position,
              claimedName: r.name,
              claimedType: r.type,
              claimedCollege: r.college,
              // Naming someone new replaces the account; leaving the picker
              // alone keeps what was suggested before.
              ...(r.user ? { userId: r.user.id } : {}),
              ...(unchanged
                ? {}
                : { confirmedAt: null, confirmedById: null, typeAtFiling: null, collegeAtFiling: null }),
            },
          });
        } else {
          await tx.caseRespondent.create({
            data: {
              caseId: caseRecord.id,
              position,
              userId: r.user?.id ?? null,
              claimedName: r.name,
              claimedType: r.type,
              claimedCollege: r.college,
            },
          });
        }
      }
      await tx.case.update({
        where: { id: caseRecord.id },
        data: {
          description,
          isPeerToPeer: Boolean(req.body.isPeerToPeer),
          isFirstOffense: req.body.isFirstOffense !== false,
          // A corrected complaint re-enters the verification queue.
          status: "SUBMITTED",
        },
      });
      return syncPrimaryRespondent(tx, caseRecord.id);
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "COMPLAINT_EDITED",
      details:
        caseRecord.status === "RETURNED_FOR_CORRECTION"
          ? "Complaint corrected and resubmitted for verification"
          : "Complaint details edited before verification",
    });

    res.json(updated);
  })
);

// --- Secretariat: confirm who the respondent actually is -------------------
// The complainant describes a person; this is where that description is
// matched to a BulSU account. Until it is, the complaint cannot be verified
// and nobody can read the case as the respondent.
casesRouter.post(
  "/:id/confirm-respondent",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "This case has concluded." });
    }

    const rows = respondentRows(await prisma.case.findUnique({ where: { id: caseRecord.id }, include: { respondents: true } }));
    // Which named respondent is being matched; the first when none is given
    // (what the single-respondent form always sent).
    const row = req.body.respondentRowId
      ? rows.find((r) => r.id === req.body.respondentRowId)
      : rows[0];
    if (!row) return res.status(404).json({ error: "Respondent not found on this case." });

    const person = getPersonById(req.body.respondentDirectoryId);
    if (!person) {
      return res.status(400).json({ error: "That person is not in the BulSU directory." });
    }
    const respondentUser = await resolveUserByDirectoryId(person.directoryId);
    if (!respondentUser || respondentUser.role !== "PARTY") {
      return res.status(400).json({ error: "CODI officials cannot be named as the respondent." });
    }
    if (respondentUser.id === caseRecord.complainantId) {
      return res.status(400).json({ error: "The complainant and the respondent cannot be the same person." });
    }
    if (rows.some((r) => r.id !== row.id && r.userId === respondentUser.id)) {
      return res.status(400).json({ error: `${person.fullName} is already confirmed as another respondent on this case.` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.caseRespondent.update({
        where: { id: row.id },
        data: {
          userId: respondentUser.id,
          typeAtFiling: person.type,
          collegeAtFiling: person.college,
          confirmedAt: new Date(),
          confirmedById: req.user.sub,
        },
      });
      // The confirmed account decides which rules apply to that respondent,
      // correcting the complainant if they guessed the status wrong; the
      // case's own framework follows the first respondent.
      return syncPrimaryRespondent(tx, caseRecord.id);
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "RESPONDENT_CONFIRMED",
      details: `Named respondent "${row.claimedName ?? "—"}" confirmed as ${person.fullName} (${person.idNumber})`,
    });

    res.json(updated);
  })
);

// --- Secretariat: verify or return for correction --------------------------
casesRouter.post(
  "/:id/verify",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { approved, note } = req.body;
    const status = approved ? "VERIFIED" : "RETURNED_FOR_CORRECTION";

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, respondents: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    // Nobody can correct an anonymous complaint: its complainant is done once
    // it is sent. It is verified as filed, or dismissed.
    if (!approved && caseRecord.isAnonymous) {
      return res.status(409).json({
        error: "An anonymous complaint can't be returned to the complainant. Verify it as filed, or dismiss it.",
      });
    }

    if (approved) {
      const unconfirmed = respondentRows(caseRecord).filter((r) => !r.confirmedAt || !r.userId);
      if (unconfirmed.length > 0) {
        return res.status(409).json({
          error:
            unconfirmed.length === 1 && respondentRows(caseRecord).length === 1
              ? "Confirm who the respondent is in the BulSU directory before verifying this complaint."
              : `Confirm who each respondent is in the BulSU directory before verifying this complaint. Still to confirm: ${unconfirmed.map((r) => r.claimedName).join(", ")}.`,
        });
      }
      const hasNotarizedComplaint = caseRecord.documents.some(
        (d) => d.docType === "COMPLAINT" && d.reviewStatus === "APPROVED"
      );
      // An anonymous complaint has no notarized copy; it stands on being
      // verifiable public knowledge.
      if (!hasNotarizedComplaint && !caseRecord.isAnonymous) {
        return res.status(409).json({
          error: "This complaint cannot be verified until its notarized copy has been confirmed as notarized.",
        });
      }
    }

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
  })
);


// --- Secretariat: draft a show-cause order and send for Chairperson review --
// The order itself is a signed document: the Secretariat downloads the
// generated template as Word, edits and signs it outside the app, and attaches
// it via POST /:caseId/documents before calling this. The order is not yet
// official — it only takes effect (and the respondent's response window
// starts) once the Chairperson approves it below.
casesRouter.post(
  "/:id/show-cause",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        documents: {
          where: { docType: "SHOW_CAUSE_ORDER", showCauseOrder: null, ...CURRENT_DOCUMENTS },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    // Only an unattached document counts — one already tied to an earlier
    // attempt belongs to that attempt, so a returned draft can't be re-sent
    // without attaching the revised file.
    const orderDoc = caseRecord.documents[0];
    if (!orderDoc) {
      return res.status(409).json({
        error: "Attach the signed show-cause order document before sending it to the Chairperson.",
      });
    }

    // Returning an order leaves the case at SHOW_CAUSE_PENDING_APPROVAL, so the
    // status alone no longer says whether the Chairperson is holding one.
    const alreadyPending = await prisma.showCauseOrder.findFirst({
      where: { caseId: caseRecord.id, status: "PENDING_APPROVAL" },
      select: { id: true },
    });
    if (alreadyPending) {
      return res.status(409).json({
        error: "A show-cause order is already awaiting the Chairperson's verification.",
      });
    }

    const order = await prisma.showCauseOrder.create({
      data: {
        caseId: caseRecord.id,
        issuedById: req.user.sub,
        documentId: orderDoc.id,
        status: "PENDING_APPROVAL",
      },
    });
    await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "SHOW_CAUSE_PENDING_APPROVAL" },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "SHOW_CAUSE_DRAFTED",
      details: "Show-cause order drafted and sent to the Chairperson for verification",
    });

    const chairs = await prisma.user.findMany({ where: { role: "CHAIRPERSON" }, select: { id: true } });
    for (const chair of chairs) {
      await notify({
        userId: chair.id,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: a show-cause order is awaiting your verification.`,
      });
    }

    res.status(201).json(order);
  })
);

// --- Chairperson: approve a drafted show-cause order -------------------------
// Approval clears the order for release but does not reach the respondent: it
// goes back to the Secretariat, who serves it (POST .../serve below). Service
// is what puts the order in force and starts the response-deadline clock.
casesRouter.post(
  "/:id/show-cause/:orderId/approve",
  requireRole("CHAIRPERSON"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const order = await prisma.showCauseOrder.findUnique({ where: { id: req.params.orderId } });
    if (!order || order.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Show-cause order not found" });
    }
    if (order.status !== "PENDING_APPROVAL") {
      return res.status(409).json({ error: "This show-cause order has already been reviewed." });
    }

    const updatedOrder = await prisma.showCauseOrder.update({
      where: { id: order.id },
      data: { status: "APPROVED", reviewedById: req.user.sub, reviewedAt: new Date() },
    });
    await prisma.case.update({ where: { id: caseRecord.id }, data: { status: "SHOW_CAUSE_APPROVED" } });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "SHOW_CAUSE_APPROVED",
      details: "Show-cause order approved by the Chairperson; returned to the Secretariat for service",
    });

    // The respondent hears nothing yet — only the Secretariat, who now serves
    // the order.
    await notify({
      userId: order.issuedById,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: the Chairperson approved your show-cause order. Serve it on the respondent.`,
    });

    res.json(updatedOrder);
  })
);

// --- Secretariat: serve an approved show-cause order on the respondent -------
// The Chairperson clears the order, the Secretariat serves it. This is the
// step that tells the respondent a case exists: it opens their access to the
// filings (documentsShared() in services/caseAccess.js) and starts the
// response window, which is measured from service rather than from approval.
casesRouter.post(
  "/:id/show-cause/:orderId/serve",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const order = await prisma.showCauseOrder.findUnique({ where: { id: req.params.orderId } });
    if (!order || order.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Show-cause order not found" });
    }
    if (order.status === "SERVED") {
      return res.status(409).json({ error: "This show-cause order has already been served." });
    }
    if (order.status !== "APPROVED") {
      return res.status(409).json({
        error: "Only an order approved by the Chairperson can be served on the respondent.",
      });
    }
    const rows = respondentRows(
      await prisma.case.findUnique({ where: { id: caseRecord.id }, include: { respondents: true } })
    );
    const unconfirmed = rows.filter((r) => !r.userId || !r.confirmedAt);
    if (unconfirmed.length > 0) {
      return res.status(409).json({
        error:
          rows.length === 1
            ? "Confirm the respondent before serving the order."
            : `Confirm every respondent before serving the order. Still to confirm: ${unconfirmed.map((r) => r.claimedName).join(", ")}.`,
      });
    }

    // One order, served on everyone it names at the same moment. Each respondent
    // gets their own response window, measured from service.
    const servedAt = new Date();
    const deadlines = [];
    for (const row of rows) {
      deadlines.push(
        await createDeadline(
          caseRecord.id,
          "RESPONDENT_RESPONSE",
          servedAt,
          frameworkFor(row.typeAtFiling ?? row.claimedType),
          row.id
        )
      );
    }

    const updatedOrder = await prisma.showCauseOrder.update({
      where: { id: order.id },
      data: {
        status: "SERVED",
        servedById: req.user.sub,
        servedAt,
        responseDeadline: deadlines[0]?.dueAt ?? servedAt,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.caseRespondent.updateMany({ where: { caseId: caseRecord.id }, data: { assignedAt: servedAt } });
      await tx.case.update({ where: { id: caseRecord.id }, data: { status: "SHOW_CAUSE_ISSUED" } });
      await syncPrimaryRespondent(tx, caseRecord.id);
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "SHOW_CAUSE_SERVED",
      details: `Show-cause order served by the Secretariat on ${rows.length === 1 ? "the respondent" : rows.map((r) => r.claimedName).join(", ")}`,
    });

    for (const row of rows) {
      await notify({
        userId: row.userId,
        caseId: caseRecord.id,
        message: `A show-cause order has been issued for case ${caseLabel(caseRecord)}. Please submit your answer.`,
      });
    }
    // The Chairperson approved it; tell them it has gone out.
    if (order.reviewedById) {
      await notify({
        userId: order.reviewedById,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: the show-cause order you approved has been served on the respondent.`,
      });
    }

    res.json(updatedOrder);
  })
);

// --- Chairperson: return a drafted show-cause order for revision -------------
casesRouter.post(
  "/:id/show-cause/:orderId/return",
  requireRole("CHAIRPERSON"),
  asyncHandler(async (req, res) => {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: "A note explaining the return is required" });
    if (String(note).length > RETURN_NOTE_MAX) {
      return res.status(400).json({
        error: `The note can be at most ${RETURN_NOTE_MAX.toLocaleString()} characters.`,
      });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const order = await prisma.showCauseOrder.findUnique({ where: { id: req.params.orderId } });
    if (!order || order.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Show-cause order not found" });
    }
    if (order.status !== "PENDING_APPROVAL") {
      return res.status(409).json({ error: "This show-cause order has already been reviewed." });
    }

    const updatedOrder = await prisma.showCauseOrder.update({
      where: { id: order.id },
      data: { status: "RETURNED", reviewedById: req.user.sub, reviewedAt: new Date(), returnNote: note },
    });
    // The case stays at SHOW_CAUSE_PENDING_APPROVAL. The order still has to be
    // approved before it can go out, the Secretariat just has to revise it
    // first, so only the order's own status records the return.
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "SHOW_CAUSE_RETURNED",
      details: `Returned for revision: ${note}`,
    });
    await notify({
      userId: order.issuedById,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: your show-cause order draft was returned for revision: ${note}`,
    });

    res.json(updatedOrder);
  })
);



// --- Respondent: submit answer ----------------------------------------------
// The response itself is a notarized document, attached first via
// POST /:caseId/documents (docType SHOW_CAUSE_ANSWER); this records it as
// submitted. The respondent declares on upload that it is notarized, and the
// Secretariat confirms or returns that separately — a pending review does not
// hold up the case, the same way the complaint's does not.
casesRouter.post(
  "/:id/answer",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (!assertSide(caseRecord, req.user, "RESPONDENT", res)) return;
    // Which of the named respondents this is — each answers for themselves.
    const myRow = respondentRowFor(caseRecord, req.user.sub);
    if (caseRecord.status !== "SHOW_CAUSE_ISSUED") {
      return res.status(409).json({ error: "There is no show-cause order awaiting your response for this case." });
    }

    const deadline = await prisma.deadline.findFirst({
      where: {
        caseId: caseRecord.id,
        stage: "RESPONDENT RESPONSE",
        ...(myRow ? { OR: [{ respondentRowId: myRow.id }, { respondentRowId: null }] } : {}),
      },
      orderBy: [{ respondentRowId: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    if (deadline && deadline.status !== "MET" && deadline.dueAt < new Date()) {
      return res.status(409).json({
        error:
          "The 5-day window to respond has lapsed. You can no longer submit an answer; the Secretariat will proceed based on the available records.",
      });
    }

    const answerDoc = caseRecord.documents.find(
      (d) => d.docType === "SHOW_CAUSE_ANSWER" && d.uploadedById === req.user.sub
    );
    if (!answerDoc) {
      return res.status(409).json({
        error: "Attach your notarized response to the show-cause order before submitting it.",
      });
    }
    const existing = await prisma.respondentAnswer.findFirst({
      where: { caseId: caseRecord.id, stage: "SHOW_CAUSE", ...(myRow ? { respondentRowId: myRow.id } : {}) },
    });
    if (existing) return res.status(409).json({ error: "You have already submitted your response." });

    const answer = await prisma.respondentAnswer.create({
      data: { caseId: req.params.id, submittedById: req.user.sub, respondentRowId: myRow?.id ?? null },
    });
    await markDeadlineMet(req.params.id, "RESPONDENT RESPONSE", myRow?.id ?? null);
    await logAction({ userId: req.user.sub, caseId: req.params.id, action: "ANSWER_SUBMITTED" });

    // With several respondents the case waits until every one has answered (or
    // been recorded as not answering); then it is on hold with the Secretariat,
    // who confirm each document is notarized and approve it. Each deadline is
    // met here — they filed on time, and how long the review takes is not theirs
    // to answer for.
    const progress = await showCauseProgress(prisma, caseRecord.id);
    if (progress.allFiled) {
      await prisma.case.update({ where: { id: req.params.id }, data: { status: "ANSWER_UNDER_REVIEW" } });
    }
    const many = progress.rows.length > 1;
    const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
    for (const member of secretariat) {
      await notify({
        userId: member.id,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: ${
          many ? myRow?.claimedName ?? "a respondent" : "the respondent"
        } filed their response to the show-cause order. Confirm it is notarized, then approve it.${
          many && !progress.allFiled ? " Other respondents have yet to respond." : ""
        }`,
      });
    }

    res.status(201).json(answer);
  })
);

// --- Secretariat: proceed when the respondent never answered -----------------
// The respondent's 5-day window (see deadlineService.js) has lapsed with no
// answer on record. The case still moves forward — the Secretariat records
// that no response was given and advances the case to the same stage a real
// answer would have unlocked, so the Committee can proceed with prima facie
// evaluation based on the available records.
casesRouter.post(
  "/:id/proceed-without-response",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "SHOW_CAUSE_ISSUED") {
      return res.status(409).json({
        error: "This action is only available while a case is awaiting the respondent's answer.",
      });
    }

    // Whoever has not answered and whose own window has run out.
    const progress = await showCauseProgress(prisma, caseRecord.id);
    const deadlines = await prisma.deadline.findMany({
      where: { caseId: caseRecord.id, stage: "RESPONDENT RESPONSE" },
      orderBy: { createdAt: "desc" },
    });
    const lapsedRows = progress.per
      .filter((p) => !p.filed)
      .map((p) => p.row)
      .filter((row) => {
        const own = deadlines.find((d) => d.respondentRowId === row.id) || deadlines.find((d) => !d.respondentRowId);
        return own && own.dueAt < new Date();
      });
    if (lapsedRows.length === 0) {
      return res.status(409).json({ error: "The respondent's 5-day response window has not yet lapsed." });
    }

    const answers = [];
    for (const row of lapsedRows) {
      answers.push(
        await prisma.respondentAnswer.create({
          data: {
            caseId: caseRecord.id,
            content:
              "No response was submitted within the 5-day window. The Secretariat is proceeding with the case based on the available records.",
            // Recorded by the Secretariat, not the respondent — the timeline says so.
            submittedById: req.user.sub,
            respondentRowId: row.id,
          },
        })
      );
    }

    // The case moves on once everyone is accounted for: to review if some
    // response is still waiting for the Secretariat's approval, otherwise on
    // to the Committee. While another respondent's window is still open it stays.
    const after = await showCauseProgress(prisma, caseRecord.id);
    if (after.allFiled) {
      await prisma.case.update({
        where: { id: caseRecord.id },
        data: { status: after.allSettled ? "ANSWER_SUBMITTED" : "ANSWER_UNDER_REVIEW" },
      });
      if (after.allSettled) await startReportClock(caseRecord, "RESPONSE");
    }
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "PROCEEDED_WITHOUT_RESPONSE",
      details: `${lapsedRows.map((r) => r.claimedName).join(", ")} did not answer within the 5-day window; proceeding based on available records.`,
    });

    res.status(201).json(answers[0]);
  })
);

// How many prima facie votes a finding needs before the Secretariat can
// confirm it, and so how many offense-level votes from members who found a
// case. Set to 1 for now; null means every sitting member, as the full process
// requires. The case payload carries it so the case page counts the same way.
export const PRIMA_FACIE_VOTES_REQUIRED = 1;

function votesNeeded(memberCount, required = PRIMA_FACIE_VOTES_REQUIRED) {
  return required === null ? memberCount : Math.min(required, memberCount);
}

// How far the Committee is through the prima facie step: every required
// member votes (see getPrimaFacieRequiredVoters — scoped to who voted for the
// finalized meeting date, once there is one), and every member who found a
// prima facie case then scores the risk assessment (fewer while
// PRIMA_FACIE_VOTES_REQUIRED is set, for cases without a scoped set). A "no
// prima facie case" vote needs no risk assessment. With several respondents
// this is done for each, separately.
async function primaFaciePanelProgress(caseId) {
  const [requiredVoters, votes, assessments, rows] = await Promise.all([
    getPrimaFacieRequiredVoters(caseId),
    // Only sitting members: the votes and scores of someone who has since left do not count.
    prisma.primaFacieVote.findMany({
      where: { caseId, voter: { deactivatedAt: null } },
      select: { voterId: true, found: true, respondentRowId: true },
    }),
    prisma.riskAssessment.findMany({
      where: { caseId, evaluatedBy: { role: { in: ["COMMITTEE", "CHAIRPERSON"] }, deactivatedAt: null } },
      select: { evaluatedById: true, respondentRowId: true },
    }),
    prisma.caseRespondent.findMany({ where: { caseId }, orderBy: { position: "asc" } }),
  ]);
  const per = rows.filter(isActiveRespondent).map((row) => {
    const rowVotes = votes.filter((v) => belongsToRow(v, row));
    const needScore = new Set(rowVotes.filter((v) => v.found).map((v) => v.voterId));
    const scorers = new Set(assessments.filter((a) => belongsToRow(a, row)).map((a) => a.evaluatedById));
    const scoredCount = [...needScore].filter((id) => scorers.has(id)).length;
    return { row, voteCount: rowVotes.length, needScoreCount: needScore.size, scoredCount, votes: rowVotes };
  });
  return { requiredVoters, per };
}

// Tells the Secretariat it's their move. Called only when a member's first
// vote, first risk score, or switch to a "no" vote is what completes the
// panel — for every respondent — so later edits don't send the same notice again.
async function notifyIfPanelComplete(caseRecord) {
  const { requiredVoters, per } = await primaFaciePanelProgress(caseRecord.id);
  const required = requiredVoters.scoped ? null : PRIMA_FACIE_VOTES_REQUIRED;
  const complete =
    requiredVoters.count > 0 &&
    per.length > 0 &&
    per.every((p) => p.voteCount >= votesNeeded(requiredVoters.count, required) && p.scoredCount >= votesNeeded(p.needScoreCount));
  if (!complete) return;
  const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
  for (const member of secretariat) {
    await notify({
      userId: member.id,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: every Committee member has voted on the prima facie question${
        per.length > 1 ? " for each respondent" : ""
      }, and those who found a prima facie case have completed the risk assessment. Confirm the finding${
        per.length > 1 ? "s" : ""
      } to proceed.`,
    });
  }
}

// --- Committee: vote on whether a prima facie case exists --------------------
// Every Committee member votes; the Secretariat then confirms the outcome
// below. Only reachable once the case has an answer on record — either the
// respondent actually answered, or the Secretariat proceeded without one
// after the 5-day window lapsed (see POST /:id/answer and
// /:id/proceed-without-response) — both of which land on ANSWER_SUBMITTED.
casesRouter.post(
  "/:id/prima-facie/vote",
  requireRole("COMMITTEE", "CHAIRPERSON"),
  asyncHandler(async (req, res) => {
    // found: true (prima facie case found), false (no prima facie case), or
    // null (abstain — counted as neither, and needs no risk-assessment vote).
    // A vote either way must give a rationale; an abstention need not, and
    // one given without is stored as an empty rationale.
    const found = req.body.found === null ? null : req.body.found;
    const rationale = String(req.body.rationale ?? "").trim();
    if (found !== null && typeof found !== "boolean") {
      return res.status(400).json({ error: "found must be true, false, or null to abstain" });
    }
    if (found !== null && !rationale) {
      return res.status(400).json({ error: "Give a rationale for your vote. Only an abstention can be cast without one." });
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "ANSWER_SUBMITTED") {
      return res.status(409).json({
        error:
          "Prima facie voting is only available once the respondent has answered, or the Secretariat has proceeded without a response after the 5-day window lapsed.",
      });
    }
    // Each respondent is voted on separately.
    const row = respondentRowForRequest(caseRecord, req.body.respondentRowId);
    if (!row) return res.status(400).json({ error: "Say which respondent this vote is about." });
    if (row.primaFacieFound !== null) {
      return res.status(409).json({ error: "The finding for this respondent has already been confirmed." });
    }
    const confirmedMeeting = await prisma.schedulingRound.findFirst({
      where: { caseId: caseRecord.id, status: "FINALIZED" },
    });
    if (!confirmedMeeting) {
      return res.status(409).json({
        error: "Voting opens once the Secretariat has confirmed the Committee meeting date.",
      });
    }
    const requiredVoters = await getPrimaFacieRequiredVoters(caseRecord.id);
    if (requiredVoters.scoped && !requiredVoters.ids.includes(req.user.sub)) {
      return res.status(403).json({
        error: "You weren't marked available for the confirmed Committee meeting date, so you're not part of the panel voting on this case.",
      });
    }

    const voteKey = { caseId_voterId_respondentRowId: { caseId: caseRecord.id, voterId: req.user.sub, respondentRowId: row.id } };
    const hadVoted = await prisma.primaFacieVote.findUnique({ where: voteKey });

    // Upsert: a member may change their mind right up until the Secretariat
    // confirms, and the tally must still count them only once.
    const vote = await prisma.primaFacieVote.upsert({
      where: voteKey,
      update: { found, rationale, votedAt: new Date() },
      create: { caseId: caseRecord.id, voterId: req.user.sub, respondentRowId: row.id, found, rationale },
    });

    const many = caseRecord.respondents.length > 1;
    const voteLabel = found === null ? "Abstained" : found ? "Voted: prima facie case found" : "Voted: no prima facie case";
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "PRIMA_FACIE_VOTE",
      details: `${voteLabel}${many ? ` (${row.claimedName})` : ""}`,
    });

    // A "no prima facie case" vote or an abstention needs no risk assessment,
    // so any score this member already gave for this respondent is withdrawn.
    if (!found) {
      await withdrawRiskAssessments({ caseId: caseRecord.id, evaluatedById: req.user.sub, respondentRowId: row.id });
    }

    if (!hadVoted || (hadVoted.found && !found)) await notifyIfPanelComplete(caseRecord);

    res.status(201).json(vote);
  })
);

// --- Secretariat: confirm the Committee's prima facie finding ----------------
// The Secretariat doesn't substitute its own judgment — the outcome is the
// Committee's majority. This step records it officially and moves the case on.
casesRouter.post(
  "/:id/prima-facie",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "ANSWER_SUBMITTED") {
      return res.status(409).json({
        error:
          "Prima facie evaluation is only available once the respondent has answered, or the Secretariat has proceeded without a response after the 5-day window lapsed.",
      });
    }
    const row = respondentRowForRequest(caseRecord, req.body?.respondentRowId);
    if (!row) return res.status(400).json({ error: "Say which respondent this finding is about." });
    if (row.primaFacieFound !== null) {
      return res.status(409).json({ error: "The finding for this respondent has already been confirmed." });
    }
    const many = caseRecord.respondents.length > 1;
    const forWhom = many ? ` for ${row.claimedName}` : "";

    const allVotes = await prisma.primaFacieVote.findMany({
      where: { caseId: caseRecord.id, voter: { deactivatedAt: null } },
    });
    const votes = allVotes.filter((v) => belongsToRow(v, row));
    const requiredVoters = await getPrimaFacieRequiredVoters(caseRecord.id);
    if (requiredVoters.count === 0) {
      return res.status(409).json({ error: "There are no Committee members to vote on this case." });
    }
    const needed = votesNeeded(requiredVoters.count, requiredVoters.scoped ? null : PRIMA_FACIE_VOTES_REQUIRED);
    if (votes.length < needed) {
      return res.status(409).json({
        error: `Waiting on the Committee${forWhom} — ${votes.length} of the ${needed} vote${needed === 1 ? "" : "s"} needed.`,
      });
    }

    const { per } = await primaFaciePanelProgress(caseRecord.id);
    const progress = per.find((p) => p.row.id === row.id);
    const scoresNeeded = votesNeeded(progress.needScoreCount);
    if (progress.scoredCount < scoresNeeded) {
      return res.status(409).json({
        error: `Waiting on the offense-level votes${forWhom} — ${progress.scoredCount} of the ${scoresNeeded} needed from members who found a prima facie case.`,
      });
    }

    // Abstentions are recorded but count toward neither side.
    const inFavour = votes.filter((v) => v.found === true).length;
    const against = votes.filter((v) => v.found === false).length;
    const abstained = votes.filter((v) => v.found === null).length;
    if (inFavour === against) {
      return res.status(409).json({
        error:
          "The Committee is tied. A member must change their vote before the finding can be confirmed.",
      });
    }
    const found = inFavour > against;
    // A clear majority classifies the respondent on its own; a tied offense
    // vote leaves it to the Secretariat to record the level the Committee agreed on.
    if (found && !row.offenseClassification) {
      return res.status(409).json({
        error: `The offense-level vote${forWhom} is tied. Set the final offense level the Committee agreed on before confirming.`,
      });
    }

    const note = String(req.body?.note || "").trim();
    const rationale = [
      `Confirmed by the Secretariat on the Committee's vote (${inFavour} of ${votes.length} found a prima facie case${forWhom}${
        abstained ? `, ${abstained} abstained` : ""
      }).`,
      note,
    ]
      .filter(Boolean)
      .join(" ");

    const evalRecord = await prisma.primaFacieEvaluation.create({
      data: { caseId: caseRecord.id, evaluatedById: req.user.sub, respondentRowId: row.id, found, rationale },
    });
    await prisma.caseRespondent.update({ where: { id: row.id }, data: { primaFacieFound: found } });
    await syncCaseClassification(prisma, caseRecord.id);

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "PRIMA_FACIE_EVALUATION",
      details: found
        ? `Confirmed prima facie case found${forWhom} (${inFavour}-${against})`
        : `Confirmed no prima facie case${forWhom}${many ? "" : "; case dismissed"} (${against}-${inFavour})`,
    });

    // One respondent cleared does not end a case that still names others, but
    // that respondent is told, and is out of everything that follows.
    if (!found && many && row.userId) {
      await notify({
        userId: row.userId,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: the Committee found no prima facie case against you. The case does not proceed against you.`,
      });
    }

    // The case itself moves on once every respondent has been decided. A prima
    // facie finding against anyone is what formally registers/dockets it — only
    // now does it get its official case number. If nobody is found against, the
    // case is dismissed with no case number ever assigned.
    const decided = await prisma.caseRespondent.findMany({ where: { caseId: caseRecord.id } });
    if (decided.every((r) => r.primaFacieFound !== null)) {
      const anyFound = decided.some((r) => r.primaFacieFound === true);
      const updateData = { status: anyFound ? "PRIMA_FACIE_FOUND" : "DISMISSED" };
      if (anyFound) updateData.caseNumber = await nextCaseNumber();
      if (anyFound) await startReportClock(caseRecord, "PRIMA_FACIE");
      else Object.assign(updateData, { dismissalType: "WITHOUT_PREJUDICE", statusBeforeClose: caseRecord.status });
      await prisma.case.update({ where: { id: caseRecord.id }, data: updateData });

      // Evidence is filed for the Committee to weigh, and this is the moment it
      // weighed it — either way the finding went. Until now each piece reads as
      // still with CODI, which stops being true here.
      await prisma.document.updateMany({
        where: { caseId: caseRecord.id, docType: "EVIDENCE", reviewStatus: "PENDING" },
        data: { reviewStatus: "APPROVED", reviewedById: req.user.sub, reviewedAt: new Date() },
      });
      if (many) {
        await logAction({
          userId: req.user.sub,
          caseId: caseRecord.id,
          action: "PRIMA_FACIE_EVALUATION",
          details: anyFound
            ? "Every respondent decided; the case proceeds against those with a prima facie case"
            : "Every respondent decided; no prima facie case against anyone, so the case is dismissed",
        });
      }
    }

    res.status(201).json(evalRecord);
  })
);

// --- Committee: offense-level vote --------------------------------------------
// Each Committee member who votes that a prima facie case exists then votes
// whether it is a Light, Less Grave or Grave offense (while the case is
// ANSWER_SUBMITTED), and may change that vote any time until the case
// concludes. Members who vote "no prima facie case" don't vote a level. Each
// vote is kept as permanent history rather than overwritten.
const PRE_SCORING_STATUSES = new Set([
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "VERIFIED",
  "SHOW_CAUSE_PENDING_APPROVAL",
  "SHOW_CAUSE_APPROVED",
  "SHOW_CAUSE_ISSUED",
  "ANSWER_UNDER_REVIEW",
  "PRIMA_FACIE_NOT_FOUND",
]);
const SCORING_TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

casesRouter.post(
  "/:id/risk-assessment",
  requireRole("COMMITTEE", "CHAIRPERSON"),
  asyncHandler(async (req, res) => {
    const { classification } = req.body;
    if (!OFFENSE_LEVELS.includes(classification)) {
      return res.status(400).json({ error: "Choose Light, Less Grave or Grave offense." });
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    // Each respondent is scored separately.
    const row = respondentRowForRequest(caseRecord, req.body.respondentRowId);
    if (!row) return res.status(400).json({ error: "Say which respondent this assessment is for." });
    if (!isActiveRespondent(row)) {
      return res.status(409).json({ error: "The finding for this respondent was no prima facie case; there is no offense level to vote on." });
    }
    if (PRE_SCORING_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({
        error: "The offense-level vote opens once the respondent has answered and you have cast your prima facie vote.",
      });
    }
    if (SCORING_TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "This case has concluded; the offense level can no longer be voted on." });
    }
    const isPanelStage = caseRecord.status === "ANSWER_SUBMITTED";
    const myVote = await prisma.primaFacieVote.findUnique({
      where: { caseId_voterId_respondentRowId: { caseId: caseRecord.id, voterId: req.user.sub, respondentRowId: row.id } },
    });
    if (isPanelStage && !myVote) {
      return res.status(409).json({ error: "Cast your prima facie vote first, then vote on the offense level." });
    }
    if (myVote && !myVote.found) {
      return res.status(409).json({
        error: "You voted that there is no prima facie case, so no offense-level vote is needed from you.",
      });
    }
    const hadScored = await prisma.riskAssessment.count({
      where: { caseId: caseRecord.id, evaluatedById: req.user.sub, respondentRowId: row.id },
    });

    const assessment = await recordRiskAssessment({
      caseId: caseRecord.id,
      evaluatedById: req.user.sub,
      respondentRowId: row.id,
      classification,
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "RISK_ASSESSMENT_RECORDED",
      details: `Voted ${assessment.classification.replace(/_/g, " ").toLowerCase()} offense${
        caseRecord.respondents.length > 1 ? ` (${row.claimedName})` : ""
      }`,
    });
    if (isPanelStage && !hadScored) await notifyIfPanelComplete(caseRecord);

    res.status(201).json(assessment);
  })
);

// --- Override a risk assessment's classification ----------------------------
// The system-suggested classification is never overwritten — the override is
// stored alongside it so the UI can show both the original suggestion and
// the final decision. Two windows, two owners: before the prima facie finding
// is confirmed (status ANSWER_SUBMITTED) the Secretariat may change the offense
// level; once it is confirmed, the Committee and Chairperson may.
const VALID_CLASSIFICATIONS = new Set(["LIGHT", "LESS_GRAVE", "GRAVE"]);

casesRouter.post(
  "/:id/risk-assessment/:assessmentId/override",
  requireRole("COMMITTEE", "CHAIRPERSON", "SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { classification, justification } = req.body;
    if (!VALID_CLASSIFICATIONS.has(classification)) {
      return res.status(400).json({ error: "classification must be LIGHT, LESS_GRAVE, or GRAVE" });
    }
    if (!justification || !justification.trim()) {
      return res.status(400).json({ error: "A justification is required to override the classification" });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    const beforeConfirmation = caseRecord.status === "ANSWER_SUBMITTED";
    if (PRE_SCORING_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({
        error: "The classification can only be overridden once the Committee has voted on the offense level.",
      });
    }
    if (beforeConfirmation && req.user.role !== "SECRETARIAT") {
      return res.status(409).json({
        error: "Until the prima facie finding is confirmed, only the Secretariat can change the offense level.",
      });
    }
    if (!beforeConfirmation && req.user.role === "SECRETARIAT" && !SCORING_TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({
        error: "The offense level can be changed by the Secretariat only before the prima facie finding is confirmed.",
      });
    }
    if (SCORING_TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "This case has concluded; risk scoring is no longer available." });
    }

    const assessment = await prisma.riskAssessment.findUnique({ where: { id: req.params.assessmentId } });
    if (!assessment || assessment.caseId !== req.params.id) {
      return res.status(404).json({ error: "Risk assessment not found" });
    }

    const updated = await recordOverride({
      assessmentId: assessment.id,
      overriddenById: req.user.sub,
      classification,
      justification: justification.trim(),
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "RISK_ASSESSMENT_OVERRIDDEN",
      details: `Set the final offense level to ${classification.replace(/_/g, " ").toLowerCase()}: ${justification.trim()}`,
    });

    res.json(updated);
  })
);

const VALID_PATHWAYS = new Set(["FORMAL_INVESTIGATION", "POSITION_PAPER"]);

// If both parties have now picked a pathway, resolve it: auto-set finalPathway
// when they agree, otherwise leave it null — the Secretariat's recommendation
// (POST /:id/pathway-recommendation) is what resolves a disagreement.
// The parties' choices are input, never the decision: the Secretariat sets the
// pathway itself (POST /:id/pathway-recommendation), including when both sides
// asked for the same thing. Once both have answered there is nothing left to
// wait for, so tell the Secretariat the case is ready for their call.
// --- The formal charge: drafted by CODI, approved by the Disciplining -------
// Authority, then signed and issued.
//
// The Secretariat writes the particulars and sends the draft up; the Authority
// (the University President) approves it or sends it back with a note. Neither
// act reaches the respondent — the charge is issued when the signed copy is
// uploaded (see documents.routes.js), which is what starts their clock.

async function notifyAuthority(caseRecord, message) {
  const authorities = await prisma.user.findMany({
    where: { role: "DISCIPLINING_AUTHORITY" },
    select: { id: true },
  });
  for (const authority of authorities) {
    await notify({ userId: authority.id, caseId: caseRecord.id, message });
  }
}

casesRouter.post(
  "/:id/formal-charge",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    // The charge is drafted outside the system and attached, like the
    // show-cause order: what goes up for approval is the file itself.
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        documents: {
          where: { docType: "FORMAL_CHARGE", formalCharge: null, ...CURRENT_DOCUMENTS },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "PRIMA_FACIE_FOUND") {
      return res.status(409).json({
        error: "A formal charge can only be drafted once a prima facie case has been found.",
      });
    }

    // Only an unpinned document counts — one already sent up belongs to that
    // attempt, so a returned draft can't be re-sent without a revised file.
    const chargeDoc = caseRecord.documents[0];
    if (!chargeDoc) {
      return res.status(409).json({
        error: "Attach the drafted formal charge before sending it to the Disciplining Authority.",
      });
    }

    const charge = await prisma.formalCharge.create({
      data: {
        caseId: caseRecord.id,
        issuedById: req.user.sub,
        documentId: chargeDoc.id,
        status: "PENDING_APPROVAL",
      },
    });
    await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "FORMAL_CHARGE_PENDING_APPROVAL" },
    });
    // The report has now gone to the President, which stops that clock and starts
    // the one for the signed charge (GBSH: 15 days; RACCS sets none).
    await markDeadlineMet(caseRecord.id, "REPORT TO PRESIDENT");
    await ensureDeadline(caseRecord.id, "FORMAL_CHARGE", new Date(), caseRecord.governingFramework);
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "FORMAL_CHARGE_DRAFTED",
      details: "Formal charge drafted and sent to the Disciplining Authority",
    });
    await notifyAuthority(
      caseRecord,
      `Case ${caseLabel(caseRecord)}: a formal charge is awaiting your approval.`
    );

    res.status(201).json(charge);
  })
);

// --- Approve a drafted charge ------------------------------------------------
// Approval clears it for signing; it does not reach the respondent until the
// signed copy is uploaded. The Disciplining Authority is who the draft is sent
// to, and the Secretariat may also record the approval — so a charge settled
// outside the system still moves. Either way reviewedById keeps who did it.
casesRouter.post(
  "/:id/formal-charge/:chargeId/approve",
  requireRole("DISCIPLINING_AUTHORITY", "SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const charge = await prisma.formalCharge.findUnique({ where: { id: req.params.chargeId } });
    if (!charge || charge.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Formal charge not found" });
    }
    if (charge.status !== "PENDING_APPROVAL") {
      return res.status(409).json({ error: "This formal charge has already been reviewed." });
    }

    const updated = await prisma.formalCharge.update({
      where: { id: charge.id },
      data: { status: "APPROVED", reviewedById: req.user.sub, reviewedAt: new Date() },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "FORMAL_CHARGE_APPROVED",
      details: "Formal charge approved by the Disciplining Authority",
    });
    await notify({
      userId: charge.issuedById,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: the Disciplining Authority approved the formal charge. Print it for signature, then upload the signed copy.`,
    });

    res.json(updated);
  })
);

// --- Send a drafted charge back for revision --------------------------------
casesRouter.post(
  "/:id/formal-charge/:chargeId/return",
  requireRole("DISCIPLINING_AUTHORITY", "SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ error: "A note explaining what to revise is required" });
    }
    if (String(note).length > RETURN_NOTE_MAX) {
      return res.status(400).json({
        error: `The note can be at most ${RETURN_NOTE_MAX.toLocaleString()} characters.`,
      });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const charge = await prisma.formalCharge.findUnique({ where: { id: req.params.chargeId } });
    if (!charge || charge.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Formal charge not found" });
    }
    if (charge.status !== "PENDING_APPROVAL") {
      return res.status(409).json({ error: "This formal charge has already been reviewed." });
    }

    const updated = await prisma.formalCharge.update({
      where: { id: charge.id },
      data: {
        status: "RETURNED",
        reviewedById: req.user.sub,
        reviewedAt: new Date(),
        returnNote: String(note).trim(),
      },
    });
    // Back to CODI: the case waits at prima facie found until a fresh draft
    // goes up.
    await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "PRIMA_FACIE_FOUND" },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "FORMAL_CHARGE_RETURNED",
      details: `Returned for revision: ${String(note).trim()}`,
    });
    await notify({
      userId: charge.issuedById,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: the Disciplining Authority sent the formal charge back: ${String(note).trim()}`,
    });

    res.json(updated);
  })
);

// --- Respondent: submit formal written answer + pathway choice --------------
// The answer itself is a notarized document the respondent attaches first via
// POST /:caseId/documents (docType RESPONDENT_ANSWER); this records it as
// submitted and captures their pathway choice. The Secretariat then confirms
// or rejects its notarization (PATCH /:caseId/documents/:docId/notarization).
casesRouter.post(
  "/:id/formal-answer",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    // An anonymous case has one proceeding, the respondent's position paper,
    // so there is no pathway to choose.
    const pathway = caseRecord.isAnonymous ? null : req.body.pathway;
    if (!caseRecord.isAnonymous && !VALID_PATHWAYS.has(pathway)) {
      return res.status(400).json({ error: "pathway must be FORMAL_INVESTIGATION or POSITION_PAPER" });
    }
    if (!assertSide(caseRecord, req.user, "RESPONDENT", res)) return;
    if (caseRecord.status !== "FORMAL_CHARGE_ISSUED") {
      return res.status(409).json({ error: "There is no formal charge awaiting your answer for this case." });
    }
    const myRow = respondentRowFor(caseRecord, req.user.sub);
    if (myRow && !isActiveRespondent(myRow)) {
      return res.status(409).json({ error: "The case does not proceed against you; there is no formal charge to answer." });
    }
    const answerDoc = caseRecord.documents.find(
      (d) => d.docType === "RESPONDENT_ANSWER" && d.uploadedById === req.user.sub
    );
    if (!answerDoc) {
      return res.status(409).json({
        error: "Attach your notarized written answer before submitting it.",
      });
    }
    const existing = await prisma.respondentAnswer.findFirst({
      where: { caseId: caseRecord.id, stage: "FORMAL_CHARGE", ...(myRow ? { respondentRowId: myRow.id } : {}) },
    });
    if (existing) return res.status(409).json({ error: "You have already submitted your formal written answer." });

    const answer = await prisma.respondentAnswer.create({
      data: { caseId: caseRecord.id, stage: "FORMAL_CHARGE", submittedById: req.user.sub, respondentRowId: myRow?.id ?? null },
    });
    await markDeadlineMet(caseRecord.id, "ANSWER TO CHARGE", myRow?.id ?? null);
    await prisma.$transaction(async (tx) => {
      if (myRow && pathway) await tx.caseRespondent.update({ where: { id: myRow.id }, data: { pathwayChoice: pathway } });
      await syncPrimaryRespondent(tx, caseRecord.id);
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "FORMAL_ANSWER_SUBMITTED",
      details: pathway ? `Chose pathway: ${pathway.replace(/_/g, " ")}` : "Filed the answer to the formal charge",
    });
    // The Secretariat has to verify the answer is notarized, so tell them it
    // is waiting rather than leaving it to be noticed.
    const secretariat = await prisma.user.findMany({
      where: { role: "SECRETARIAT" },
      select: { id: true },
    });
    for (const member of secretariat) {
      await notify({
        userId: member.id,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: ${respondentRows(caseRecord).length > 1 ? myRow?.claimedName ?? "a respondent" : "the respondent"} filed their formal written answer. Confirm whether it is notarized.`,
      });
    }

    const updated = await prisma.case.findUnique({ where: { id: caseRecord.id }, include: { respondents: true } });
    await notifyPathwayReady(updated);

    res.status(201).json(answer);
  })
);

// --- Complainant: pick a pathway ---------------------------------------------
casesRouter.post(
  "/:id/pathway-choice",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const { pathway } = req.body;
    if (!VALID_PATHWAYS.has(pathway)) {
      return res.status(400).json({ error: "pathway must be FORMAL_INVESTIGATION or POSITION_PAPER" });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.complainantId !== req.user.sub) {
      return res.status(403).json({ error: "You can only choose a pathway for your own case" });
    }
    if (caseRecord.isAnonymous) {
      return res.status(409).json({ error: "An anonymous case proceeds by the respondent's position paper only; there is no pathway to choose." });
    }
    if (caseRecord.status !== "FORMAL_CHARGE_ISSUED") {
      return res.status(409).json({ error: "A pathway can only be chosen once the formal charge has been sent." });
    }
    if (caseRecord.complainantPathwayChoice) {
      return res.status(409).json({ error: "You have already chosen a pathway." });
    }

    await prisma.case.update({
      where: { id: caseRecord.id },
      data: { complainantPathwayChoice: pathway, complainantPathwayChosenAt: new Date() },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "PATHWAY_CHOSEN",
      details: `Chose pathway: ${pathway.replace(/_/g, " ")}`,
    });

    const updated = await prisma.case.findUnique({ where: { id: caseRecord.id }, include: { respondents: true } });
    await notifyPathwayReady(updated);

    res.json(await prisma.case.findUnique({ where: { id: caseRecord.id } }));
  })
);

// --- Secretariat: set or override the final pathway --------------------------
// The Secretariat holds final authority over which pathway a case proceeds
// under — not just to break a tie when the parties disagree, but at any
// point while the case is awaiting its pathway, including overriding a
// pathway the parties already agreed on. Once the case advances past this
// stage (a hearing scheduled, or deliberation reached), downstream records
// depend on the chosen pathway, so it locks in from there.
casesRouter.post(
  "/:id/pathway-recommendation",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { pathway } = req.body;
    if (!VALID_PATHWAYS.has(pathway)) {
      return res.status(400).json({ error: "pathway must be FORMAL_INVESTIGATION or POSITION_PAPER" });
    }

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id }, include: { respondents: true } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.isAnonymous) {
      return res.status(409).json({
        error: "An anonymous case proceeds by the respondent's position paper only. It is set automatically once the answer is approved.",
      });
    }
    if (caseRecord.status !== "FORMAL_CHARGE_ISSUED") {
      return res.status(409).json({ error: "The pathway can only be set while the case is awaiting the formal charge's pathway." });
    }
    const unapproved = await respondentsAwaitingApproval(prisma, caseRecord.id, "RESPONDENT_ANSWER");
    if (unapproved.length > 0) {
      return res.status(409).json({
        error: `Approve every respondent's notarized answer before setting the pathway. Still to approve: ${unapproved.join(", ")}.`,
      });
    }
    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: {
        finalPathway: pathway,
        pathwayRecommendedById: req.user.sub,
        pathwayRecommendedAt: new Date(),
      },
    });
    // Under the Position Paper pathway each party owes a notarized paper: the
    // complainant, and every respondent the case is still proceeding against.
    // An anonymous complainant owes none.
    if (pathway === "POSITION_PAPER") {
      const now = new Date();
      if (!caseRecord.isAnonymous) {
        await ensureDeadline(caseRecord.id, "POSITION_PAPER_COMPLAINANT", now, caseRecord.governingFramework);
      }
      for (const row of activeRespondentRows(caseRecord).filter((r) => r.assignedAt)) {
        await ensureDeadline(caseRecord.id, "POSITION_PAPER", now, frameworkFor(row.typeAtFiling ?? row.claimedType), row.id);
      }
    }
    const choiceOf = (row) => (row.pathwayChoice ? row.pathwayChoice.replace(/_/g, " ") : "not yet chosen");
    const rowsHere = respondentRows(caseRecord);
    const respondentChoiceText =
      rowsHere.length > 1
        ? rowsHere.map((r) => `${r.claimedName}: ${choiceOf(r)}`).join(", ")
        : caseRecord.respondentPathwayChoice
        ? caseRecord.respondentPathwayChoice.replace(/_/g, " ")
        : "not yet chosen";
    const complainantChoiceText = caseRecord.complainantPathwayChoice
      ? caseRecord.complainantPathwayChoice.replace(/_/g, " ")
      : "not yet chosen";
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "PATHWAY_RECOMMENDED",
      details: `Respondent chose ${respondentChoiceText}; Complainant chose ${complainantChoiceText}; Secretariat set the final pathway to ${pathway.replace(/_/g, " ")}${
        caseRecord.finalPathway ? ` (overriding ${caseRecord.finalPathway.replace(/_/g, " ")})` : ""
      }.`,
    });

    res.json(updated);
  })
);

// --- Secretariat: schedule a hearing (Pre-Trial, then repeatable Trials) ----
// The first hearing scheduled for a case is always the Pre-Trial; every one
// after that is a Trial — computed here from the existing count, never
// trusted from the client. Repeatable for as long as the investigation is
// open (status stays/returns to HEARING_SCHEDULED either way).
casesRouter.post(
  "/:id/hearings",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { scheduledAt, mode, notes } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt is required" });

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "FORMAL_CHARGE_ISSUED" && caseRecord.status !== "HEARING_SCHEDULED") {
      return res.status(409).json({ error: "A hearing can only be scheduled while the formal investigation is in progress." });
    }
    if (caseRecord.finalPathway !== "FORMAL_INVESTIGATION") {
      return res.status(409).json({
        error: "Hearing scheduling is only available once the Formal Investigation pathway is confirmed.",
      });
    }

    const hearingCount = await prisma.hearing.count({ where: { caseId: caseRecord.id } });
    const type = hearingCount === 0 ? "PRE_TRIAL" : "TRIAL";

    const hearing = await prisma.hearing.create({
      data: {
        caseId: req.params.id,
        type,
        scheduledAt: new Date(scheduledAt),
        mode,
        notes,
        scheduledById: req.user.sub,
      },
    });
    await prisma.case.update({ where: { id: req.params.id }, data: { status: "HEARING_SCHEDULED" } });
    await logAction({
      userId: req.user.sub,
      caseId: req.params.id,
      action: "HEARING_SCHEDULED",
      details: `${type === "PRE_TRIAL" ? "Pre-Trial" : "Trial"} hearing scheduled`,
    });

    res.status(201).json(hearing);
  })
);

// --- Secretariat: leave per-party guidance on a hearing ---------------------
// The complainant and respondent are often asked for different things after
// a hearing, so each gets their own note. Freely editable — no lock, same as
// the rest of the Secretariat's tools on this pathway.
casesRouter.post(
  "/:id/hearings/:hearingId/notes",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id }, include: { respondents: true } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const hearing = await prisma.hearing.findUnique({ where: { id: req.params.hearingId } });
    if (!hearing || hearing.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Hearing not found" });
    }

    const noteForComplainant = req.body.noteForComplainant != null ? String(req.body.noteForComplainant).trim() || null : hearing.noteForComplainant;
    const noteForRespondent = req.body.noteForRespondent != null ? String(req.body.noteForRespondent).trim() || null : hearing.noteForRespondent;
    const requiresDocFromComplainant =
      req.body.requiresDocFromComplainant != null
        ? Boolean(req.body.requiresDocFromComplainant)
        : hearing.requiresDocFromComplainant;
    const requiresDocFromRespondent =
      req.body.requiresDocFromRespondent != null
        ? Boolean(req.body.requiresDocFromRespondent)
        : hearing.requiresDocFromRespondent;

    const updated = await prisma.hearing.update({
      where: { id: hearing.id },
      data: { noteForComplainant, noteForRespondent, requiresDocFromComplainant, requiresDocFromRespondent },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "HEARING_NOTE_UPDATED",
      details: `Left guidance on the ${hearing.type === "PRE_TRIAL" ? "Pre-Trial" : "Trial"} hearing`,
    });

    if (noteForComplainant) {
      await notify({
        userId: caseRecord.complainantId,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: the Secretariat left you a note on what to submit next.${
          requiresDocFromComplainant ? " A document is required." : ""
        }`,
      });
    }
    if (noteForRespondent) {
      await notifyRespondents(
        caseRecord,
        `Case ${caseLabel(caseRecord)}: the Secretariat left you a note on what to submit next.${
          requiresDocFromRespondent ? " A document is required." : ""
        }`
      );
    }

    res.json(updated);
  })
);

// --- Secretariat: end the Formal Investigation's hearing phase --------------
// Requires at least one hearing (guaranteed by the status check — the only
// way status reaches HEARING_SCHEDULED is via POST /:id/hearings above).
casesRouter.post(
  "/:id/end-formal-investigation",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, hearings: { include: { documents: { where: CURRENT_DOCUMENTS } } } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "HEARING_SCHEDULED" || caseRecord.finalPathway !== "FORMAL_INVESTIGATION") {
      return res.status(409).json({
        error: "The formal investigation can only be ended while its hearings are in progress.",
      });
    }
    const missingMinutes = caseRecord.hearings.some(
      (h) => !h.documents.some((d) => d.docType === "HEARING_MINUTES")
    );
    if (missingMinutes) {
      return res.status(409).json({
        error: "Attach the minutes for every hearing before ending the investigation.",
      });
    }

    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "FORMAL_INVESTIGATION_ENDED" },
    });
    // No more hearings, so nothing left to agree a time for.
    await prisma.schedulingRound.updateMany({
      where: { caseId: caseRecord.id, purpose: "HEARING", status: "PROPOSED" },
      data: { status: "SUPERSEDED" },
    });
    await logAction({ userId: req.user.sub, caseId: caseRecord.id, action: "FORMAL_INVESTIGATION_ENDED" });
    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: the formal investigation has concluded; the Secretariat is preparing its recommendation.`,
    });
    await notifyRespondents(caseRecord, `Case ${caseLabel(caseRecord)}: the formal investigation has concluded; the Secretariat is preparing its recommendation.`);

    res.json(updated);
  })
);

// --- Secretariat: file the Formal Investigation's recommendation ------------
// The recommendation document must already be on file (see POST
// /cases/:caseId/documents with docType RECOMMENDATION) before this can be
// filed. Filing it moves the case to DECIDED — the Formal Investigation
// pathway's equivalent of the Position Paper pathway's DELIBERATION status —
// meaning the recommendation has been forwarded and the case is now awaiting
// the outcome from the external deciding body (see POST
// /:id/investigation-outcome below, a genuinely separate, later step).
casesRouter.post(
  "/:id/investigation-recommendation",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.finalPathway !== "FORMAL_INVESTIGATION" || caseRecord.status !== "FORMAL_INVESTIGATION_ENDED") {
      return res.status(409).json({
        error: "The recommendation can only be filed once the formal investigation has ended.",
      });
    }
    const recommendationDoc = caseRecord.documents.find((d) => d.docType === "RECOMMENDATION");
    if (!recommendationDoc) {
      return res.status(409).json({ error: "Attach the recommendation document before filing it." });
    }

    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "DECIDED" },
    });
    // The recommendation is with the President: their 30 days start here.
    await ensureDeadline(caseRecord.id, "PRESIDENT_DECISION", new Date(), caseRecord.governingFramework);
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "RECOMMENDATION_FILED",
      details: `Filed recommendation "${recommendationDoc.fileName}"; awaiting the outcome.`,
    });
    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)}: the Secretariat's recommendation has been filed and forwarded; awaiting the outcome.`,
    });
    await notifyRespondents(caseRecord, `Case ${caseLabel(caseRecord)}: the Secretariat's recommendation has been filed and forwarded; awaiting the outcome.`);

    res.status(201).json(updated);
  })
);

// --- Record the Formal Investigation's outcome ------------------------------
// The Disciplining Authority's call, recorded by them or by the Secretariat
// with them. Only reachable once the recommendation has been filed (status
// DECIDED) — see POST /:id/investigation-recommendation above.
const INVESTIGATION_OUTCOME_STATUS_MAP = { NOT_LIABLE: "DISMISSED", LIABLE: "RESOLVED" };

casesRouter.post(
  "/:id/investigation-outcome",
  requireRole("SECRETARIAT", "DISCIPLINING_AUTHORITY"),
  asyncHandler(async (req, res) => {
    const { outcome, rationale, penalty } = req.body;
    if (!["LIABLE", "NOT_LIABLE"].includes(outcome)) {
      return res.status(400).json({ error: "outcome must be LIABLE or NOT_LIABLE" });
    }
    if (!rationale) {
      return res.status(400).json({ error: "rationale is required" });
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, documents: { where: CURRENT_DOCUMENTS }, decision: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.finalPathway !== "FORMAL_INVESTIGATION" || caseRecord.status !== "DECIDED") {
      return res.status(409).json({
        error: "The outcome can only be recorded once the recommendation has been filed.",
      });
    }
    if (caseRecord.decision) {
      return res.status(409).json({ error: "A decision has already been recorded for this case." });
    }
    const recommendationDoc = caseRecord.documents.find((d) => d.docType === "RECOMMENDATION");
    if (!recommendationDoc) {
      return res.status(409).json({
        error: "Attach the recommendation document before recording the outcome.",
      });
    }

    const decision = await prisma.decision.create({
      data: { caseId: caseRecord.id, decidedById: req.user.sub, outcome, penalty: penalty || null, rationale },
    });
    await prisma.case.update({
      where: { id: caseRecord.id },
      data: {
        status: INVESTIGATION_OUTCOME_STATUS_MAP[outcome],
        statusBeforeClose: caseRecord.status,
        ...(INVESTIGATION_OUTCOME_STATUS_MAP[outcome] === "DISMISSED" ? { dismissalType: "WITHOUT_PREJUDICE" } : {}),
      },
    });
    await markDeadlineMet(caseRecord.id, "PRESIDENT DECISION");

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "INVESTIGATION_OUTCOME_FILED",
      details: `Recorded outcome: ${outcome.replace(/_/g, " ")} (recommendation: "${recommendationDoc.fileName}")`,
    });
    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `A decision has been recorded for case ${caseLabel(caseRecord)}.`,
    });
    await notifyRespondents(caseRecord, `A decision has been recorded for case ${caseLabel(caseRecord)}.`);

    res.status(201).json(decision);
  })
);

// --- Committee/Secretariat: record deliberation (Position Paper pathway only) -
// The Formal Investigation pathway no longer passes through here or through
// DELIBERATION at all — see POST /:id/end-formal-investigation and
// POST /:id/documents/investigation-outcome, which take it straight from
// HEARING_SCHEDULED to FORMAL_INVESTIGATION_ENDED to RESOLVED/DISMISSED.
casesRouter.post(
  "/:id/deliberation",
  requireRole("COMMITTEE", "SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondentUser: true, respondents: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "FORMAL_CHARGE_ISSUED" || caseRecord.finalPathway !== "POSITION_PAPER") {
      return res.status(409).json({
        error: "Deliberation is only available under the Position Paper pathway.",
      });
    }
    const positionPapers = caseRecord.documents.filter(
      (d) => d.docType === "POSITION_PAPER" && d.reviewStatus === "APPROVED"
    );
    // An anonymous complainant files no position paper; only the respondent's is owed.
    const hasComplainantPaper =
      caseRecord.isAnonymous || positionPapers.some((d) => d.uploadedById === caseRecord.complainantId);
    const hasRespondentPaper = activeRespondentRows(caseRecord)
      .filter((r) => r.assignedAt)
      .every((r) => positionPapers.some((d) => d.uploadedById === r.userId));
    if (!hasComplainantPaper || !hasRespondentPaper) {
      return res.status(409).json({
        error: caseRecord.isAnonymous
          ? "The respondent's position paper must be on file and confirmed notarized by the Secretariat before deliberation can be recorded."
          : "Both parties' position papers must be on file and confirmed notarized by the Secretariat before deliberation can be recorded.",
      });
    }
    // The CODI report is now a document attachment (see POST
    // /cases/:caseId/documents with docType DELIBERATION_NOTES) rather than
    // typed notes — it must be on file before deliberation can be finalized.
    const reportDoc = caseRecord.documents.find((d) => d.docType === "DELIBERATION_NOTES");
    if (!reportDoc) {
      return res.status(409).json({
        error: "Attach the CODI report document before submitting the deliberation.",
      });
    }

    const deliberation = await prisma.deliberation.create({
      data: {
        caseId: req.params.id,
        recordedById: req.user.sub,
        notes: `CODI report on file: ${reportDoc.fileName}`,
        recommendation: "See the attached CODI report.",
      },
    });
    await prisma.case.update({ where: { id: req.params.id }, data: { status: "DELIBERATION" } });
    // The CODI report is with the President: their 30 days start here.
    await ensureDeadline(caseRecord.id, "PRESIDENT_DECISION", new Date(), caseRecord.governingFramework);
    await logAction({ userId: req.user.sub, caseId: req.params.id, action: "DELIBERATION_RECORDED" });

    res.status(201).json(deliberation);
  })
);

// --- The final decision on the case -----------------------------------------
// The Disciplining Authority decides it; either they record it themselves or
// the Secretariat records it with them, and decidedById keeps whose act it
// was either way.
const VALID_DECISION_OUTCOMES = new Set(["LIABLE", "NOT_LIABLE"]);

casesRouter.post(
  "/:id/decision",
  requireRole("SECRETARIAT", "DISCIPLINING_AUTHORITY"),
  asyncHandler(async (req, res) => {
    const { outcome, penalty, rationale } = req.body;
    if (!VALID_DECISION_OUTCOMES.has(outcome)) {
      return res.status(400).json({ error: "outcome must be LIABLE or NOT_LIABLE" });
    }
    if (!rationale) {
      return res.status(400).json({ error: "rationale is required" });
    }
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (caseRecord.status !== "DELIBERATION") {
      return res.status(409).json({ error: "A decision can only be logged once deliberation has been recorded." });
    }

    const decision = await prisma.decision.create({
      data: { caseId: caseRecord.id, decidedById: req.user.sub, outcome, penalty, rationale },
    });
    const statusMap = { NOT_LIABLE: "DISMISSED", LIABLE: "RESOLVED" };
    await prisma.case.update({
      where: { id: caseRecord.id },
      data: {
        status: statusMap[outcome],
        statusBeforeClose: caseRecord.status,
        ...(statusMap[outcome] === "DISMISSED" ? { dismissalType: "WITHOUT_PREJUDICE" } : {}),
      },
    });
    await markDeadlineMet(caseRecord.id, "PRESIDENT DECISION");
    await logAction({ userId: req.user.sub, caseId: caseRecord.id, action: "DECISION_RECORDED", details: outcome });

    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `A decision has been recorded for case ${caseLabel(caseRecord)}.`,
    });

    res.status(201).json(decision);
  })
);

// --- Secretariat: dismiss a case at any stage ---------------------------------
// Unlike the Committee's non-compliance dismissal, this has no precondition: the
// Secretariat can close any open case. The reason is required and goes to the
// audit log and to both parties, so the closure is never unexplained.
casesRouter.post(
  "/:id/dismiss",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Give a reason for dismissing this case." });
    // The Secretariat says which kind of dismissal this is — it decides whether
    // the case can ever be reopened.
    const dismissalType =
      req.body?.prejudice === "WITH" ? "WITH_PREJUDICE" : req.body?.prejudice === "WITHOUT" ? "WITHOUT_PREJUDICE" : null;
    if (!dismissalType) {
      return res.status(400).json({ error: "Say whether the dismissal is with prejudice or without prejudice." });
    }
    const kind = dismissalType === "WITH_PREJUDICE" ? "with prejudice" : "without prejudice";

    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.id }, include: { respondents: true } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (["DISMISSED", "RESOLVED", "ESCALATED"].includes(caseRecord.status)) {
      return res.status(409).json({ error: "This case has already been concluded." });
    }

    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "DISMISSED", dismissalType, statusBeforeClose: caseRecord.status },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "CASE_DISMISSED_BY_SECRETARIAT",
      details: `Dismissed ${kind} by the Secretariat: ${reason}`,
    });
    const message = `Case ${caseLabel(caseRecord)} was dismissed ${kind} by the Secretariat. Reason: ${reason}`;
    await notify({ userId: caseRecord.complainantId, caseId: caseRecord.id, message });
    // Only a respondent who has been served knows the case exists.
    await notifyRespondents(caseRecord, message, { servedOnly: true, includeCleared: true });

    res.json(updated);
  })
);

// --- Committee: dismiss for non-compliance ----------------------------------
// Available only after the complainant's 3-day notarized-complaint window has
// lapsed (deadline OVERDUE) with no notarized complaint document on record.
// The dismissal is a human decision by the Committee, not automatic.
const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

casesRouter.post(
  "/:id/dismiss-noncompliance",
  requireRole("COMMITTEE"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { deadlines: true, documents: { where: CURRENT_DOCUMENTS } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "This case has already been concluded." });
    }

    const windowLapsed = caseRecord.deadlines.some(
      (d) => d.stage.includes("NOTARIZED COMPLAINT") && d.status === "OVERDUE"
    );
    const hasNotarizedComplaint = caseRecord.documents.some(
      (doc) => doc.docType === "COMPLAINT" && doc.reviewStatus === "APPROVED"
    );
    if (!windowLapsed || hasNotarizedComplaint) {
      return res.status(409).json({
        error:
          "This case cannot be dismissed for non-compliance: the notarization window has not lapsed, or a notarized complaint is already on record.",
      });
    }

    const updated = await prisma.case.update({
      where: { id: caseRecord.id },
      data: { status: "DISMISSED", dismissalType: "WITHOUT_PREJUDICE", statusBeforeClose: caseRecord.status },
    });
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "CASE_DISMISSED_NONCOMPLIANCE",
      details: "Dismissed by the Committee: notarized complaint not submitted within the 3-day window",
    });
    await notify({
      userId: caseRecord.complainantId,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)} was dismissed by the Committee because the notarized complaint was not submitted within the 3-day window.`,
    });

    res.json(updated);
  })
);

// --- Secretariat: reopen a closed case ----------------------------------------
// Any closed case can be reopened — except one dismissed WITH prejudice, which
// is final. The reason is required and goes to the audit log and to the parties.
// The case goes back to where it stood when it closed. A decision that had been
// recorded is written into the audit log in full and then cleared, so the case
// can be decided again; the old one stays on the record there.
casesRouter.post(
  "/:id/reopen",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ error: "Give a reason for reopening this case." });

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { respondents: true, decision: { include: { decidedBy: { select: { fullName: true } } } } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    if (!TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "Only a closed case can be reopened." });
    }
    if (caseRecord.status === "DISMISSED" && caseRecord.dismissalType === "WITH_PREJUDICE") {
      return res.status(409).json({
        error: "This case was dismissed with prejudice and cannot be reopened.",
      });
    }

    const wasClosed = caseRecord.status;
    const target =
      caseRecord.statusBeforeClose && !TERMINAL_STATUSES.has(caseRecord.statusBeforeClose)
        ? caseRecord.statusBeforeClose
        : caseRecord.caseNumber
        ? "PRIMA_FACIE_FOUND"
        : "SUBMITTED";

    const decisionNote = caseRecord.decision
      ? ` Previous decision on record: ${caseRecord.decision.outcome.replace(/_/g, " ")}${
          caseRecord.decision.penalty ? `, penalty: ${caseRecord.decision.penalty}` : ""
        }; rationale: ${caseRecord.decision.rationale} (recorded ${new Date(caseRecord.decision.decidedAt).toISOString().slice(0, 10)}${
          caseRecord.decision.decidedBy ? ` by ${caseRecord.decision.decidedBy.fullName}` : ""
        }).`
      : "";

    const updated = await prisma.$transaction(async (tx) => {
      if (caseRecord.decision) await tx.decision.delete({ where: { id: caseRecord.decision.id } });
      // Back at the prima facie vote, the findings it produced are open again.
      if (target === "ANSWER_SUBMITTED") {
        await tx.caseRespondent.updateMany({ where: { caseId: caseRecord.id }, data: { primaFacieFound: null } });
      }
      return tx.case.update({
        where: { id: caseRecord.id },
        data: {
          status: target,
          dismissalType: null,
          statusBeforeClose: null,
          // Reopened, it is entertained after all: no longer a strike on its filer.
          notEntertainedAt: null,
          notEntertainedReason: null,
          reopenedAt: new Date(),
          reopenCount: { increment: 1 },
        },
      });
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "CASE_REOPENED",
      details: `Reopened by the Secretariat (was ${wasClosed.toLowerCase()}${
        caseRecord.dismissalType ? `, ${caseRecord.dismissalType === "WITH_PREJUDICE" ? "with" : "without"} prejudice` : ""
      }; returned to ${target.replace(/_/g, " ").toLowerCase()}): ${reason}${decisionNote}`,
    });
    const message = `Case ${caseLabel(caseRecord)} was reopened by the Secretariat. Reason: ${reason}`;
    await notify({ userId: caseRecord.complainantId, caseId: caseRecord.id, message });
    await notifyRespondents(caseRecord, message, { servedOnly: true, includeCleared: true });

    res.json(updated);
  })
);
