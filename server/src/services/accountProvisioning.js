import crypto from "node:crypto";

// Characters that are easy to tell apart when read off a screen or paper —
// excludes 0/O and 1/l/I, which is the whole point of generating something a
// human has to transcribe correctly.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// Accounts come from the BulSU directory now (see services/directory), so
// nothing here mints identities — only the temporary password the Secretariat
// can issue to a party who cannot sign in.
export function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return password;
}
