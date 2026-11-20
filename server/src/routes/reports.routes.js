import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction } from "../services/auditService.js";
import { sweepOverdueDeadlines } from "../services/deadlineService.js";
import { buildReport, describeFilters, parseReportFilters, reportCasesCsv } from "../services/reportService.js";

// Caseload reports for CODI staff. Parties never see aggregate figures.
// Every report is built from the same filters (see parseReportFilters), and
// every export — CSV or printed/PDF — is written to the audit log.
export const reportsRouter = Router();
reportsRouter.use(
  requireAuth,
  requireRole("SECRETARIAT", "CHAIRPERSON", "COMMITTEE", "DISCIPLINING_AUTHORITY")
);

// Per-member participation figures are for oversight, so Committee members
// don't see how their colleagues are doing.
const PARTICIPATION_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON"]);

reportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await sweepOverdueDeadlines();
    const filters = parseReportFilters(req.query);
    res.json(await buildReport(filters, { includeParticipation: PARTICIPATION_ROLES.has(req.user.role) }));
  })
);

reportsRouter.get(
  "/export.csv",
  asyncHandler(async (req, res) => {
    await sweepOverdueDeadlines();
    const filters = parseReportFilters(req.query);
    const report = await buildReport(filters);
    await logAction({
      userId: req.user.sub,
      action: "REPORT_EXPORTED",
      details: `Exported the case list as CSV (${report.cases.length} cases) — ${describeFilters(filters)}`,
    });
    const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="CODI-Case-Report-${stamp}.csv"`);
    res.send(reportCasesCsv(report));
  })
);

// The printable report is rendered by the client, so it tells the server when
// it's printed or saved as PDF.
reportsRouter.post(
  "/export-log",
  asyncHandler(async (req, res) => {
    const filters = parseReportFilters(req.body || {});
    await logAction({
      userId: req.user.sub,
      action: "REPORT_EXPORTED",
      details: `Printed / saved the report as PDF — ${describeFilters(filters)}`,
    });
    res.status(201).json({ ok: true });
  })
);
