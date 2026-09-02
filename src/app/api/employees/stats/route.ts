import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isOnline } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── GET /api/employees/stats — «مدیریت کارمندان» (master) ──────────
//
// آمار ریز-به-ریز فعالیت هر کارمند — جایگزین حضور و غیاب:
//   • حضور: آنلاین؟ / آخرین بازدید / آخرین ورود / تعداد ورود
//   • طراحی: سفارش‌های واگذارشده، فعال، تاخیرِ فعال (موعد گذشته و هنوز
//     در طراحی)، تاخیرِ عملی (تکمیل بعد از موعد)، آیتم‌های تکمیل‌شده
//   • چاپ: همان ساختار
//   • تسک: کل/انجام‌شده/در حال انجام/تاخیری (سررسید گذشته و انجام‌نشده)
//   • QC: گزارش‌های ثبت‌شده / بررسی‌شده
//
// استراتژی: همهٔ داده‌های خام یک‌جا خوانده و در JS تجمیع می‌شوند —
// برای مقیاس SQLite این ERP (ده‌ها کارمند/صدها سفارش) کاملاً سریع است و
// از چند کوئری تجمیعی پیچیده/شکننده بهتر است.

export async function GET(_req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (user.role !== "master") {
    return NextResponse.json(
      { error: "مدیریت کارمندان مخصوص مدیر ارشد است" },
      { status: 403 }
    );
  }

  try {
    const now = Date.now();

    const [users, orders, tasks, qcReportedAgg, qcReviewedAgg] = await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          lastSeenAt: true,
          lastLoginAt: true,
          loginCount: true,
          modules: { select: { module: true } },
        },
        orderBy: { name: "asc" },
      }),
      db.order.findMany({
        select: {
          id: true,
          number: true,
          status: true,
          assignedDesignerId: true,
          assignedPrinterId: true,
          items: {
            select: {
              id: true,
              stage: true,
              designEndDate: true,
              printEndDate: true,
              designCompletedAt: true,
              designCompletedBy: true,
              printCompletedAt: true,
              printCompletedBy: true,
            },
          },
        },
      }),
      db.task.findMany({
        select: {
          id: true,
          assignedTo: true,
          status: true,
          dueDate: true,
        },
      }),
      db.qcReport.groupBy({
        by: ["reportedById"],
        where: { reportedById: { not: null } },
        _count: { _all: true },
      }),
      db.qcReport.groupBy({
        by: ["reviewedById"],
        where: { reviewedById: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const qcReported = new Map(
      qcReportedAgg.map((r) => [r.reportedById ?? "", r._count._all])
    );
    const qcReviewed = new Map(
      qcReviewedAgg.map((r) => [r.reviewedById ?? "", r._count._all])
    );

    const employees = users.map((u) => {
      const myOrders = orders.filter(
        (o) => o.assignedDesignerId === u.id || o.assignedPrinterId === u.id
      );

      // ── طراحی ──
      const designOrders = myOrders.filter((o) => o.assignedDesignerId === u.id);
      const designActive = designOrders.filter((o) => o.status === "pending_design");
      const designDelayedActive = designActive.filter((o) =>
        o.items.some(
          (it) =>
            it.stage === "design" &&
            it.designEndDate != null &&
            it.designEndDate.getTime() < now
        )
      );
      const designLateCompletions = orders.reduce(
        (sum, o) =>
          sum +
          o.items.filter(
            (it) =>
              it.designCompletedBy === u.id &&
              it.designEndDate != null &&
              it.designCompletedAt != null &&
              it.designCompletedAt.getTime() > it.designEndDate.getTime()
          ).length,
        0
      );
      const designItemsCompleted = orders.reduce(
        (sum, o) =>
          sum + o.items.filter((it) => it.designCompletedBy === u.id).length,
        0
      );

      // ── چاپ ──
      const printOrders = myOrders.filter((o) => o.assignedPrinterId === u.id);
      const printActive = printOrders.filter((o) => o.status === "in_printing");
      const printDelayedActive = printActive.filter((o) =>
        o.items.some(
          (it) =>
            it.stage === "print" &&
            it.printEndDate != null &&
            it.printEndDate.getTime() < now
        )
      );
      const printLateCompletions = orders.reduce(
        (sum, o) =>
          sum +
          o.items.filter(
            (it) =>
              it.printCompletedBy === u.id &&
              it.printEndDate != null &&
              it.printCompletedAt != null &&
              it.printCompletedAt.getTime() > it.printEndDate.getTime()
          ).length,
        0
      );
      const printItemsCompleted = orders.reduce(
        (sum, o) =>
          sum + o.items.filter((it) => it.printCompletedBy === u.id).length,
        0
      );

      // ── تسک‌ها ──
      const myTasks = tasks.filter((t) => t.assignedTo === u.id);
      const tasksDone = myTasks.filter((t) => t.status === "done").length;
      const tasksInProgress = myTasks.filter((t) => t.status === "in_progress").length;
      const tasksOverdue = myTasks.filter(
        (t) => t.status !== "done" && t.dueDate != null && t.dueDate.getTime() < now
      ).length;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        modules: u.role === "master" ? [] : u.modules.map((m) => m.module),
        createdAt: u.createdAt,
        // ── حضور و غیاب واقعی ──
        online: isOnline(u.lastSeenAt),
        lastSeenAt: u.lastSeenAt,
        lastLoginAt: u.lastLoginAt,
        loginCount: u.loginCount,
        // ── آمار عملکرد ──
        stats: {
          design: {
            assigned: designOrders.length,
            active: designActive.length,
            completed: designOrders.length - designActive.length,
            delayedActive: designDelayedActive.length,
            lateCompletions: designLateCompletions,
            itemsCompleted: designItemsCompleted,
          },
          print: {
            assigned: printOrders.length,
            active: printActive.length,
            completed: printOrders.length - printActive.length,
            delayedActive: printDelayedActive.length,
            lateCompletions: printLateCompletions,
            itemsCompleted: printItemsCompleted,
          },
          tasks: {
            assigned: myTasks.length,
            done: tasksDone,
            inProgress: tasksInProgress,
            overdue: tasksOverdue,
          },
          qc: {
            reported: qcReported.get(u.id) ?? 0,
            reviewed: qcReviewed.get(u.id) ?? 0,
          },
        },
      };
    });

    return NextResponse.json({
      employees,
      summary: {
        total: employees.length,
        active: employees.filter((e) => e.status === "active").length,
        onlineNow: employees.filter((e) => e.online).length,
      },
    });
  } catch (e) {
    return jsonError(e, "خطا در آمار کارمندان");
  }
}
