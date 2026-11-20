import bcrypt from "bcryptjs";
import { prisma } from "../../prismaClient.js";
import * as mock from "./mockDirectory.js";
import * as bulsu from "./bulsuDirectory.js";

// The university's account directory, behind one façade. Everything else in
// the app imports from here and never from a provider directly, so pointing
// CODI-IS at the real BulSU accounts API is a change of provider, not a
// change of code (see ./bulsuDirectory.js).

const PROVIDERS = { mock, bulsu };
const provider = PROVIDERS[process.env.DIRECTORY_PROVIDER] ?? mock;

// Local password for directory accounts while sign-in is still handled here.
// Retires with the rest of the local auth once BulSU authenticates people.
const DEFAULT_PASSWORD = process.env.DIRECTORY_DEFAULT_PASSWORD || "Passw0rd!";

export function searchPeople(options) {
  return provider.searchPeople(options);
}

export function getPersonById(directoryId) {
  return provider.getPersonById(directoryId);
}

export function listAllPeople() {
  return provider.listAllPeople();
}

// The one place a directory record becomes a CODI-IS account. Matching on
// directoryId (not email or name) is what lets someone's email or college
// change upstream without splitting them into two accounts.
export async function ensureUserForPerson(person) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  return prisma.user.upsert({
    where: { directoryId: person.directoryId },
    update: {
      email: person.email,
      fullName: person.fullName,
      userType: person.type,
      department: person.college,
    },
    create: {
      directoryId: person.directoryId,
      email: person.email,
      fullName: person.fullName,
      userType: person.type,
      department: person.college,
      role: "PARTY",
      passwordHash,
    },
  });
}

// Resolves a directory id to the account that represents that person,
// creating it on first use. Used when a complainant names a respondent.
export async function resolveUserByDirectoryId(directoryId) {
  const person = getPersonById(directoryId);
  if (!person) return null;
  const existing = await prisma.user.findUnique({ where: { directoryId } });
  return existing ?? ensureUserForPerson(person);
}
