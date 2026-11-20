import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { casesRouter } from "./routes/cases.routes.js";
import { documentsRouter } from "./routes/documents.routes.js";
import { schedulingRouter } from "./routes/scheduling.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { recordsRouter } from "./routes/records.routes.js";
import { directoryRouter } from "./routes/directory.routes.js";
import { faqRouter } from "./routes/faq.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "*" }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/cases/:caseId/documents", documentsRouter);
  app.use("/api/cases/:caseId/scheduling", schedulingRouter);
  app.use("/api/cases", casesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/records", recordsRouter);
  app.use("/api/directory", directoryRouter);
  app.use("/api/faq", faqRouter);

  app.use(errorHandler);
  return app;
}
