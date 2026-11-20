import { Router } from "express";
import multer from "multer";
import {
  respondentRowFor,
  respondentRows,
  activeRespondentRows,
  notifyRespondents,
  showCauseProgress,
  notifyPathwayReady,
  respondentsAwaitingApproval,
} from "../services/respondentService.js";
import { mergeToPdf, countPages, NOTARIZED_MAX_FILES, NOTARIZED_MAX_BYTES } from "../services/notarizedMerge.js";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction, notify } from "../services/auditService.js";
import { createDeadline, markDeadlineMet, startReportClock } from "../services/deadlineService.js";
import { frameworkFor } from "../services/respondentService.js";
import { notifySecretariatToScheduleMeeting } from "../services/schedulingService.js";
import { caseLabel } from "../utils/caseLabel.js";
import { RETURN_NOTE_MAX } from "../utils/limits.js";
import { EVIDENCE_LINK_MAX, parseEvidenceLink } from "../utils/evidenceLink.js";
import {
  isCoRespondentFiling,
  CURRENT_DOCUMENTS,
  CODI_STAFF,
  REVIEWABLE_DOC_TYPES,
  caseViewer,
  documentAttached,
  documentsShared,
} from "../services/caseAccess.js";

// mergeParams so we can read :caseId from the parent mount path.
export const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(requireAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// The notarized complaint document keeps the strict scan/photo rules.
const COMPLAINT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const COMPLAINT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Filed once by each party who files it, rather than once per case.
const PER_FILER_DOC_TYPES = new Set(["POSITION_PAPER", "SHOW_CAUSE_ANSWER", "RESPONDENT_ANSWER"]);

// Word documents, for the official orders the CODI drafts and signs outside
// the app — the show-cause template downloads as .doc, so the finished
// article comes back in the same format.
const WORD_MIME = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Evidence is broader: photos, screenshots, videos, voice recordings.
const EVIDENCE_MIME = new Set([
  ...COMPLAINT_MIME,
  ...WORD_MIME,
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
]);
// Ceiling multer enforces for any upload. Staff documents (CODI report,
// recommendation, minutes, charge, order) still use the full allowance.
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
// A party's file for a specific hearing (the alternative to sharing a link).
const HEARING_SUBMISSION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".weba",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || "";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// Multer accepts the union of both rule sets; the POST handler then applies
// the stricter complaint-document rules when docType isn't EVIDENCE (multer's
// fileFilter can't reliably read req.body.docType — field order in the
// multipart body isn't guaranteed).
const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (EVIDENCE_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type. Allowed: images, PDF, video, or audio recordings"));
  },
});

// Document types a party files as a notarized document, which may be several
// scanned pages (up to NOTARIZED_MAX_FILES files, each NOTARIZED_MAX_BYTES).
// An absent docType is the complaint, the default for a complainant.
const MULTI_FILE_DOC_TYPES = new Set([
  "",
  "COMPLAINT",
  "SHOW_CAUSE_ANSWER",
  "RESPONDENT_ANSWER",
  "POSITION_PAPER",
]);

function discard(files) {
  for (const f of files) fs.unlink(f.path, () => {});
}

// Runs multer for the "file" field and converts its errors (wrong type, too
// large, too many files) into clean 400 responses instead of a generic 500.
// One file is handled as before. Several are only accepted for a notarized
// document, and are joined into one PDF that then stands as req.file.
function uploadFiles(req, res, next) {
  upload.array("file", NOTARIZED_MAX_FILES)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File exceeds the 50 MB limit" });
      }
      if (err instanceof multer.MulterError && err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: `You can attach at most ${NOTARIZED_MAX_FILES} files.` });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }

    const files = req.files || [];
    if (files.length <= 1) {
      req.file = files[0];
      if (req.file) req.file.pageCount = await countPages(req.file);
      return next();
    }

    const docType = String(req.body.docType || "");
    if (!MULTI_FILE_DOC_TYPES.has(docType)) {
      discard(files);
      return res.status(400).json({ error: "Only a notarized document can be made of more than one file." });
    }
    const bad = files.find((f) => !COMPLAINT_MIME.has(f.mimetype));
    if (bad) {
      discard(files);
      return res.status(400).json({
        error: `"${bad.originalname}" is not a JPG, PNG, WebP, or PDF file.`,
      });
    }
    const big = files.find((f) => f.size > NOTARIZED_MAX_BYTES);
    if (big) {
      discard(files);
      return res.status(400).json({ error: `"${big.originalname}" exceeds the 10 MB per-file limit.` });
    }

    try {
      const merged = await mergeToPdf(files, UPLOADS_DIR);
      req.largestInputBytes = Math.max(...files.map((f) => f.size));
      discard(files);
      req.file = {
        filename: merged.filename,
        size: merged.size,
        mimetype: "application/pdf",
        pageCount: merged.pageCount,
        sourceNames: files.map((f) => f.originalname),
        originalname: `${path.parse(files[0].originalname).name} (${files.length} files).pdf`,
      };
      return next();
    } catch {
      discard(files);
      return res.status(400).json({
        error: "One of the files could not be read. Check that each is a valid image or PDF.",
      });
    }
  });
}

// Loads the case and checks the user may access it (a party on either side,
// or CODI staff). Returns { caseRecord, viewer }, or sends the response and
// returns null. The viewer carries which side of THIS case the user is on —
// their account role never says that (see services/caseAccess.js).
async function loadCaseForAccess(req, res) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: req.params.caseId },
    include: {
      respondentUser: { select: { id: true, fullName: true } },
      respondents: true,
      formalCharges: { select: { id: true, status: true } },
    },
  });
  if (!caseRecord) {
    res.status(404).json({ error: "Case not found" });
    return null;
  }
  const viewer = caseViewer(caseRecord, req.user);
  if (!viewer.canView) {
    res.status(403).json({ error: "You do not have access to this case" });
    return null;
  }
  return { caseRecord, viewer };
}

