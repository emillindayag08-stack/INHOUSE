// A case is numbered in three stages, and every notification, log line and screen
// shows the latest it has reached:
//   REF-YYYY-NNNN   at filing
//   CPI-YYYY-NNNN   when the Secretariat verifies the complaint
//   CODI-YYYY-NNNN  when a prima facie case is found (the official docket number)
// Earlier numbers are kept, but the newest is the one people use. Anything that
// mentions a case's number goes through this so the rule lives in one place.
export function caseLabel(caseRecord) {
  return caseRecord.caseNumber ?? caseRecord.cpiNumber ?? caseRecord.referenceNumber;
}
