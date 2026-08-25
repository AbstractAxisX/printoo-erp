// Printoo24 ERP — Task validation helpers (Phase 4, R12)
//
// Single source of truth for task enum validation, shared by
// /api/tasks and /api/tasks/[id] route handlers.
//
// Why server-side at all? A typoed `module` value ORPHANS a task — it
// becomes invisible to every panel (module is the cross-panel routing
// field, see ARCHITECTURE-NOTES §5.2). This file is the fence.
//
// Values MUST mirror lib/constants.ts (TASK_STATUS / PRIORITY / MODULES).
// Do NOT change enum values — they are part of the API contract (§5.2).

import { db } from "@/lib/db";

const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
const TASK_PRIORITIES = ["normal", "urgent"] as const;
// Mirrors ModuleKey in lib/constants.ts.
const TASK_MODULES = [
  "admin",
  "designer",
  "print",
  "warehouse",
  "finance",
  "qc",
  "crm",
  "srm",
] as const;

export function isTaskStatus(v: unknown): v is (typeof TASK_STATUSES)[number] {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

export function isTaskPriority(v: unknown): v is (typeof TASK_PRIORITIES)[number] {
  return typeof v === "string" && (TASK_PRIORITIES as readonly string[]).includes(v);
}

export function isTaskModule(v: unknown): v is (typeof TASK_MODULES)[number] {
  return typeof v === "string" && (TASK_MODULES as readonly string[]).includes(v);
}

/**
 * Resolves an `assignedTo` payload value to a real ACTIVE user id, or null.
 * Throws a Persian Error (surfaced as 400 by callers) when the user does
 * not exist / is inactive — the roadmap edge case: ارجاع تسک به کاربر حذف‌شده
 * must FAIL loudly, never silently orphan the task.
 */
export async function resolveAssignee(v: unknown): Promise<string | null> {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") {
    throw new Error("مقدار مسئول انجام نامعتبر است");
  }
  const user = await db.user.findUnique({ where: { id: v } });
  if (!user) {
    throw new Error("کاربر مورد نظر یافت نشد (ممکن است حذف شده باشد)");
  }
  if (user.status !== "active") {
    throw new Error("این کاربر غیرفعال است و قابل ارجاع نیست");
  }
  return user.id;
}

/** Prisma include shared by every task-reading endpoint (additive shape). */
export const TASK_INCLUDE = {
  order: { include: { customer: true } },
  assignedUser: {
    select: { id: true, name: true, role: true, avatar: true },
  },
} as const;