// Optional hearing tag on an evidence submission (the Secretariat can ask
// for evidence against a specific Formal Investigation hearing). Returns the
// hearing id, null when none was given, or false when the id does not belong
// to this case.
async function resolveEvidenceHearingId(req, caseRecord) {
  if (!req.body.hearingId) return null;
  const hearing = await prisma.hearing.findUnique({ where: { id: req.body.hearingId } });
  if (!hearing || hearing.caseId !== caseRecord.id) return false;
  return hearing.id;
}

// How many pieces of link evidence one person may put on a case. Files they
// upload are separate and uncapped; this is about the list of links staying
// readable for whoever has to follow them.
export { EVIDENCE_LINK_MAX };

// An anonymous complaint is CODI's case once it is sent: its complainant adds,
// replaces and removes nothing afterwards (their evidence came with it).
const isAnonymousComplainant = (caseRecord, userId) => caseRecord.isAnonymous && caseRecord.complainantId === userId;
const ANONYMOUS_DONE = "This is an anonymous complaint; nothing more is needed from you.";

// --- Link evidence hosted elsewhere (Complainant/Respondent on their own case) ---
// Evidence too large for the 10 MB upload cap is referenced by URL instead of
// being stored here. The row is an ordinary EVIDENCE Document with externalUrl
// set and filePath null, so it lists, attributes and deletes exactly like an
// uploaded one — CODI just follows the link to view it.
documentsRouter.post(
  "/links",
  requireRole("PARTY"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { respondents: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const viewer = caseViewer(caseRecord, req.user);
    if (!viewer.isParty) {
      return res.status(403).json({ error: "You can only add evidence to a case you are a party to" });
    }
    if (isAnonymousComplainant(caseRecord, req.user.sub)) {
      return res.status(409).json({ error: ANONYMOUS_DONE });
    }

    // Each party gets the same small allowance, counted per person so one
    // side cannot use up the other's.
    const alreadyLinked = await prisma.document.count({
      where: {
        caseId: caseRecord.id,
        docType: "EVIDENCE",
        uploadedById: req.user.sub,
        externalUrl: { not: null },
        // An archived link gives its slot back.
        ...CURRENT_DOCUMENTS,
      },
    });
    if (alreadyLinked >= EVIDENCE_LINK_MAX) {
      return res.status(409).json({
        error: `You can add up to ${EVIDENCE_LINK_MAX} evidence links. Remove one to add another, or upload the file instead.`,
      });
    }

    const link = parseEvidenceLink(req.body);
    if (link.error) return res.status(400).json({ error: link.error });
    const { label } = link;

    const hearingId = await resolveEvidenceHearingId(req, caseRecord);
    if (hearingId === false) {
      return res.status(404).json({ error: "Hearing not found" });
    }

    const document = await prisma.document.create({
      data: {
        caseId: caseRecord.id,
        uploadedById: req.user.sub,
        fileName: label,
        externalUrl: link.url,
        docType: "EVIDENCE",
        reviewStatus: "PENDING",
        hearingId,
        respondentRowId: respondentRowFor(caseRecord, req.user.sub)?.id ?? null,
      },
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "EVIDENCE_UPLOADED",
      details: `Linked evidence "${label}" (${link.hostname})`,
    });

    res.status(201).json(document);
  })
);

