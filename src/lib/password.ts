// Printoo24 ERP — Password hashing (pure, no Next deps)
//
// Extracted from auth.ts so server scripts (seed, CLI) can hash/verify
// passwords WITHOUT pulling `next/headers` (which fails outside a Next
// runtime). auth.ts re-exports these for API consumers — API unchanged.
//
// - bcrypt for new hashes ($2* prefix)
// - legacy plaintext rows auto-detected and compared (migration happens
//   on next successful login inside auth.ensureSeedUser)

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith("$2")) {
    return bcrypt.compare(plain, hash);
  }
  // Legacy plaintext (pre-Phase-1.5). Comparing directly is acceptable here
  // because the caller (login) auto-migrates to bcrypt on success.
  return plain === hash;
}
