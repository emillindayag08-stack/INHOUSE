import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// archiver 8 is ESM-native and exports one class per format. ZipArchive is
// the one that wires up the zip module; the bare Archiver base does not.
import { ZipArchive } from "archiver";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction } from "../services/auditService.js";
import { caseLabel } from "../utils/caseLabel.js";
import { ANONYMOUS_COMPLAINANT_ID, ANONYMOUS_COMPLAINANT_NAME } from "../services/caseView.js";
import { RETENTION_YEARS, eligibleCaseWhere, retentionInfo } from "../services/retentionService.js";

// Every file on the system, as a body of records rather than scattered through
// individual cases. CODI staff only — the listing crosses cases, so the
// per-case visibility rules the case page applies have nothing to say here;
// keeping parties out entirely is what makes that safe.
export const recordsRouter = Router();
recordsRouter.use(requireAuth, requireRole("SECRETARIAT", "CHAIRPERSON", "COMMITTEE"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const PAGE_SIZE = 50;

// A document is replaced or withdrawn, never destroyed, so "which ones" is a
// real question here in a way it is not anywhere else.
const STATES = {
  current: { supersededAt: null, archivedAt: null },
  archived: { archivedAt: { not: null } },
  // Past the retention period and awaiting (or without) the Secretariat's approval.
  get eligible() {
    return { disposalApprovedAt: null, case: eligibleCaseWhere() };
  },
  disposed: { disposalApprovedAt: { not: null } },
  superseded: { supersededAt: { not: null } },
  all: {},
};

const ROW_SELECT = {
  id: true,
  fileName: true,
  docType: true,
  fileSize: true,
  mimeType: true,
  externalUrl: true,
  filePath: true,
  reviewStatus: true,
  uploadedAt: true,
  archivedAt: true,
  archiveReason: true,
  supersededAt: true,
  uploadedBy: { select: { id: true, fullName: true, role: true } },
  archivedBy: { select: { id: true, fullName: true } },
  disposalApprovedAt: true,
  disposalNote: true,
  disposalApprovedBy: { select: { id: true, fullName: true } },
  case: {
    select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true, status: true, updatedAt: true, isAnonymous: true, complainantId: true },
  },
};

// Files an anonymous complainant uploaded, as Prisma conditions. Searching by
// name must never find them, or it would tie the person to the case.
async function anonymousFilings() {
  const cases = await prisma.case.findMany({ where: { isAnonymous: true }, select: { id: true, complainantId: true } });
  return cases.map((c) => ({ caseId: c.id, uploadedById: c.complainantId }));
}

// A row as staff may see it: an anonymous complainant's files say so instead
// of naming them, and the case's complainant id never leaves the server.
function maskRow(doc) {
  const { complainantId, isAnonymous, ...caseFields } = doc.case || {};
  const hidden = isAnonymous && doc.uploadedBy?.id === complainantId;
  return {
    ...doc,
    case: doc.case ? caseFields : doc.case,
    uploadedBy: hidden ? { id: ANONYMOUS_COMPLAINANT_ID, fullName: ANONYMOUS_COMPLAINANT_NAME, role: "PARTY" } : doc.uploadedBy,
  };
}

function buildWhere(query, hiddenFilings = []) {
  const and = [STATES[String(query.state || "current")] ?? STATES.current];

  const docType = String(query.docType || "").trim();
  if (docType) and.push({ docType });

  const reviewStatus = String(query.reviewStatus || "").trim();
  if (reviewStatus) and.push({ reviewStatus });

  const caseId = String(query.caseId || "").trim();
  if (caseId) and.push({ caseId });

  // Manila day boundaries, ordered before they become instants — the same
  // handling the Audit Log uses.
  const day = (value) => {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };
  let fromDay = day(query.from);
  let toDay = day(query.to);
  if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const range = {};
  if (fromDay) range.gte = new Date(`${fromDay}T00:00:00+08:00`);
  if (toDay) range.lte = new Date(`${toDay}T23:59:59.999+08:00`);
  if (range.gte || range.lte) and.push({ uploadedAt: range });

  // What someone actually remembers about a file: part of its name, the case
  // it was on, or who filed it.
  const q = String(query.q || "").trim();
  if (q) {
    and.push({
      OR: [
        { fileName: { contains: q, mode: "insensitive" } },
        { case: { referenceNumber: { contains: q, mode: "insensitive" } } },
        { case: { caseNumber: { contains: q, mode: "insensitive" } } },
        { case: { cpiNumber: { contains: q, mode: "insensitive" } } },
        {
          AND: [
            { uploadedBy: { fullName: { contains: q, mode: "insensitive" } } },
            ...(hiddenFilings.length ? [{ NOT: { OR: hiddenFilings } }] : []),
          ],
        },
      ],
    });
  }

  return { AND: and };
}

recordsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const where = buildWhere(req.query, await anonymousFilings());
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const [total, items] = await prisma.$transaction([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        select: ROW_SELECT,
        // uploadedAt alone is not a total order — several uploads can share a
        // moment — so id breaks the tie and keeps pages from overlapping.
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    res.json({
      items: items.map((doc) => ({ ...maskRow(doc), retention: retentionInfo(doc) })),
      retentionYears: RETENTION_YEARS,
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    });
  })
);