// --- Upload a document (Complainant/Respondent on their own case; Secretariat/Committee on any) ---
documentsRouter.post(
  "/",
  requireRole("PARTY", "SECRETARIAT", "COMMITTEE", "DISCIPLINING_AUTHORITY"),
  uploadFiles,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "A file is required" });

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { respondents: true, formalCharges: { select: { id: true, status: true } } },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const viewer = caseViewer(caseRecord, req.user);
    if (!viewer.canView) {
      // Remove the just-saved file since the upload is not authorized.
      fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      return res.status(403).json({ error: "You can only upload to a case you are a party to" });
    }
    if (isAnonymousComplainant(caseRecord, req.user.sub)) {
      fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      return res.status(409).json({ error: ANONYMOUS_DONE });
    }

    // The notarized complaint document keeps the original stricter rules;
    // evidence gets the wider media types and 50 MB ceiling. The Secretariat
    // doesn't file complaints or evidence — their uploads (e.g. proof the
    // respondent never answered) default to OTHER, a general supporting
    // record, though they may also file the CODI report under the Position
    // Paper pathway, the recommendation under the Formal Investigation
    // pathway, or a hearing's minutes. The Committee may only attach
    // the CODI report. The Respondent can attach evidence supporting their
    // defense at any point, plus their position paper once that pathway is
    // confirmed.
    // What the uploader may file depends on which side of this case they are
    // on (staff file staff documents). Keying this off the account role would
    // let a party fall through to the staff branch and upload something typed
    // FORMAL_CHARGE or SHOW_CAUSE_ORDER, which the case routes then accept as
    // the signed order.
    const actor = viewer.isStaff ? req.user.role : viewer.side;
    let docType;
    if (viewer.isAuthority) {
      docType = "FORMAL_CHARGE";
    } else if (actor === "RESPONDENT") {
      docType =
        req.body.docType === "EVIDENCE"
          ? "EVIDENCE"
          : req.body.docType === "RESPONDENT_ANSWER"
          ? "RESPONDENT_ANSWER"
          : req.body.docType === "SHOW_CAUSE_ANSWER"
          ? "SHOW_CAUSE_ANSWER"
          : "POSITION_PAPER";
    } else if (actor === "COMPLAINANT") {
      docType = req.body.docType === "EVIDENCE" ? "EVIDENCE" : req.body.docType === "POSITION_PAPER" ? "POSITION_PAPER" : "COMPLAINT";
    } else if (actor === "COMMITTEE") {
      docType = "DELIBERATION_NOTES";
    } else {
      docType =
        req.body.docType === "DELIBERATION_NOTES"
          ? "DELIBERATION_NOTES"
          : req.body.docType === "RECOMMENDATION"
          ? "RECOMMENDATION"
          : req.body.docType === "HEARING_MINUTES"
          ? "HEARING_MINUTES"
          : req.body.docType === "FORMAL_CHARGE"
          ? "FORMAL_CHARGE"
          : req.body.docType === "SHOW_CAUSE_ORDER"
          ? "SHOW_CAUSE_ORDER"
          : req.body.docType === "EVIDENCE"
          ? "EVIDENCE"
          : "OTHER";
    }

    // Which named respondent this is, when they are one: what they file is theirs.
    const myRow = respondentRowFor(caseRecord, req.user.sub);

    if (REVIEWABLE_DOC_TYPES.has(docType)) {
      const mine = await prisma.document.findMany({
        where: {
          caseId: caseRecord.id,
          docType,
          // Only live documents block a resubmission: a superseded version is
          // what the filer is replacing, and an archived one is withdrawn.
          ...CURRENT_DOCUMENTS,
          // The complaint is one per case. A position paper or an answer is one
          // per respondent, so only the filer's own blocks theirs.
          ...(PER_FILER_DOC_TYPES.has(docType) ? { uploadedById: req.user.sub } : {}),
        },
      });
      const blocking = mine.find((d) => d.reviewStatus !== "RETURNED");
      // A complaint returned for correction is explicitly back with the
      // complainant, so that window stays open whatever the document says.
      const inCorrection =
        docType === "COMPLAINT" && caseRecord.status === "RETURNED_FOR_CORRECTION";
      if (blocking && !inCorrection) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error:
            blocking.reviewStatus === "APPROVED"
              ? "This document has already been approved and is part of the case record."
              : "CODI is reviewing your document. You can submit a new one only if it is sent back.",
        });
      }
    }

    // EVIDENCE may optionally be tagged as a submission against a specific
    // Formal Investigation hearing (e.g. in response to the Secretariat's
    // note asking for it) — validated but not required, since general
    // evidence uploads don't reference a hearing at all. HEARING_MINUTES must
    // reference a specific hearing — required, not optional — but works for
    // either hearing type (Pre-Trial or Trial).
    let hearingId = null;
    let hearingType = null;
    if ((docType === "EVIDENCE" && req.body.hearingId) || docType === "HEARING_MINUTES") {
      if (!req.body.hearingId) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({ error: "hearingId is required for hearing minutes" });
      }
      const hearing = await prisma.hearing.findUnique({ where: { id: req.body.hearingId } });
      if (!hearing || hearing.caseId !== caseRecord.id) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(404).json({ error: "Hearing not found" });
      }
      hearingId = hearing.id;
      hearingType = hearing.type;
    }

    // General evidence is never stored here — it lives in the submitter's own
    // cloud storage and is recorded as a link (POST /:caseId/documents/links),
    // which keeps this database from accumulating everyone's raw media. The
    // one exception is a party's submission for a specific hearing (what the
    // Secretariat asked for in that hearing's note), which may be either a
    // link or a file of up to 10 MB.
    if (docType === "EVIDENCE") {
      const isPartyHearingSubmission = hearingId && viewer.isParty;
      if (!isPartyHearingSubmission) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({
          error: "Evidence is submitted as a link, not an upload. Share a link to the file instead.",
        });
      }
      if (req.file.size > HEARING_SUBMISSION_MAX_BYTES) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({
          error: "Files for a hearing can be up to 10 MB. For anything larger, share a link instead.",
        });
      }
    }

    // The respondent’s notarized answer to the formal charge. Attached while
    // the charge is outstanding, then POST /:id/formal-answer records it as
    // submitted. One per case, and reviewed like every other party filing: the
    // shared guard above already refuses a replacement unless the Secretariat
    // sent the last one back, so this only picks the returned copy to swap.
    let answerDocToReplace = null;
    if (docType === "RESPONDENT_ANSWER") {
      if (caseRecord.status !== "FORMAL_CHARGE_ISSUED") {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "There is no formal charge awaiting your answer for this case.",
        });
      }
      const existing = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "RESPONDENT_ANSWER", uploadedById: req.user.sub, ...CURRENT_DOCUMENTS },
      });
      if (existing.some((docu) => docu.reviewStatus === "APPROVED")) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "Your answer has already been confirmed notarized and can no longer be replaced.",
        });
      }
      answerDocToReplace = existing;
    }

    // The respondent's notarized response to the show-cause order. Filed
    // while the order is outstanding; POST /:id/answer then records it as
    // submitted. A fresh upload replaces the previous one right up until the
    // Secretariat confirms it notarized, which is what lets a respondent
    // re-file after theirs is returned as not notarized.
    let showCauseAnswerDocToReplace = null;
    if (docType === "SHOW_CAUSE_ANSWER") {
      const filedSoFar = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "SHOW_CAUSE_ANSWER", uploadedById: req.user.sub, ...CURRENT_DOCUMENTS },
      });
      // Filed while the order is outstanding — or, once filed, to replace a
      // response the Secretariat returned, on either ground. Without that
      // second window a returned response could never be corrected: by then
      // the case is held at ANSWER_UNDER_REVIEW awaiting an acceptable one.
      const returnedAnswer = await prisma.respondentAnswer.findFirst({
        where: {
          caseId: caseRecord.id,
          stage: "SHOW_CAUSE",
          returnedAt: { not: null },
          ...(myRow ? { respondentRowId: myRow.id } : {}),
        },
        orderBy: { submittedAt: "desc" },
      });
      const replacingReturned = caseRecord.status === "ANSWER_UNDER_REVIEW" && !!returnedAnswer;
      if (caseRecord.status !== "SHOW_CAUSE_ISSUED" && !replacingReturned) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "There is no show-cause order awaiting your response for this case.",
        });
      }
      if (!COMPLAINT_MIME.has(req.file.mimetype)) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({
          error: "Your notarized response must be a JPG, PNG, WebP, or PDF file",
        });
      }
      if ((req.largestInputBytes ?? req.file.size) > COMPLAINT_MAX_BYTES) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({ error: "Your notarized response exceeds the 10 MB limit" });
      }
      if (!replacingReturned && filedSoFar.some((docu) => docu.reviewStatus === "APPROVED")) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "Your response has already been confirmed notarized and can no longer be replaced.",
        });
      }
      showCauseAnswerDocToReplace = filedSoFar;
    }

    let positionPaperDocToReplace = null;
    if (docType === "POSITION_PAPER") {
      if (caseRecord.isAnonymous && viewer.isComplainant) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "An anonymous case proceeds by the respondent's position paper only; no paper is needed from you.",
        });
      }
      if (caseRecord.finalPathway !== "POSITION_PAPER") {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "A position paper can only be uploaded once the case is proceeding under the Position Paper pathway.",
        });
      }
      if (!COMPLAINT_MIME.has(req.file.mimetype)) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({
          error: "Your notarized position paper must be a JPG, PNG, WebP, or PDF file",
        });
      }
      if ((req.largestInputBytes ?? req.file.size) > COMPLAINT_MAX_BYTES) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({ error: "Your position paper exceeds the 10 MB limit" });
      }
      const mine = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "POSITION_PAPER", uploadedById: req.user.sub, ...CURRENT_DOCUMENTS },
      });
      if (mine.some((docu) => docu.reviewStatus === "APPROVED")) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "Your position paper has already been confirmed notarized and can no longer be replaced.",
        });
      }
      positionPaperDocToReplace = mine;
    }

    // A case may only ever have one notarized-complaint document on file. A
    // new upload replaces the current one — unless it's already been
    // confirmed NOTARIZED, in which case it's the official record and can
    // no longer be swapped out here (matches the DELETE route's rule).
    let complaintDocToReplace = null;
    if (docType === "COMPLAINT") {
      // A notarized copy would name an anonymous complainant.
      if (caseRecord.isAnonymous) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({ error: "An anonymous complaint has no notarized copy." });
      }
      if (!COMPLAINT_MIME.has(req.file.mimetype)) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({
          error: "The notarized complaint must be a JPG, PNG, WebP, or PDF file",
        });
      }
      if ((req.largestInputBytes ?? req.file.size) > COMPLAINT_MAX_BYTES) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(400).json({ error: "The notarized complaint exceeds the 10 MB limit" });
      }

      const existingComplaintDocs = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "COMPLAINT", ...CURRENT_DOCUMENTS },
      });
      const notarized = existingComplaintDocs.find((d) => d.reviewStatus === "APPROVED");
      if (notarized) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "This case already has a notarized complaint on file.",
        });
      }
      complaintDocToReplace = existingComplaintDocs;
    }

    // The CODI report — a case only ever has one on file; re-uploading
    // replaces it (it never "locks" the way a notarized complaint does, so
    // it can always be swapped for a corrected version before submission).
    let deliberationDocToReplace = null;
    if (docType === "DELIBERATION_NOTES") {
      if (caseRecord.status !== "FORMAL_CHARGE_ISSUED" || caseRecord.finalPathway !== "POSITION_PAPER") {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "The CODI report can only be attached once both position papers are on file under the Position Paper pathway.",
        });
      }
      const positionPapers = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "POSITION_PAPER", ...CURRENT_DOCUMENTS },
      });
      const unapprovedPapers = await respondentsAwaitingApproval(prisma, caseRecord.id, "POSITION_PAPER");
      if (unapprovedPapers.length > 0) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: `Approve every respondent's position paper before the CODI report is attached. Still to approve: ${unapprovedPapers.join(", ")}.`,
        });
      }
      // An anonymous complainant files no position paper; only the respondent's is owed.
      const hasComplainantPaper =
        caseRecord.isAnonymous || positionPapers.some((d) => d.uploadedById === caseRecord.complainantId);
      const hasRespondentPaper = activeRespondentRows(caseRecord)
        .filter((r) => r.assignedAt)
        .every((r) => positionPapers.some((d) => d.uploadedById === r.userId));
      if (!hasComplainantPaper || !hasRespondentPaper) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: caseRecord.isAnonymous
            ? "The respondent must upload their position paper before the CODI report can be attached."
            : "Both the complainant and the respondent must upload their position paper before the CODI report can be attached.",
        });
      }
      deliberationDocToReplace = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "DELIBERATION_NOTES", ...CURRENT_DOCUMENTS },
      });
    }

    // The Formal Investigation's recommendation attachment — a case only
    // ever has one on file; re-uploading replaces it, unless the outcome has
    // already been decided (POST /:id/investigation-outcome), at which point
    // it's the official record and can no longer be swapped out here.
    let recommendationDocToReplace = null;
    if (docType === "RECOMMENDATION") {
      if (caseRecord.status !== "FORMAL_INVESTIGATION_ENDED" || caseRecord.finalPathway !== "FORMAL_INVESTIGATION") {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "The recommendation can only be attached once the formal investigation has ended.",
        });
      }
      const existingDecision = await prisma.decision.findUnique({ where: { caseId: caseRecord.id } });
      if (existingDecision) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "This case's outcome has already been recorded; the recommendation can no longer be changed.",
        });
      }
      recommendationDocToReplace = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "RECOMMENDATION", ...CURRENT_DOCUMENTS },
      });
    }

    // The signed formal charge, filed once the Disciplining Authority has
    // approved the draft — by them or by the Secretariat, whoever gets the
    // signed copy back. Filing it is what issues the charge (below). One per
    // case: the signed copy replaces the draft it was made from, so the
    // Documents tab never lists both.
    let formalChargeDocToReplace = null;
    if (docType === "FORMAL_CHARGE") {
      // Two moments accept a charge file, and nothing in between: the draft,
      // while CODI still has the case, and the signed copy, once the Authority
      // has approved it. While the draft is with them the file is locked.
      const draftMoment = caseRecord.status === "PRIMA_FACIE_FOUND";
      const signedMoment =
        caseRecord.status === "FORMAL_CHARGE_PENDING_APPROVAL" &&
        (await prisma.formalCharge.count({
          where: { caseId: caseRecord.id, status: "APPROVED" },
        })) > 0;
      if (!draftMoment && !signedMoment) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error:
            caseRecord.status === "FORMAL_CHARGE_PENDING_APPROVAL"
              ? "The drafted charge is with the Disciplining Authority. It can be replaced once they send it back."
              : "The formal charge can only be attached while the case is awaiting it.",
        });
      }
      formalChargeDocToReplace = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "FORMAL_CHARGE", ...CURRENT_DOCUMENTS },
      });
    }

    // The signed show-cause order — attached while the case is still VERIFIED,
    // or while it waits on the Chairperson after being sent back for
    // revision. A case carries exactly one of these: a revision replaces the
    // file outright, so the Documents tab never lists superseded drafts. The
    // attempts themselves survive as ShowCauseOrder rows, each keeping its
    // status and the Chairperson's note, minus the file it was judged on.
    let showCauseDocToReplace = null;
    if (docType === "SHOW_CAUSE_ORDER") {
      // Attached while the case is awaiting the order: either the first draft,
      // or a revision after the Chairperson sent one back. A return leaves the
      // case at SHOW_CAUSE_PENDING_APPROVAL, so that status is allowed here
      // only when no order is actually sitting with the Chairperson.
      const awaitingChair =
        caseRecord.status === "SHOW_CAUSE_PENDING_APPROVAL" &&
        (await prisma.showCauseOrder.count({
          where: { caseId: caseRecord.id, status: "PENDING_APPROVAL" },
        })) > 0;
      if (
        (caseRecord.status !== "VERIFIED" &&
          caseRecord.status !== "SHOW_CAUSE_PENDING_APPROVAL") ||
        awaitingChair
      ) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(409).json({
          error: "The show-cause order can only be attached while the case is awaiting it.",
        });
      }
      showCauseDocToReplace = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "SHOW_CAUSE_ORDER", ...CURRENT_DOCUMENTS },
      });
    }

    // Hearing minutes — one per hearing; re-uploading replaces the prior
    // minutes for that same hearing only (other hearings' minutes untouched).
    let hearingMinutesDocToReplace = null;
    if (docType === "HEARING_MINUTES") {
      hearingMinutesDocToReplace = await prisma.document.findMany({
        where: { caseId: caseRecord.id, docType: "HEARING_MINUTES", hearingId, ...CURRENT_DOCUMENTS },
      });
    }

    // Optional display name from the client (editable before upload). Strip path
    // separators/control chars and cap length; fall back to the original name.
    const providedName = String(req.body.fileName || "")
      .replace(/[\\/\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 200);
    const fileName = providedName || req.file.originalname;

    const document = await prisma.document.create({
      data: {
        caseId: caseRecord.id,
        uploadedById: req.user.sub,
        fileName,
        filePath: req.file.filename, // stored relative to UPLOADS_DIR
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        docType,
        reviewStatus: REVIEWABLE_DOC_TYPES.has(docType) ? "PENDING" : "APPROVED",
        hearingId,
        pageCount: req.file.pageCount ?? null,
        sourceFileNames: req.file.sourceNames ? req.file.sourceNames.join("\n").slice(0, 2000) : null,
        // A respondent's own filing is tied to their row; everyone else's is not.
        respondentRowId: viewer.isRespondent ? myRow?.id ?? null : null,
      },
    });

    // A position paper filed is that party's deadline met.
    if (docType === "POSITION_PAPER") {
      await markDeadlineMet(
        caseRecord.id,
        viewer.isComplainant ? "POSITION PAPER COMPLAINANT" : "POSITION PAPER",
        viewer.isComplainant ? null : myRow?.id ?? null
      );
    }

    // The document this one replaces is kept, not destroyed: its row is marked
    // superseded and its file stays on disk, so the case's history is complete.
    // Every query that asks "is there one of these?" spreads CURRENT_DOCUMENTS,
    // which is what keeps a case showing exactly one of each.
    //
    // The order and charge pins need no detaching any more — each attempt goes
    // on pointing at the exact file it was judged on, which is what those
    // columns were for.
    const superseded = [
      complaintDocToReplace,
      deliberationDocToReplace,
      recommendationDocToReplace,
      formalChargeDocToReplace,
      showCauseDocToReplace,
      answerDocToReplace,
      showCauseAnswerDocToReplace,
      positionPaperDocToReplace,
      hearingMinutesDocToReplace,
    ]
      .filter((list) => list?.length)
      .flatMap((list) => list.map((d) => d.id));

    if (superseded.length) {
      await prisma.document.updateMany({
        where: { id: { in: superseded } },
        data: { supersededAt: new Date(), supersededById: document.id },
      });
    }

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: docType === "EVIDENCE" ? "EVIDENCE_UPLOADED" : "DOCUMENT_UPLOADED",
      details:
        docType === "EVIDENCE"
          ? `Uploaded evidence "${fileName}"`
          : docType === "OTHER"
          ? `Uploaded supporting record "${fileName}"`
          : docType === "POSITION_PAPER"
          ? `Uploaded position paper "${fileName}"`
          : docType === "DELIBERATION_NOTES"
          ? `Attached CODI report "${fileName}"`
          : docType === "RECOMMENDATION"
          ? `Attached recommendation "${fileName}"`
          : docType === "HEARING_MINUTES"
          ? `Attached ${hearingType === "PRE_TRIAL" ? "Pre-Trial" : "Trial"} hearing minutes "${fileName}"`
          : docType === "FORMAL_CHARGE"
          ? `Attached the formal charge "${fileName}"`
          : docType === "RESPONDENT_ANSWER"
          ? `Filed the notarized answer to the formal charge "${fileName}" — awaiting Secretariat notarization review`
          : docType === "SHOW_CAUSE_ANSWER"
          ? `Filed the notarized response to the show-cause order "${fileName}" — awaiting Secretariat notarization review`
          : docType === "SHOW_CAUSE_ORDER"
          ? `Attached the show-cause order "${fileName}"`
          : `Uploaded "${fileName}" — awaiting Secretariat notarization review`,
    });

    // Complaint documents need the Secretariat's notarization check either
    // way — tell them a document is waiting for review.
    if (docType === "COMPLAINT" || docType === "SHOW_CAUSE_ANSWER" || docType === "POSITION_PAPER") {
      const filer =
        docType === "COMPLAINT"
          ? "the complainant"
          : docType === "SHOW_CAUSE_ANSWER"
          ? "the respondent"
          : viewer.side === "COMPLAINANT"
          ? "the complainant"
          : "the respondent";
      const secretariat = await prisma.user.findMany({
        where: { role: "SECRETARIAT" },
        select: { id: true },
      });
      for (const member of secretariat) {
        await notify({
          userId: member.id,
          caseId: caseRecord.id,
          message: `Case ${caseLabel(caseRecord)}: ${filer} uploaded "${fileName}". Please verify its notarization.`,
        });
      }
    }

    // A replacement answer filed after a return is the re-filing itself —
    // there is no separate submit step — so the Secretariat is told here that
    // a new copy is waiting for review.
    if (docType === "FORMAL_CHARGE") {
      const approved = await prisma.formalCharge.findFirst({
        where: { caseId: caseRecord.id, status: "APPROVED" },
        orderBy: { issuedAt: "desc" },
      });
      if (approved && caseRecord.status === "FORMAL_CHARGE_PENDING_APPROVAL") {
        await prisma.case.update({
          where: { id: caseRecord.id },
          data: { status: "FORMAL_CHARGE_ISSUED" },
        });
        // CODI's own clock for the signed charge is met; each respondent the case
        // proceeds against now has their own period to answer it.
        await markDeadlineMet(caseRecord.id, "FORMAL CHARGE");
        for (const row of activeRespondentRows(caseRecord).filter((r) => r.assignedAt)) {
          await createDeadline(
            caseRecord.id,
            "ANSWER_TO_CHARGE",
            new Date(),
            frameworkFor(row.typeAtFiling ?? row.claimedType),
            row.id
          );
        }
        await logAction({
          userId: req.user.sub,
          caseId: caseRecord.id,
          action: "FORMAL_CHARGE_ISSUED",
          details: `Signed formal charge filed as "${fileName}"`,
        });
        await notifyRespondents(caseRecord, `A formal charge has been issued for case ${caseLabel(caseRecord)}. Please submit your notarized answer.`);
      }
    }

    // The answer to the formal charge, re-filed after the Secretariat sent the
    // last one back. The first filing is announced by POST /:id/formal-answer;
    // a replacement never reaches that route, so it is announced here.
    if (docType === "RESPONDENT_ANSWER") {
      const alreadyFiled = await prisma.respondentAnswer.findFirst({
        where: { caseId: caseRecord.id, stage: "FORMAL_CHARGE" },
      });
      if (alreadyFiled) {
        const secretariat = await prisma.user.findMany({
          where: { role: "SECRETARIAT" },
          select: { id: true },
        });
        for (const member of secretariat) {
          await notify({
            userId: member.id,
            caseId: caseRecord.id,
            message: `Case ${caseLabel(caseRecord)}: the respondent filed a corrected formal written answer. Confirm it is notarized.`,
          });
        }
      }
    }

    if (docType === "SHOW_CAUSE_ANSWER") {
      const returned = await prisma.respondentAnswer.findFirst({
        where: { caseId: caseRecord.id, stage: "SHOW_CAUSE", returnedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
      });
      if (returned) {
        await prisma.respondentAnswer.update({
          where: { id: returned.id },
          data: { returnedAt: null, returnedById: null, returnReason: null, returnNote: null },
        });
        const secretariat = await prisma.user.findMany({
          where: { role: "SECRETARIAT" },
          select: { id: true },
        });
        for (const member of secretariat) {
          await notify({
            userId: member.id,
            caseId: caseRecord.id,
            message: `Case ${caseLabel(caseRecord)}: the respondent filed a replacement response. Review it again.`,
          });
        }
      }
    }

    if (docType === "RESPONDENT_ANSWER") {
      const alreadySubmitted = await prisma.respondentAnswer.findFirst({
        where: { caseId: caseRecord.id, stage: "FORMAL_CHARGE" },
      });
      if (alreadySubmitted) {
        const secretariat = await prisma.user.findMany({
          where: { role: "SECRETARIAT" },
          select: { id: true },
        });
        for (const member of secretariat) {
          await notify({
            userId: member.id,
            caseId: caseRecord.id,
            message: `Case ${caseLabel(caseRecord)}: the respondent re-filed their formal written answer. Confirm whether it is notarized.`,
          });
        }
      }
    }
    res.status(201).json(document);
  })
);

