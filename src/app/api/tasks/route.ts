import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, hasModule } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import {
  isTaskStatus,
  isTaskPriority,
  isTaskModule,
  resolveAssignee,
  TASK_INCLUDE,
} from "@/lib/task-validation";

// ─── Tasks API — Phase 12 rebuild ─────────────────────────────────
//
// GET  /api/tasks            → list (filters: ?module=&status=&assignedTo=&orderId=)
//                              Phase 12: برای غیرمدیرها:
//                                • ?module=X → باید ماژول X را داشته باشد (403)
//                                • تسک‌های آن ماژول فقط «خودش یا بی‌مسئول»
//                                  (تسکِ تخصیص‌یافته به طراح دیگر در پنل او نمی‌آید)
//                                • بدون module → فقط ماژول‌های خودش + همان قاعده
// POST /api/tasks            → create (validated) — Phase 12: عملیات مدیریتی
//
// Fixes landing here:
// - R12: server-side enum validation — a typoed `module` ORPHANS a task
//   (invisible to every panel). Same fence for status/priority.
// - R9:  assignedTo is validated against real, ACTIVE users (FK wired in
//   schema this phase) and echoed back as `assignedUser` object.
// - R26: requireUser() gate on both verbs.
// - Phase 12: assignedTo باید ماژولِ تسک را هم داشته باشد + completedAt
//   (مهر «کی انجام شد» — آمار روزانهٔ کارمند).

// ─── GET ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(req.url);
    const mod = searchParams.get("module");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");
    const orderId = searchParams.get("orderId");

    // Reject invalid enum filters with a clear message instead of
    // silently returning an empty list (which looks like "no data" —
    // the exact confusion this phase exists to eliminate).
    if (mod !== null && !isTaskModule(mod)) {
      return NextResponse.json(
        { error: `ماژول نامعتبر: ${mod}` },
        { status: 400 }
      );
    }
    if (status !== null && !isTaskStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }

    // ─── Phase 12: module access + self-assignment scoping ──
    const manager = isManager(user);
    const where: Record<string, unknown> = {};
    if (mod) {
      if (!manager && !hasModule(user, mod)) {
        return NextResponse.json(
          { error: "شما به تسک‌های این ماژول دسترسی ندارید" },
          { status: 403 }
        );
      }
      where.module = mod;
    } else if (!manager) {
      // بدون module: فقط ماژول‌های خودش
      const mods = user.modules.filter((m) => isTaskModule(m));
      where.module = { in: mods.length ? mods : ["__none__"] };
    }
    if (!manager) {
      // «هر کسی چه تسکی دستش است»: تسکِ دیگری را نمی‌بیند
      where.OR = [{ assignedTo: null }, { assignedTo: user.id }];
    }

    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (orderId) where.orderId = orderId;

    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ tasks });
  } catch (e) {
    return jsonError(e, "خطا در دریافت تسک‌ها");
  }
}

// ─── POST ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  // Phase 12: ایجاد تسک = عملیات مدیریتی (boards مدیریت)
  if (!isManager(user)) {
    return NextResponse.json(
      { error: "ایجاد تسک مخصوص مدیریت است" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      title,
      description,
      priority,
      status,
      dueDate,
      module,
      orderId,
      customerId,
      assignedTo,
    } = body ?? {};

    // title — required, trimmed, non-empty
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "عنوان الزامی است" },
        { status: 400 }
      );
    }

    // R12 enum fences — Persian messages, no raw errors to the admin.
    if (priority !== undefined && priority !== null && !isTaskPriority(priority)) {
      return NextResponse.json(
        { error: `اولویت نامعتبر: ${priority}` },
        { status: 400 }
      );
    }
    if (status !== undefined && status !== null && !isTaskStatus(status)) {
      return NextResponse.json(
        { error: `وضعیت نامعتبر: ${status}` },
        { status: 400 }
      );
    }
    if (module !== undefined && module !== null && !isTaskModule(module)) {
      return NextResponse.json(
        { error: `ماژول نامعتبر: ${module} — تسک در هیچ پنلی نمایش داده نمی‌شود` },
        { status: 400 }
      );
    }

    // orderId / customerId — when present must reference real rows,
    // otherwise the task silently disappears from order/customer views.
    if (orderId) {
      const order = await db.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return NextResponse.json(
          { error: "سفارش مرتبط یافت نشد" },
          { status: 400 }
        );
      }
    }
    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        return NextResponse.json(
          { error: "مشتری مرتبط یافت نشد" },
          { status: 400 }
        );
      }
    }

    // assignedTo — R9 + Phase 12: وجود + فعال + «داشتن ماژول تسک»
    let assigneeId: string | null = null;
    try {
      const effectiveModule =
        isTaskModule(module) ? module : "admin";
      assigneeId = await resolveAssignee(assignedTo, effectiveModule);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    let dueDateValue: Date | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "تاریخ سررسید نامعتبر است" },
          { status: 400 }
        );
      }
      dueDateValue = d;
    }

    const finalStatus = isTaskStatus(status) ? status : "todo";
    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description ? String(description) : null,
        priority: isTaskPriority(priority) ? priority : "normal",
        status: finalStatus,
        module: isTaskModule(module) ? module : "admin",
        dueDate: dueDateValue,
        orderId: orderId || null,
        customerId: customerId || null,
        assignedTo: assigneeId,
        // Phase 12: مهر «کی انجام شد» — تسکِ از ابتده done
        completedAt: finalStatus === "done" ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });

    // اعلان هدفمند به مسئولِ جدید
    if (assigneeId) {
      try {
        await db.notification.create({
          data: {
            userId: assigneeId,
            title: "تسک جدید به شما واگذار شد",
            message: `«${task.title}» به شما ارجاع شد.`,
            type: "info",
            link: `${task.module}:tasks`,
          },
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد تسک");
  }
}
