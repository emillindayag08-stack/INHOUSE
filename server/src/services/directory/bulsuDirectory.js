// The real BulSU accounts API. Not wired up yet: the university's endpoint,
// credentials and record shape aren't available to this project, so the mock
// provider stands in (see ./mockDirectory.js) and this file documents exactly
// what has to be filled in.
//
// Each function must return the same DirectoryPerson shape the mock returns:
//   { directoryId, idNumber, fullName, type: "STUDENT"|"PERSONNEL",
//     college, email, program, position }
//
// When this provider goes live:
//   - set DIRECTORY_PROVIDER=bulsu and BULSU_DIRECTORY_URL / credentials in .env
//   - listAllPeople() is no longer used: accounts are provisioned just in time
//     through ensureUserForPerson() in ./index.js, on first sign-in or the
//     first time someone is named as a respondent
//   - sign-in delegates to BulSU, after which User.passwordHash and the unused
//     User.tempPassword column both retire. CODI no longer issues credentials:
//     the reset route and its card were removed, and everyone signs in with the
//     account the directory gave them.

function notConfigured(fn) {
  throw new Error(
    `The BulSU directory provider is not configured (${fn}). Set DIRECTORY_PROVIDER=mock, or implement bulsuDirectory.js against the university API.`
  );
}

export function listAllPeople() {
  // The real directory is far too large to enumerate; seeding from it is not
  // how accounts are meant to appear once this provider is live.
  return notConfigured("listAllPeople");
}

export function getPersonById() {
  return notConfigured("getPersonById");
}

export function searchPeople() {
  return notConfigured("searchPeople");
}
