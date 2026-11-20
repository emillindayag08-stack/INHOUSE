// A stand-in for the BulSU accounts API: every BulSU college with at least
// two students and two personnel, all fictional. Everything here is data the real directory would return, so
// swapping in bulsuDirectory.js changes where the records come from and
// nothing about how the rest of the system uses them.
//
// College names match BULSU_COLLEGES in client/src/lib/constants.js, so the
// Reports page's college filter keeps working.

const PEOPLE = [
  {
    directoryId: "2022-10431",
    fullName: "Francine Giron",
    type: "STUDENT",
    college: "College of Information and Communications Technology (CICT)",
    email: "francinedeguiagiron@gmail.com",
    program: "BS Information Technology",
  },
  {
    directoryId: "2021-02310",
    fullName: "Anne Giron",
    type: "STUDENT",
    college: "College of Engineering (COE)",
    email: "giron.francine.bsis@gmail.com",
    program: "BS Civil Engineering",
  },
  {
    directoryId: "EMP-1042",
    fullName: "Iya Reyes",
    type: "PERSONNEL",
    college: "College of Business Education and Accountancy (CBEA)",
    email: "iyaaa.xyz143@gmail.com",
    position: "Instructor II",
  },
  {
    directoryId: "EMP-1188",
    fullName: "Bregil Dolorain",
    type: "PERSONNEL",
    college: "College of Arts and Letters (CAL)",
    email: "bregildolorain14@gmail.com",
    position: "Administrative Aide",
  },
];

// The shape every provider returns. `idNumber` is the same value as
// directoryId, named for what a person reads on screen.
function toPerson(row) {
  return {
    directoryId: row.directoryId,
    idNumber: row.directoryId,
    fullName: row.fullName,
    type: row.type,
    college: row.college,
    email: row.email,
    program: row.program ?? null,
    position: row.position ?? null,
  };
}

export function listAllPeople() {
  return PEOPLE.map(toPerson);
}

export function getPersonById(directoryId) {
  const row = PEOPLE.find((p) => p.directoryId === directoryId);
  return row ? toPerson(row) : null;
}

export function searchPeople({ q = "", type = null, limit = 10, excludeDirectoryIds = [] } = {}) {
  const needle = q.trim().toLowerCase();
  // Deliberately no "list everyone" search: the real directory is thousands of
  // people, and a picker that dumps them all wouldn't survive the swap.
  if (needle.length < 2) return [];
  const excluded = new Set(excludeDirectoryIds);
  return PEOPLE.filter((p) => {
    if (excluded.has(p.directoryId)) return false;
    if (type && p.type !== type) return false;
    return (
      p.fullName.toLowerCase().includes(needle) ||
      p.directoryId.toLowerCase().includes(needle) ||
      p.email.toLowerCase().includes(needle)
    );
  })
    .slice(0, limit)
    .map(toPerson);
}
