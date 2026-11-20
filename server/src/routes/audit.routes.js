import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// The audit trail, read back. Every meaningful act in the system already
// writes a row here through logAction() (services/auditService.js); nothing
// until now could read them, so the trail existed only in the database.
//
// Oversight is the Chairperson's job and the Secretariat keeps the record, so
// those two roles and no others. A positive test against the pair, never
// "not a party" — see the note on isStaff in services/caseAccess.js.
export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("CHAIRPERSON", "SECRETARIAT"));

const PAGE_SIZE = 50;

// What a row needs to read as a sentence: who, on which case, what, when.
// The actor's role is their role now, not necessarily the one they held when
// they acted — the table records who, not what they were at the time.
const ROW_SELECT = {
  id: true,
  action: true,
  details: true,
  createdAt: true,
  actorHidden: true,
  user: { select: { id: true, fullName: true, role: true } },
  case: { select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true } },
};

// Deliberately NOT scoped with caseScopeFilter(). Both roles here are in
// CODI_STAFF, for whom it returns {} — but nesting the filter under `case`
// would silently drop every row with no case at all (account provisioning,
// password changes, report exports), which are exactly the system-wide events
// this page exists to surface. If this ever opens to another role, scope it as
// `OR: [{ caseId: null }, { case: caseScopeFilter(user) }]` rather than
// reaching for the nested form.
function buildWhere(query) {
  const and = [];

  const action = String(query.action || "").trim();
  if (action) and.push({ action });

  // An anonymous complainant's entries never answer to their name or account.
  const userId = String(query.userId || "").trim();
  if (userId) and.push({ userId, actorHidden: false });

  const caseId = String(query.caseId || "").trim();
  if (caseId) and.push({ caseId });

  // Manila day boundaries, matching parseReportFilters in reportService.js.
  // The two days are put in order BEFORE they become instants: swapping the
  // boundaries afterwards would pair the end of one day with the start of the
  // other and quietly exclude both.
  const day = (value) => {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  };
  let fromDay = day(query.from);
  let toDay = day(query.to);
  if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

  const range = {};
  if (fromDay) range.gte = new Date(`${fromDay}T00:00:00+08:00`);
  // `to` names a day, so it takes everything up to that day's last moment.
  if (toDay) range.lte = new Date(`${toDay}T23:59:59.999+08:00`);
  if (range.gte || range.lte) and.push({ createdAt: range });

  // One box searching what a reader actually scans for: a phrase from the
  // detail line, the name of whoever did it, or the case it was on. Actions
  // are matched with spaces turned into underscores, so typing "show cause"
  // finds SHOW_CAUSE_DRAFTED rather than nothing — nobody types the
  // SCREAMING_SNAKE form.
  const q = String(query.q || "").trim();
  if (q) {
    const asAction = q.replace(/\s+/g, "_");
    and.push({
      OR: [
        { details: { contains: q, mode: "insensitive" } },
        { action: { contains: asAction, mode: "insensitive" } },
        { user: { fullName: { contains: q, mode: "insensitive" } }, actorHidden: false },
        { case: { referenceNumber: { contains: q, mode: "insensitive" } } },
        { case: { caseNumber: { contains: q, mode: "insensitive" } } },
        { case: { cpiNumber: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const where = buildWhere(req.query);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    // One transaction so the count and the rows describe the same instant —
    // otherwise a write between the two queries makes the total disagree with
    // the page.
    const [total, items] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        select: ROW_SELECT,
        // Several routes write two rows in one request, so createdAt alone is
        // not a total order; without the id tiebreaker a row could appear on
        // two pages, or on neither.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    // An envelope rather than the bare array the other list endpoints return:
    // this table grows without bound, so the client cannot hold all of it and
    // needs the total to page through.
    res.json({
      items: items.map(({ actorHidden, ...row }) =>
        actorHidden ? { ...row, user: { id: null, fullName: "Anonymous complainant", role: "PARTY" } } : row
      ),
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    });
  })
);

// What the filter dropdowns should offer — drawn from what is actually on
// record, so they never list an action nobody has performed. Fetched once,
// rather than rebuilt on every keystroke in the search box.
auditRouter.get(
  "/filters",
  asyncHandler(async (req, res) => {
    const [actionRows, actorRows] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
      prisma.auditLog.groupBy({ by: ["userId"], where: { actorHidden: false }, _count: { _all: true } }),
    ]);

    // groupBy cannot reach through a relation, so the actors are looked up
    // separately and zipped back on.
    const actors = await prisma.user.findMany({
      where: { id: { in: actorRows.map((row) => row.userId) } },
      select: { id: true, fullName: true, role: true },
    });
    const countById = new Map(actorRows.map((row) => [row.userId, row._count._all]));

    res.json({
      actions: actionRows
        .map((row) => ({ action: row.action, count: row._count._all }))
        .sort((a, b) => a.action.localeCompare(b.action)),
      actors: actors
        .map((actor) => ({ ...actor, count: countById.get(actor.id) ?? 0 }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    });
  })
);

// --- Sign-in attempts --------------------------------------------------------
// Successful and failed, newest first. Same two roles as the rest of this
// router (requireRole above). Filters: result=success|failed, q (the email
// typed or the account holder's name), and a from/to day range.
auditRouter.get(
  "/logins",
  asyncHandler(async (req, res) => {
    const and = [];
    const result = String(req.query.result || "");
    if (result === "success") and.push({ success: true });
    if (result === "failed") and.push({ success: false });

    const q = String(req.query.q || "").trim();
    if (q) {
      and.push({
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { user: { fullName: { contains: q, mode: "insensitive" } } },
          { ipAddress: { contains: q } },
        ],
      });
    }

    const day = (value) => {
      const text = String(value || "").trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    };
    let fromDay = day(req.query.from);
    let toDay = day(req.query.to);
    if (fromDay && toDay && fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
    const range = {};
    if (fromDay) range.gte = new Date(`${fromDay}T00:00:00+08:00`);
    if (toDay) range.lte = new Date(`${toDay}T23:59:59.999+08:00`);
    if (range.gte || range.lte) and.push({ createdAt: range });

    const where = and.length ? { AND: and } : {};
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const [total, failedTotal, items] = await prisma.$transaction([
      prisma.loginAttempt.count({ where }),
      prisma.loginAttempt.count({ where: { AND: [...and, { success: false }] } }),
      prisma.loginAttempt.findMany({
        where,
        select: {
          id: true,
          email: true,
          success: true,
          reason: true,
          ipAddress: true,
          userAgent: true,
          privacyAck: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    res.json({
      items,
      total,
      failedTotal,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    });
  })
);