// The folder view's spine: every case that has files, with its counts.
recordsRouter.get(
  "/cases",
  asyncHandler(async (req, res) => {
    const grouped = await prisma.document.groupBy({
      by: ["caseId"],
      _count: { _all: true },
    });
    const cases = await prisma.case.findMany({
      where: { id: { in: grouped.map((g) => g.caseId) } },
      select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true, status: true, filedAt: true },
      orderBy: { filedAt: "desc" },
    });
    const countById = new Map(grouped.map((g) => [g.caseId, g._count._all]));

    res.json({
      cases: cases.map((c) => ({ ...c, documentCount: countById.get(c.id) ?? 0 })),
    });
  })
);

// One case's file, as a single download. Only current documents go in — an
// archived or superseded file is history, and a bundle is what the case is now.
recordsRouter.get(
  "/case/:caseId/bundle",
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true, status: true, filedAt: true },
    });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });

    const documents = (
      await prisma.document.findMany({
        where: { caseId: caseRecord.id, supersededAt: null, archivedAt: null },
        select: ROW_SELECT,
        orderBy: [{ docType: "asc" }, { uploadedAt: "asc" }],
      })
    ).map(maskRow);
    if (documents.length === 0) {
      return res.status(409).json({ error: "This case has no documents to bundle." });
    }

    const label = caseLabel(caseRecord);
    const lines = [
      `CODI-IS case file — ${label}`,
      `Status: ${caseRecord.status}`,
      `Filed: ${new Date(caseRecord.filedAt).toISOString()}`,
      `Bundled: ${new Date().toISOString()}`,
      "",
      "Confidential. This bundle forms part of the record of a case under the",
      "BulSU Anti-GBSH Code and RA 11313. Handle under the Data Privacy Act of",
      "2012 (RA 10173).",
      "",
      "CONTENTS",
      "",
    ];

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("warning", (err) => console.error("bundle warning:", err));
    archive.on("error", (err) => {
      console.error("bundle failed:", err);
      if (!res.headersSent) res.status(500).json({ error: "Could not build the bundle" });
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${label}-case-file.zip"`);
    archive.pipe(res);

    // Names repeat across a case — two "scan.pdf" uploads are ordinary — so
    // each is made unique inside its folder rather than silently overwriting.
    const used = new Set();
    for (const doc of documents) {
      const who = doc.uploadedBy?.fullName ?? "unknown";
      const when = new Date(doc.uploadedAt).toISOString().slice(0, 10);

      if (!doc.filePath) {
        // Link-only evidence has nothing to put in a zip; the manifest is the
        // only place it can live.
        lines.push(`[link] ${doc.docType} — ${doc.fileName}`);
        lines.push(`        ${doc.externalUrl}`);
        lines.push(`        filed by ${who} on ${when} · ${doc.reviewStatus}`);
        continue;
      }

      const absolute = path.resolve(UPLOADS_DIR, doc.filePath);
      if (!absolute.startsWith(path.resolve(UPLOADS_DIR) + path.sep) || !fs.existsSync(absolute)) {
        lines.push(`[missing from storage] ${doc.docType} — ${doc.fileName}`);
        continue;
      }

      let name = doc.fileName;
      let entry = `${doc.docType}/${name}`;
      for (let n = 2; used.has(entry); n += 1) {
        const ext = path.extname(name);
        entry = `${doc.docType}/${path.basename(name, ext)} (${n})${ext}`;
      }
      used.add(entry);

      archive.file(absolute, { name: entry });
      lines.push(`${entry}`);
      lines.push(`        filed by ${who} on ${when} · ${doc.reviewStatus}`);
    }

    archive.append(lines.join("\n") + "\n", { name: "MANIFEST.txt" });

    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "DOCUMENT_BUNDLE_EXPORTED",
      details: `Downloaded the case file as a bundle (${documents.length} document(s))`,
    });

    await archive.finalize();
  })
);

