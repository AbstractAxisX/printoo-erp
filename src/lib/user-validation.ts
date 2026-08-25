// Printoo24 ERP — User/Role validation helpers
//
// Single source of truth for USER_ROLE enum validation, shared by
// /api/users (POST) and /api/users/[id] (PUT). A typoed role silently
// breaks the user's module access (their sidebar renders nothing) —
// this fence refuses it at the source, mirroring task-validation.ts.
//
// Values MUST mirror USER_ROLE in lib/constants.ts.

const USER_ROLES = [
  "master",
  "admin",
  "designer",
  "print",
  "warehouse",
  "finance",
  "qc",
  "crm",
  "srm",
] as const;

export function isUserRole(v: unknown): v is (typeof USER_ROLES)[number] {
  return typeof v === "string" && (USER_ROLES as readonly string[]).includes(v);
}
