import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction } from "../services/auditService.js";

// KODI's frequently asked questions. Everyone signed in reads the ones meant
// for their role; the Secretariat reads all of them and saves the whole list
// from the FAQs page.
export const faqRouter = Router();
faqRouter.use(requireAuth);

const ROLES = new Set(["PARTY", "SECRETARIAT", "CHAIRPERSON", "COMMITTEE", "DISCIPLINING_AUTHORITY"]);

const MAX_ENTRIES = 200;
const MAX_SECTION = 80;
const MAX_QUESTION = 300;
const MAX_ANSWER = 5000;

// The answer is stored one paragraph per line and sent as a list of them.
function toRow(entry) {
  return {
    id: entry.id,
    section: entry.section,
    question: entry.question,
    answer: entry.answer.split("\n"),
    roles: entry.roles,
  };
}

faqRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entries = await prisma.faqEntry.findMany({
      where: { OR: [{ roles: { isEmpty: true } }, { roles: { has: req.user.role } }] },
      orderBy: { position: "asc" },
    });
    res.json(entries.map(toRow));
  })
);

faqRouter.get(
  "/all",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const entries = await prisma.faqEntry.findMany({ orderBy: { position: "asc" } });
    res.json(entries.map(toRow));
  })
);

// Checks one entry from the editor and returns it ready to store, or an error
// naming the question so the Secretariat can find it.
function parseEntry(raw, index) {
  const section = String(raw?.section ?? "").trim();
  const question = String(raw?.question ?? "").trim();
  const lines = (Array.isArray(raw?.answer) ? raw.answer : String(raw?.answer ?? "").split("\n"))
    .map((line) => String(line).trim())
    .filter(Boolean);
  const roles = Array.isArray(raw?.roles) ? [...new Set(raw.roles)] : [];
  const name = question ? `“${question.slice(0, 60)}”` : `Question ${index + 1}`;

  if (!section) return { error: `${name} needs a section title.` };
  if (section.length > MAX_SECTION) return { error: `The section title “${section.slice(0, 40)}…” is too long.` };
  if (!question) return { error: `Question ${index + 1} is empty.` };
  if (question.length > MAX_QUESTION) return { error: `${name} is too long.` };
  if (lines.length === 0) return { error: `${name} needs an answer.` };
  const answer = lines.join("\n");
  if (answer.length > MAX_ANSWER) return { error: `The answer to ${name} is too long.` };
  if (roles.some((r) => !ROLES.has(r))) return { error: `${name} names a role that does not exist.` };

  return { entry: { section, question, answer, roles, position: index + 1 } };
}

faqRouter.put(
  "/",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const raw = req.body?.entries;
    if (!Array.isArray(raw)) return res.status(400).json({ error: "Send the questions as a list." });
    if (raw.length > MAX_ENTRIES) return res.status(400).json({ error: `Keep it to ${MAX_ENTRIES} questions or fewer.` });

    const entries = [];
    for (const [i, item] of raw.entries()) {
      const { entry, error } = parseEntry(item, i);
      if (error) return res.status(400).json({ error });
      entries.push(entry);
    }

    await prisma.$transaction([prisma.faqEntry.deleteMany({}), prisma.faqEntry.createMany({ data: entries })]);
    await logAction({
      userId: req.user.sub,
      action: "FAQ_UPDATED",
      details: `Saved the FAQs: ${entries.length} question${entries.length === 1 ? "" : "s"}`,
    });

    const saved = await prisma.faqEntry.findMany({ orderBy: { position: "asc" } });
    res.json(saved.map(toRow));
  })
);