// --- Stream a document's file (any case party or CODI staff) ----------------
documentsRouter.get(
  "/:docId/file",
  asyncHandler(async (req, res) => {
    const access = await loadCaseForAccess(req, res);
    if (!access) return;
    const { caseRecord, viewer } = access;

    const document = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!document || document.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Document not found" });
    }

    // The respondent’s notarized answer is not the complainant’s to read, even
    // though they are a party to the case.
    // Each side may read the other's filings once the respondent has been
    // served the show-cause order; before that the case is still intake.
    // A document under review is not on the case record yet: only its filer
    // and CODI can open it. Mirrors the payload filter in cases.routes.js.
    if (viewer.isParty && !documentAttached(document, req.user.sub)) {
      return res.status(403).json({ error: "You do not have access to this document" });
    }

    // One respondent never opens another's filings.
    if (viewer.isRespondent && isCoRespondentFiling(document, caseRecord, req.user.sub)) {
      return res.status(403).json({ error: "You do not have access to this document" });
    }

    // A party may open only the show-cause order that was served on the
    // respondent — never a draft or a returned attempt. Mirrors the payload
    // filter in cases.routes.js.
    if (viewer.isParty && document.docType === "SHOW_CAUSE_ORDER") {
      const served = await prisma.showCauseOrder.findFirst({
        where: { caseId: caseRecord.id, documentId: document.id, status: "SERVED" },
      });
      if (!served) {
        return res.status(403).json({ error: "You do not have access to this document" });
      }
    }

    if (!documentsShared(caseRecord)) {
      const hiddenFromComplainant =
        (document.docType === "RESPONDENT_ANSWER" || document.docType === "SHOW_CAUSE_ANSWER") &&
        viewer.isComplainant;
      const hiddenFromRespondent = document.docType === "COMPLAINT" && viewer.isRespondent;
      if (hiddenFromComplainant || hiddenFromRespondent) {
        return res.status(403).json({ error: "You do not have access to this document" });
      }
    }

    // Link-only evidence has no stored file; the client opens externalUrl
    // directly instead of calling this route.
    if (!document.filePath) {
      return res.status(409).json({
        error: "This evidence is hosted externally — open its link instead.",
      });
    }

    // Resolve safely and confirm the path stays inside the uploads directory.
    const absolutePath = path.resolve(UPLOADS_DIR, document.filePath);
    if (!absolutePath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      return res.status(400).json({ error: "Invalid file path" });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "File is missing from storage" });
    }

    if (document.mimeType) res.type(document.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.fileName)}"`
    );
    res.sendFile(absolutePath);
  })
);

