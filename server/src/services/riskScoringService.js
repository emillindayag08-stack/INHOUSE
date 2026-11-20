import { prisma } from "../prismaClient.js";
import { belongsToRow, syncCaseClassification } from "./respondentService.js";

// Least to most serious.
export const OFFENSE_LEVELS = ["LIGHT", "LESS_GRAVE", "GRAVE"];

// Every Committee member votes an offense level. Each member's most recent
// vote counts once; the panel's classification is the level with the most
// votes. A tie has no classification: the Committee settles it among
// themselves and the Secretariat records the final level as an override.
export function committeeClassification(assessments) {
  const latestByMember = new Map();
  for (const a of assessments) {
    const prev = latestByMember.get(a.evaluatedById);
    if (!prev || new Date(a.evaluatedAt) >= new Date(prev.evaluatedAt)) latestByMember.set(a.evaluatedById, a);
  }
  const latest = [...latestByMember.values()];
  if (latest.length === 0) return null;
  const counts = Object.fromEntries(OFFENSE_LEVELS.map((level) => [level, 0]));
  for (const a of latest) counts[a.classification] += 1;
  const most = Math.max(...Object.values(counts));
  const leaders = OFFENSE_LEVELS.filter((level) => counts[level] === most);
  const tied = leaders.length > 1;
  return { memberCount: latest.length, counts, tied, classification: tied ? null : leaders[0] };
}

// A respondent's offense level is the panel's majority over THEIR votes.
// Recomputed whenever anyone votes, changes their vote, or withdraws it.
async function recomputeRespondentClassification(tx, caseId, rowId) {
  const row = await tx.caseRespondent.findUnique({ where: { id: rowId } });
  if (!row) return;
  // Only sitting members' votes make up the panel's.
  const all = await tx.riskAssessment.findMany({ where: { caseId, evaluatedBy: { deactivatedAt: null } } });
  const rowAssessments = all.filter((a) => belongsToRow(a, row));
  const panel = committeeClassification(rowAssessments);
  let classification = panel?.classification ?? null;
  // A tie keeps whatever final level was last set for it, if any.
  if (panel?.tied) {
    const [lastOverride] = rowAssessments
      .filter((a) => a.overriddenAt)
      .sort((a, b) => new Date(b.overriddenAt) - new Date(a.overriddenAt));
    classification = lastOverride?.overrideClassification ?? null;
  }
  await tx.caseRespondent.update({
    where: { id: rowId },
    data: { offenseClassification: classification },
  });
  await syncCaseClassification(tx, caseId);
}

// A member who changes their vote to "no prima facie case" no longer votes on
// the offense level, so their votes from this stage are withdrawn and the
// case's classification is recomputed from whoever is still voting.
export async function withdrawRiskAssessments({ caseId, evaluatedById, respondentRowId }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.riskAssessment.deleteMany({ where: { caseId, evaluatedById, respondentRowId } });
    if (count === 0) return 0;
    await recomputeRespondentClassification(tx, caseId, respondentRowId);
    return count;
  });
}

export async function recordRiskAssessment({ caseId, evaluatedById, respondentRowId, classification }) {
  return prisma.$transaction(async (tx) => {
    const assessment = await tx.riskAssessment.create({
      data: { caseId, evaluatedById, respondentRowId, classification },
    });
    // The respondent carries the whole panel's classification, not just this
    // member's vote — and the case mirrors one respondent's.
    await recomputeRespondentClassification(tx, caseId, respondentRowId);
    return assessment;
  });
}

// The Committee/Chairperson's final decision, which may differ from the
// system-suggested classification above. The original suggestion is never
// overwritten — both are kept so the UI can show them side by side.
export async function recordOverride({ assessmentId, overriddenById, classification, justification }) {
  return prisma.$transaction(async (tx) => {
    const assessment = await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        overrideClassification: classification,
        overrideJustification: justification,
        overriddenById,
        overriddenAt: new Date(),
      },
    });
    if (assessment.respondentRowId) {
      await tx.caseRespondent.update({
        where: { id: assessment.respondentRowId },
        data: { offenseClassification: classification },
      });
    }
    await syncCaseClassification(tx, assessment.caseId);
    return assessment;
  });
}
