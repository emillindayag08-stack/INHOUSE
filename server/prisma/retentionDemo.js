import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Demo data for the records-retention rule: a handful of old cases, each with
// real (one-page) PDFs, at different distances from the 5-year mark.
//
//   node prisma/retentionDemo.js           add them (once)
//   node prisma/retentionDemo.js --remove  delete them and their files again
//
// Cases carry isDemo, so --remove (and `demoCases.js --remove`) find exactly
// these rows. No account is created or deleted.

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const REF_PREFIX = "REF-DEMO-RET-";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const YEAR = 365.25;

// `closedDaysAgo` is how long ago the case last changed (i.e. closed).
const CASES = [
  {
    tag: "01",
    status: "RESOLVED",
    closedDaysAgo: 6.5 * YEAR,
    note: "Closed 6½ years ago — eligible for disposal",
    docs: [
      ["COMPLAINT", "Notarized complaint.pdf"],
      ["SHOW_CAUSE_ANSWER", "Response to show-cause order.pdf"],
      ["RECOMMENDATION", "Recommendation.pdf"],
    ],
  },
  {
    tag: "02",
    status: "DISMISSED",
    closedDaysAgo: 5 * YEAR + 12,
    note: "Closed just over 5 years ago — newly eligible",
    docs: [
      ["COMPLAINT", "Notarized complaint.pdf"],
      ["OTHER", "Dismissal memo.pdf"],
    ],
  },
  {
    tag: "03",
    status: "DISMISSED",
    closedDaysAgo: 4 * YEAR + 60,
    note: "Closed about 4 years 2 months ago — not yet eligible",
    docs: [
      ["COMPLAINT", "Notarized complaint.pdf"],
      ["OTHER", "Dismissal memo.pdf"],
    ],
  },
  {
    tag: "04",
    status: "RESOLVED",
    closedDaysAgo: 7 * YEAR,
    note: "Closed 7 years ago — one file already approved for disposal, one still waiting",
    docs: [
      ["COMPLAINT", "Notarized complaint.pdf", { disposed: true }],
      ["RECOMMENDATION", "Recommendation.pdf"],
    ],
  },
  {
    tag: "05",
    status: "VERIFIED",
    closedDaysAgo: 8 * YEAR,
    note: "Open case last touched 8 years ago — never eligible while open",
    docs: [["COMPLAINT", "Notarized complaint.pdf"]],
  },
];