// --- Approve or send back a submitted document (Secretariat only) -----------
// A document is not on the case record until it is approved: until then only
// its filer and CODI can see it. Sending it back requires a note — the filer
// has to know what to fix, and "returned" on its own is not actionable.
const DOC_LABELS = {
  COMPLAINT: "notarized complaint",
  SHOW_CAUSE_ANSWER: "response to the show-cause order",
  RESPONDENT_ANSWER: "formal written answer",
  POSITION_PAPER: "position paper",
  SHOW_CAUSE_ORDER: "show-cause order",
  FORMAL_CHARGE: "formal charge",
  DELIBERATION_NOTES: "CODI report",
  RECOMMENDATION: "recommendation",
  HEARING_MINUTES: "hearing minutes",
  OTHER: "document",
};

documentsRouter.patch(
  "/:docId/review",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    if (!["APPROVED", "RETURNED", "PENDING"].includes(status)) {
      return res.status(400).json({ error: "status must be APPROVED, RETURNED, or PENDING" });
    }
    if (String(note || "").length > RETURN_NOTE_MAX) {
      return res.status(400).json({
        error: `The message can be at most ${RETURN_NOTE_MAX.toLocaleString()} characters.`,
      });
    }
    if (status === "RETURNED" && !String(note || "").trim()) {
      return res.status(400).json({
        error: "A note telling the filer what is wrong with the document is required",
      });
    }

    const document = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!document || document.caseId !== req.params.caseId) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (!REVIEWABLE_DOC_TYPES.has(document.docType)) {
      return res.status(400).json({
        error: "Only a document filed by a party goes through this review.",
      });
    }

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        reviewStatus: status,
        reviewedById: status === "PENDING" ? null : req.user.sub,
        reviewedAt: status === "PENDING" ? null : new Date(),
        reviewNote: status === "RETURNED" ? String(note).trim() : null,
      },
    });

    // An approved notarized complaint satisfies the complainant's 3-day
    // compliance window. Scoped to COMPLAINT: approving the respondent's
    // filings is a different review and must not close the complainant's
    // deadline.
    if (status === "APPROVED" && document.docType === "COMPLAINT") {
      await markDeadlineMet(req.params.caseId, "NOTARIZED COMPLAINT");
    }

    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { respondents: true },
    });

    // Accepting a response to the show-cause order is accepting that filing:
    // there is no second approval. With several respondents the case moves on
    // once every one of their responses is accepted (or recorded as lapsed).
    const answeringStage =
      caseRecord?.status === "ANSWER_UNDER_REVIEW" || caseRecord?.status === "SHOW_CAUSE_ISSUED";
    if (document.docType === "SHOW_CAUSE_ANSWER" && answeringStage) {
      const answer = await prisma.respondentAnswer.findFirst({
        where: {
          caseId: caseRecord.id,
          stage: "SHOW_CAUSE",
          ...(document.respondentRowId ? { respondentRowId: document.respondentRowId } : {}),
        },
        orderBy: { submittedAt: "desc" },
      });

      if (status === "APPROVED") {
        const rowName = respondentRows(caseRecord).find((r) => r.id === document.respondentRowId)?.claimedName;
        await logAction({
          userId: req.user.sub,
          caseId: caseRecord.id,
          action: "ANSWER_APPROVED",
          details: `Response to the show-cause order accepted by the Secretariat${rowName && caseRecord.respondents.length > 1 ? ` (${rowName})` : ""}`,
        });
        const progress = await showCauseProgress(prisma, caseRecord.id);
        if (caseRecord.status === "ANSWER_UNDER_REVIEW" && progress.allSettled) {
          await prisma.case.update({
            where: { id: caseRecord.id },
            data: { status: "ANSWER_SUBMITTED" },
          });
          await startReportClock(caseRecord, "RESPONSE");
          await notifyRespondents(
            caseRecord,
            `Your response for case ${caseLabel(caseRecord)} has been accepted. The Committee will now consider the case.`,
            { servedOnly: true }
          );
          await notifySecretariatToScheduleMeeting(caseRecord);
        }
      }

      // Sending the document back sends the filing back with it, so the
      // respondent sees why and can file a corrected copy.
      if (status === "RETURNED" && answer && !answer.returnedAt) {
        await prisma.respondentAnswer.update({
          where: { id: answer.id },
          data: {
            returnedAt: new Date(),
            returnedById: req.user.sub,
            returnNote: String(note).trim(),
          },
        });
      }
    }

    if (status === "APPROVED" && document.docType === "RESPONDENT_ANSWER" && caseRecord) {
      await notifyPathwayReady(caseRecord);
    }

    await logAction({
      userId: req.user.sub,
      caseId: req.params.caseId,
      action: "DOCUMENT_REVIEWED",
      details:
        status === "RETURNED"
          ? `Sent back "${document.fileName}": ${String(note).trim()}`
          : `${status === "APPROVED" ? "Approved" : "Reopened"} "${document.fileName}"`,
    });

    // Always the person who filed it — a position paper or an answer is not
    // the other side's to be told about, and the filer is who must re-submit.
    if (caseRecord && document.uploadedById) {
      const what = DOC_LABELS[document.docType] || "document";
      await notify({
        userId: document.uploadedById,
        caseId: caseRecord.id,
        message:
          status === "APPROVED"
            ? `Your ${what} for case ${caseLabel(caseRecord)} has been approved and attached to the case.`
            : status === "RETURNED"
            ? `Your ${what} for case ${caseLabel(caseRecord)} was sent back: ${String(note).trim()} Please submit a corrected document.`
            : `Your ${what} for case ${caseLabel(caseRecord)} is awaiting CODI's approval again.`,
      });
    }

    res.json(updated);
  })
);

