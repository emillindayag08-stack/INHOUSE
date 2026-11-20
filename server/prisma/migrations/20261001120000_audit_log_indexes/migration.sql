-- The audit trail becomes readable: the Chairperson and Secretariat browse it
-- newest-first and filter by actor, action, case and date. The table only ever
-- grows, so index the four columns that view sorts and filters on.
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_caseId_idx" ON "AuditLog"("caseId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
