import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { sweepOverdueDeadlines } from "../services/deadlineService.js";
import { caseLabel } from "../utils/caseLabel.js";
import { caseScopeFilter } from "../services/caseAccess.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    await sweepOverdueDeadlines();

    // Staff see every case; a university member sees every case they are on,
    // on either side (see services/caseAccess.js).
    const scopeFilter = caseScopeFilter(req.user);

    const [total, byStatus, overdueDeadlines] = await Promise.all([
      prisma.case.count({ where: scopeFilter }),
      prisma.case.groupBy({ by: ["status"], where: scopeFilter, _count: true }),
      prisma.deadline.count({
        where: { status: "OVERDUE", case: scopeFilter },
      }),
    ]);

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
      overdueDeadlines,
    });
  })
);

// Analytics dashboard: case counts, full status breakdown, incident
// distribution per college, and the offense-level breakdown. CODI-staff only
// (Secretariat/Chairperson/Committee) — parties only ever see their own
// case(s), so aggregate figures across the whole caseload aren't meaningful
// (or appropriate) for them.
const CODI_STAFF_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

dashboardRouter.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    if (!CODI_STAFF_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: "This dashboard is only available to CODI staff" });
    }

    const [total, byStatus, respondentDepartments] = await Promise.all([
      prisma.case.count(),
      prisma.case.groupBy({ by: ["status"], _count: true }),
      // Department lives on Respondent, not Case, so Prisma's groupBy can't
      // aggregate it directly — pull it and tally in JS instead. The offense
      // level is tallied from the same rows.
      prisma.case.findMany({
        select: {
          respondentCollegeAtFiling: true,
          respondentUser: { select: { department: true } },
          offenseClassification: true,
          riskAssessments: {
            select: { classification: true, overrideClassification: true, evaluatedAt: true },
            orderBy: { evaluatedAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    // Same rule as the reports: the stored classification, else the newest
    // assessment, else not yet classified.
    const offenseCounts = { LIGHT: 0, LESS_GRAVE: 0, GRAVE: 0, UNCLASSIFIED: 0 };
    for (const row of respondentDepartments) {
      const [newest] = row.riskAssessments;
      const level =
        row.offenseClassification ||
        (newest && (newest.overrideClassification || newest.classification)) ||
        "UNCLASSIFIED";
      offenseCounts[level] = (offenseCounts[level] || 0) + 1;
    }

    const collegeCounts = {};
    for (const row of respondentDepartments) {
      const college =
        row.respondentCollegeAtFiling?.trim() || row.respondentUser?.department?.trim() || "Unspecified";
      collegeCounts[college] = (collegeCounts[college] || 0) + 1;
    }

    res.json({
      total,
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])),
      byCollege: Object.entries(collegeCounts)
        .map(([college, count]) => ({ college, count }))
        .sort((a, b) => b.count - a.count),
      byOffense: offenseCounts,
    });
  })
);

dashboardRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json(notifications);
  })
);

dashboardRouter.patch(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user.sub) {
      return res.status(404).json({ error: "Notification not found" });
    }
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    });
    res.json(updated);
  })
);

// Calendar events for the current user: compliance deadlines and scheduled
// hearings across the cases they can see (own cases for parties, all cases
// for CODI staff). Returned as one flat, date-sorted list.
dashboardRouter.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    await sweepOverdueDeadlines();

    // Staff see every case; a university member sees every case they are on,
    // on either side (see services/caseAccess.js).
    const scopeFilter = caseScopeFilter(req.user);

    const cases = await prisma.case.findMany({
      where: scopeFilter,
      select: {
        id: true,
        caseNumber: true,
        cpiNumber: true,
        referenceNumber: true,
        deadlines: true,
        hearings: true,
        schedulingRounds: {
          where: { status: "FINALIZED" },
          select: { id: true, finalizedSlot: { select: { startAt: true } } },
        },
      },
    });

    const events = [];
    for (const c of cases) {
      for (const d of c.deadlines) {
        events.push({
          id: `deadline-${d.id}`,
          type: "DEADLINE",
          date: d.dueAt,
          label: d.stage,
          status: d.status, // PENDING | MET | OVERDUE
          caseId: c.id,
          caseNumber: caseLabel(c),
        });
      }
      for (const h of c.hearings) {
        events.push({
          id: `hearing-${h.id}`,
          type: "HEARING",
          date: h.scheduledAt,
          label: h.mode ? `Hearing (${h.mode})` : "Hearing",
          status: "SCHEDULED",
          caseId: c.id,
          caseNumber: caseLabel(c),
        });
      }
      for (const r of c.schedulingRounds) {
        events.push({
          id: `meeting-${r.id}`,
          type: "MEETING",
          date: r.finalizedSlot.startAt,
          label: "Committee meeting",
          status: "SCHEDULED",
          caseId: c.id,
          caseNumber: caseLabel(c),
        });
      }
    }
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(events);
  })
);