// --- Archive a document (its own uploader only) ----------------------------
// Nothing filed is ever destroyed. Archiving withdraws a document from the
// case — it stops being part of the record, stops counting against the slot it
// held, and leaves the Documents tab — but the row and the file stay, listed
// on the Records page with the reason given here. One-way: there is no
// unarchive route, and adding one quietly would undo the point.
//
// Who may do it is unchanged from when this destroyed things: the uploader
// only, never once the Secretariat has approved it, and never past the status
// where that kind of document becomes fixed.
documentsRouter.post(
  "/:docId/archive",
  requireRole("PARTY", "SECRETARIAT", "COMMITTEE"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const document = await prisma.document.findUnique({
      where: { id: req.params.docId },
      include: { showCauseOrder: { select: { id: true } } },
    });
    if (!document || document.caseId !== caseRecord.id) {
      return res.status(404).json({ error: "Document not found" });
    }
    // Case-level access alone isn't enough — a party may only remove a
    // document they themselves uploaded (both Complainant and Respondent can
    // now upload evidence to the same case).
    if (document.uploadedById !== req.user.sub) {
      return res.status(403).json({ error: "You can only remove documents you uploaded" });
    }
    if (isAnonymousComplainant(caseRecord, req.user.sub)) {
      return res.status(409).json({ error: ANONYMOUS_DONE });
    }
    if (document.reviewStatus === "APPROVED") {
      return res.status(409).json({
        error: "This document has already been confirmed notarized by the Secretariat and can no longer be removed.",
      });
    }
    // Once the case has moved past the status where a given docType was
    // filed, that document becomes part of the case's fixed record (e.g. the
    // CODI report once deliberation has started, or the recommendation once
    // it's been filed and forwarded).
    const REMOVAL_LOCKED_PAST_STATUS = {
      DELIBERATION_NOTES: "FORMAL_CHARGE_ISSUED",
      RECOMMENDATION: "FORMAL_INVESTIGATION_ENDED",
      FORMAL_CHARGE: "PRIMA_FACIE_FOUND",
    };
    const requiredStatus = REMOVAL_LOCKED_PAST_STATUS[document.docType];
    if (requiredStatus && caseRecord.status !== requiredStatus) {
      return res.status(409).json({
        error: "This document is part of the case's fixed record and can no longer be removed.",
      });
    }
    // A show-cause order file is freely replaceable while it's still a working
    // draft, but the moment it's been submitted to the Chairperson it's the
    // document that attempt was judged on — including one returned for
    // revision, whose file has to survive as the record of what was returned.
    if (document.showCauseOrder) {
      return res.status(409).json({
        error: "This show-cause order has already been submitted and can no longer be removed.",
      });
    }

    if (document.archivedAt) {
      return res.status(409).json({ error: "This document has already been archived." });
    }

    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res.status(400).json({ error: "Say why this document is being withdrawn." });
    }
    if (reason.length > RETURN_NOTE_MAX) {
      return res.status(400).json({
        error: `The reason can be at most ${RETURN_NOTE_MAX.toLocaleString()} characters.`,
      });
    }

    // Withdrawn from the case, not destroyed: the row and its file stay, and
    // the Records page still lists it. One-way by design — there is no route
    // back, so the reason is the explanation that has to stand.
    const archived = await prisma.document.update({
      where: { id: document.id },
      data: { archivedAt: new Date(), archivedById: req.user.sub, archiveReason: reason },
    });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "DOCUMENT_ARCHIVED",
      details: `Archived "${document.fileName}": ${reason}`,
    });

    res.json({ id: archived.id, archivedAt: archived.archivedAt });
  })
);

