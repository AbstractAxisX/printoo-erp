import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, hasModule } from "@/lib/access";
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
// - 404 with Persian message when the task id doesn't exist.
// - R26: requireUser() gate on both verbs.
//
// Phase 12:
// - Permission: مدیر همیشه؛ کاربرِ ماژولِ تسک فقط روی تسکِ خودش یا
//   بی‌مسئول (تسکِ دیگری → 403). پنل‌های طراح/چاپ وضعیت را همین‌جا
//   toggle می‌کنند — «هر کسی فقط کار خودش را جلو می‌برد».
// - completedAt: گذار به done → مهرِ الان؛ خروج از done → پاک.
// - assignedTo: مسئول جدید باید ماژولِ تسک را داشته باشد (مگر master).

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

    // ─── Phase 12: permission fence ──
    // مدیر: همه‌چیز. غیرمدیر: فقط اگر ماژولِ تسک را دارد و تسکِ خودش/بی‌مسئول است.
    if (!isManager(user)) {
      if (!hasModule(user, existing.module)) {
        return NextResponse.json(
          { error: "شما به تسک‌های این ماژول دسترسی ندارید" },
          { status: 403 }
        );
      }
      if (existing.assignedTo && existing.assignedTo !== user.id) {
        return NextResponse.json(
          { error: "این تسک به کارمند دیگری واگذار شده است" },
          { status: 403 }
        );
      }
      // غیرمدیر فقط وضعیت را می‌تواند جلو ببرد — نه انتساب/انتقال ماژول/حذف
      const forbidden = ["assignedTo", "module", "title", "description", "priority", "dueDate", "orderId", "customerId"];
      if (Object.keys(body ?? {}).some((k) => forbidden.includes(k))) {
        return NextResponse.json(
          { error: "شما فقط می‌توانید وضعیت تسک خود را تغییر دهید" },
          { status: 403 }
        );
      }
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

    // ── R12 enum fences + Phase 12 completedAt transition ──
    if (body.status !== undefined) {
      if (!isTaskStatus(body.status)) {
        return NextResponse.json(
          { error: `وضعیت نامعتبر: ${body.status}` },
          { status: 400 }
        );
      }
      data.status = body.status;
      // مهر «کی/کِی انجام شد» — آمار روزانهٔ کارمند
      if (body.status === "done" && existing.status !== "done") {
        data.completedAt = new Date();
      } else if (body.status !== "done" && existing.status === "done") {
        data.completedAt = null;
      }
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

    // ── R9 + Phase 12: assignedTo (فقط مدیر) — باید ماژولِ تسک را داشته باشد ──
    let notifiedAssignee: string | null = null;
    if (body.assignedTo !== undefined) {
      try {
        const targetModule = isTaskModule(body.module) ? body.module : existing.module;
        data.assignedTo = await resolveAssignee(body.assignedTo, targetModule);
        if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
          notifiedAssignee = data.assignedTo as string;
        }
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

    // اعلان هدفمند به مسئولِ جدید (فقط مدیر تغییرش داده)
    if (notifiedAssignee) {
      try {
        await db.notification.create({
          data: {
            userId: notifiedAssignee,
            title: "تسک به شما واگذار شد",
            message: `«${task.title}» به شما ارجاع شد.`,
            type: "info",
            link: `${task.module}:tasks`,
          },
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "خطا در ویرایش تسک" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  // Phase 12: حذف تسک = عملیات مدیریتی
  if (!isManager(user)) {
    return NextResponse.json(
      { error: "حذف تسک مخصوص مدیریت است" },
      { status: 403 }
    );
  }

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