async function makePdf(title, lines) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 56, y: 770, size: 16, font });
  lines.forEach((line, i) => page.drawText(line, { x: 56, y: 740 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save());
}

async function add() {
  const existing = await prisma.case.count({ where: { referenceNumber: { startsWith: REF_PREFIX } } });
  if (existing > 0) {
    console.log(`Retention demo cases are already there (${existing}). Run with --remove first to recreate them.`);
    return;
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const users = await prisma.user.findMany();
  const pick = (email) => users.find((u) => u.email === email);
  const complainant = pick("francinedeguiagiron@gmail.com");
  const respondent = pick("giron.francine.bsis@gmail.com");
  const secretariat = users.find((u) => u.role === "SECRETARIAT");
  if (!complainant || !respondent || !secretariat) {
    throw new Error("The seeded accounts are missing — run `npm run seed` first.");
  }

  for (const spec of CASES) {
    const closedAt = daysAgo(spec.closedDaysAgo);
    const filedAt = new Date(closedAt.getTime() - 120 * DAY);
    const year = filedAt.getFullYear();
    const referenceNumber = `${REF_PREFIX}${spec.tag}`;
    const closed = spec.status !== "VERIFIED";

    const theCase = await prisma.case.create({
      data: {
        referenceNumber,
        caseNumber: closed ? `CODI-${year}-90${spec.tag}` : null,
        // The one open case is verified, so it carries a CPI number.
        cpiNumber: closed ? null : `CPI-${year}-90${spec.tag}`,
        complainantId: complainant.id,
        respondentId: respondent.id,
        claimedRespondentName: "Anne Giron",
        claimedRespondentType: "STUDENT",
        claimedRespondentCollege: "College of Engineering (COE)",
        respondentTypeAtFiling: "STUDENT",
        respondentCollegeAtFiling: "College of Engineering (COE)",
        respondentConfirmedAt: filedAt,
        respondentConfirmedById: secretariat.id,
        respondentAssignedAt: filedAt,
        description: `Demo case for the retention rule. ${spec.note}.`,
        governingFramework: "GBSH_CODE",
        status: spec.status,
        filedAt,
        isDemo: true,
        respondents: {
          create: [
            {
              position: 0,
              userId: respondent.id,
              claimedName: "Anne Giron",
              claimedType: "STUDENT",
              claimedCollege: "College of Engineering (COE)",
              typeAtFiling: "STUDENT",
              collegeAtFiling: "College of Engineering (COE)",
              confirmedAt: filedAt,
              confirmedById: secretariat.id,
              assignedAt: filedAt,
            },
          ],
        },
      },
    });
    // updatedAt is what stands in for the close date; Prisma stamps it on every
    // write, so it is set last, directly.
    await prisma.$executeRaw`UPDATE "Case" SET "updatedAt" = ${closedAt} WHERE id = ${theCase.id}`;

    for (const [docType, fileName, flags = {}] of spec.docs) {
      const stored = `${crypto.randomUUID()}.pdf`;
      const bytes = await makePdf(`${fileName.replace(/\\.pdf$/, "")} (demo)`, [
        `Case ${referenceNumber}`,
        spec.note,
        "",
        "Dummy file created by prisma/retentionDemo.js to show the retention rule.",
      ]);
      fs.writeFileSync(path.join(UPLOADS_DIR, stored), bytes);

      const uploadedAt = new Date(filedAt.getTime() + 2 * DAY);
      const disposedAt = new Date(Date.now() - 20 * DAY);
      await prisma.document.create({
        data: {
          caseId: theCase.id,
          uploadedById: docType === "COMPLAINT" ? complainant.id : docType === "SHOW_CAUSE_ANSWER" ? respondent.id : secretariat.id,
          fileName,
          filePath: stored,
          mimeType: "application/pdf",
          fileSize: bytes.length,
          pageCount: 1,
          docType,
          reviewStatus: "APPROVED",
          uploadedAt,
          ...(flags.disposed
            ? {
                archivedAt: disposedAt,
                archivedById: secretariat.id,
                archiveReason: "Disposal approved after the 5-year retention period",
                disposalApprovedAt: disposedAt,
                disposalApprovedById: secretariat.id,
                disposalNote: "Retention period over; no pending proceedings (demo).",
              }
            : {}),
        },
      });
      if (flags.disposed) {
        await prisma.auditLog.create({
          data: {
            userId: secretariat.id,
            caseId: theCase.id,
            action: "DOCUMENT_DISPOSAL_APPROVED",
            details: `Approved disposal of "${fileName}" (${docType}) after the 5-year retention period. Reason: Retention period over; no pending proceedings (demo).`,
            createdAt: disposedAt,
          },
        });
      }
    }
    console.log(`  ${referenceNumber}  ${spec.status.padEnd(9)} ${spec.note}`);
  }
  console.log("\nOpen Records as the Secretariat and try the “Eligible for disposal” and “Disposal approved” filters.");
}

async function remove() {
  const cases = await prisma.case.findMany({
    where: { referenceNumber: { startsWith: REF_PREFIX } },
    select: { id: true },
  });
  const caseIds = cases.map((c) => c.id);
  const inCases = { caseId: { in: caseIds } };
  const files = (await prisma.document.findMany({ where: inCases, select: { filePath: true } }))
    .map((d) => d.filePath)
    .filter(Boolean);

  await prisma.$transaction([
    prisma.document.deleteMany({ where: inCases }),
    prisma.auditLog.deleteMany({ where: inCases }),
    prisma.notification.deleteMany({ where: inCases }),
    prisma.caseRespondent.deleteMany({ where: inCases }),
    prisma.case.deleteMany({ where: { id: { in: caseIds } } }),
  ]);
  let removed = 0;
  for (const f of files) {
    const p = path.join(UPLOADS_DIR, f);
    if (p.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed += 1;
    }
  }
  console.log(`Removed ${caseIds.length} retention demo cases and ${removed} files. Accounts were left alone.`);
}

(process.argv.includes("--remove") ? remove() : add())
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