// --- Approve a file's disposal (Secretariat only) -----------------------------
// Retention is the rule, this is the decision. A file is only eligible once its
// case has been closed for RETENTION_YEARS; even then nothing happens until the
// Secretariat approves it here, in so many words, with a reason. Approval does
// not delete the file: it records who approved and why, archives it, and writes
// the audit log. Anything further is done by a person, outside the system.
recordsRouter.post(
  "/:docId/disposal",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    if (req.body?.approve !== true) {
      return res.status(400).json({ error: "Disposal needs explicit approval (approve: true)." });
    }
    const note = String(req.body?.note ?? "").trim();
    if (!note) {
      return res.status(400).json({ error: "State the reason for the disposal." });
    }
    if (note.length > 1000) {
      return res.status(400).json({ error: "The reason can be at most 1,000 characters." });
    }

    const document = await prisma.document.findUnique({
      where: { id: req.params.docId },
      select: {
        id: true,
        caseId: true,
        fileName: true,
        docType: true,
        archivedAt: true,
        disposalApprovedAt: true,
        case: { select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true, status: true, updatedAt: true } },
      },
    });
    if (!document) return res.status(404).json({ error: "Document not found" });
    if (document.disposalApprovedAt) {
      return res.status(409).json({ error: "Disposal of this file has already been approved." });
    }

    const info = retentionInfo(document);
    if (!info.eligibleForDisposal) {
      return res.status(409).json({
        error: info.eligibleOn
          ? `This file cannot be disposed of before ${info.eligibleOn.toLocaleDateString("en-PH")}: files are kept for at least ${RETENTION_YEARS} years after the case closes.`
          : `This file cannot be disposed of while its case is open: files are kept for at least ${RETENTION_YEARS} years after the case closes.`,
      });
    }

    const now = new Date();
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        disposalApprovedAt: now,
        disposalApprovedById: req.user.sub,
        disposalNote: note,
        // Disposal approved means archived; an already-archived file keeps its own record.
        ...(document.archivedAt
          ? {}
          : {
              archivedAt: now,
              archivedById: req.user.sub,
              archiveReason: `Disposal approved after the ${RETENTION_YEARS}-year retention period`,
            }),
      },
      select: ROW_SELECT,
    });

    await logAction({
      userId: req.user.sub,
      caseId: document.caseId,
      action: "DOCUMENT_DISPOSAL_APPROVED",
      details: `Approved disposal of "${document.fileName}" (${document.docType}) after the ${RETENTION_YEARS}-year retention period (eligible from ${info.eligibleOn.toLocaleDateString("en-PH")}). Reason: ${note}`,
    });

    res.json({ ...updated, retention: retentionInfo(updated) });
  })
);
