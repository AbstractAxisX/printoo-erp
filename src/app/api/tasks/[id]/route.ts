import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  isTaskStatus,
  isTaskPriority,
  isTaskModule,
  resolveAssignee,
  TASK_INCLUDE,
} from "@/lib/task-validation";

// PUT   /api/tasks/[id] — partial update of a task.
// DELETE /api/tasks/[id] — remove a task.
//
// Phase 4 fixes:
// - R9:  `assignedTo` is now handled on PUT (was silently dropped).
//         null/"" → unassign; userId → validated (exists + active).
// - R12: server-side enum validation for status / priority / module.
// - 404 with Persian message when the task id doesn't exist
//         (was a generic 500 — raw errors never reach the admin).
// - R26: requireUser() gate on both verbs.
//
// Contract preserved (§5.1): accepts
// { title?, description?, status?, priority?, module?, dueDate?, assignedTo? }
// ← Phase 4 ADDs assignedTo (previously dropped).

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await req.json();

    // 404 fence first — updating a deleted task must be explicit.
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "تسک یافت نشد" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (!body.title || !String(body.title).trim()) {
        return NextResponse.json({ error: "عنوان الزامی است" }, { status: 400 });
      }
      data.title = String(body.title).trim();
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description) : null;
    }

    // ── R12 enum fences ──
    if (body.status !== undefined) {
      if (!isTaskStatus(body.status)) {
        return NextResponse.json(
          { error: `وضعیت نامعتبر: ${body.status}` },
          { status: 400 }
        );
      }
      data.status = body.status;
    }
    if (body.priority !== undefined) {
      if (!isTaskPriority(body.priority)) {
        return NextResponse.json(
          { error: `اولویت نامعتبر: ${body.priority}` },
          { status: 400 }
        );
      }
      data.priority = body.priority;
    }
    if (body.module !== undefined) {
      if (!isTaskModule(body.module)) {
        return NextResponse.json(
          { error: `ماژول نامعتبر: ${body.module} — تسک در هیچ پنلی نمایش داده نمی‌شود` },
          { status: 400 }
        );
      }
      data.module = body.module;
    }

    if (body.dueDate !== undefined) {
      if (body.dueDate) {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "تاریخ سررسید نامعتبر است" },
            { status: 400 }
          );
        }
        data.dueDate = d;
      } else {
        data.dueDate = null;
      }
    }

    // ── R9: assignedTo handling (previously dropped entirely) ──
    if (body.assignedTo !== undefined) {
      try {
        data.assignedTo = await resolveAssignee(body.assignedTo);
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
    }

    // Empty patch — nothing to do, echo current state (idempotent no-op).
    if (Object.keys(data).length === 0) {
      const untouched = await db.task.findUnique({
        where: { id },
        include: TASK_INCLUDE,
      });
      return NextResponse.json({ task: untouched });
    }

    const task = await db.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "خطا در ویرایش تسک" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "تسک یافت نشد" }, { status: 404 });
    }
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "حذف ناموفق" }, { status: 500 });
  }
}
