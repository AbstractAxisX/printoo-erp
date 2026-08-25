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

// ─── Tasks API — Phase 4 rebuild ──────────────────────────────────
//
// GET  /api/tasks            → list (filters: ?module=&status=&assignedTo=&orderId=)
// POST /api/tasks            → create (validated)
//
// Fixes landing here:
// - R12: server-side enum validation — a typoed `module` ORPHANS a task
//   (invisible to every panel). Same fence for status/priority.
// - R9:  assignedTo is validated against real, ACTIVE users (FK wired in
//   schema this phase) and echoed back as `assignedUser` object.
// - R26: requireUser() gate on both verbs.
//
// Contract preserved (§5.1): POST body shape unchanged —
// { title, description?, priority?, dueDate?, module?, orderId?, customerId?, assignedTo? }
// Response ADDS task.assignedUser (additive, no breaking change).
//
// The `module` query-param filter is load-bearing: designer-tasks and
// print-tasks panels depend on it (cross-panel routing).

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

    const where: Record<string, unknown> = {};
    if (mod) where.module = mod;
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (orderId) where.orderId = orderId;

    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json(
      { error: "خطا در دریافت تسک‌ها" },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

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

    // assignedTo — R9: validate the user exists AND is active.
    let assigneeId: string | null = null;
    try {
      assigneeId = await resolveAssignee(assignedTo);
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

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description ? String(description) : null,
        priority: isTaskPriority(priority) ? priority : "normal",
        status: isTaskStatus(status) ? status : "todo",
        module: isTaskModule(module) ? module : "admin",
        dueDate: dueDateValue,
        orderId: orderId || null,
        customerId: customerId || null,
        assignedTo: assigneeId,
      },
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "خطا در ایجاد تسک" },
      { status: 500 }
    );
  }
}