// --- Every version of a document (CODI staff only) --------------------------
// Replacing a file supersedes the old row rather than overwriting it, so a
// document is the head of a chain. Staff can walk it back; parties see the
// current version alone, as they always have.
documentsRouter.get(
  "/:docId/versions",
  requireRole("SECRETARIAT", "CHAIRPERSON", "COMMITTEE"),
  asyncHandler(async (req, res) => {
    const document = await prisma.document.findUnique({
      where: { id: req.params.docId },
      select: { id: true, caseId: true },
    });
    if (!document || document.caseId !== req.params.caseId) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Walk back through previousVersion. The chain is a line — supersededById
    // is unique — so this terminates; the cap is belt and braces.
    const versions = [];
    let currentId = document.id;
    for (let depth = 0; currentId && depth < 50; depth += 1) {
      const row = await prisma.document.findUnique({
        where: { id: currentId },
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          externalUrl: true,
          uploadedAt: true,
          supersededAt: true,
          archivedAt: true,
          archiveReason: true,
          reviewStatus: true,
          uploadedBy: { select: { id: true, fullName: true } },
          previousVersion: { select: { id: true } },
        },
      });
      if (!row) break;
      const { previousVersion, ...version } = row;
      versions.push(version);
      currentId = previousVersion?.id || null;
    }

    res.json({ versions });
  })
);
