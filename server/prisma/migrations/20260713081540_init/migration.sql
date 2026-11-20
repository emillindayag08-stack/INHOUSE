-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('COMPLAINANT', 'RESPONDENT', 'SECRETARIAT', 'CHAIRPERSON', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "RespondentType" AS ENUM ('STUDENT', 'PERSONNEL');

-- CreateEnum
CREATE TYPE "GoverningFramework" AS ENUM ('GBSH_CODE', 'RACCS');

-- CreateEnum
CREATE TYPE "OffenseClassification" AS ENUM ('LIGHT', 'LESS_GRAVE', 'GRAVE');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('SUBMITTED', 'RETURNED_FOR_CORRECTION', 'VERIFIED', 'SHOW_CAUSE_ISSUED', 'ANSWER_SUBMITTED', 'UNDER_EVALUATION', 'PRIMA_FACIE_FOUND', 'PRIMA_FACIE_NOT_FOUND', 'FORMAL_CHARGE_ISSUED', 'HEARING_SCHEDULED', 'DELIBERATION', 'DECIDED', 'DISMISSED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('PENDING', 'MET', 'OVERDUE');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('DISMISSED', 'PENALIZED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMPLAINT', 'EVIDENCE', 'RESPONDENT_ANSWER', 'DELIBERATION_NOTES', 'DECISION', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Respondent" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "respondentType" "RespondentType" NOT NULL,
    "department" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Respondent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "complainantId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isPeerToPeer" BOOLEAN NOT NULL DEFAULT false,
    "isFirstOffense" BOOLEAN NOT NULL DEFAULT true,
    "governingFramework" "GoverningFramework" NOT NULL,
    "offenseClassification" "OffenseClassification",
    "status" "CaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowCauseOrder" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseDeadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowCauseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespondentAnswer" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespondentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimaFacieEvaluation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evaluatedById" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "rationale" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrimaFacieEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormalCharge" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "chargeDetails" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'In-person',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliberation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliberation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "penalty" TEXT,
    "rationale" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "DeadlineStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Respondent_userId_key" ON "Respondent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNumber_key" ON "Case"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_caseId_key" ON "Decision"("caseId");

-- AddForeignKey
ALTER TABLE "Respondent" ADD CONSTRAINT "Respondent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_complainantId_fkey" FOREIGN KEY ("complainantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "Respondent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowCauseOrder" ADD CONSTRAINT "ShowCauseOrder_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowCauseOrder" ADD CONSTRAINT "ShowCauseOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespondentAnswer" ADD CONSTRAINT "RespondentAnswer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimaFacieEvaluation" ADD CONSTRAINT "PrimaFacieEvaluation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrimaFacieEvaluation" ADD CONSTRAINT "PrimaFacieEvaluation_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalCharge" ADD CONSTRAINT "FormalCharge_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormalCharge" ADD CONSTRAINT "FormalCharge_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliberation" ADD CONSTRAINT "Deliberation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliberation" ADD CONSTRAINT "Deliberation_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
