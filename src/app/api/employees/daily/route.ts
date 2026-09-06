import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-error";

// ─── GET /api/employees/daily?date=YYYY-MM-DD&userId=... (master) ──
//
// «هر کسی هر روزی چیکار کرده و چقدر کار داشته»:
//   • ورود/خروج‌های آن روز (UserActivityLog) — ساعت اولین/آخرین فعالیت
//   • آیتم‌های طراحی که همان روز تکمیل کرد (سفارش # + محصول + ساعت)
//   • آیتم‌های چاپ همان روز
//   • تسک‌های انجام‌شده همان روز (completedAt) + تسک‌های موعدِ همان روز
//   • سفارش‌هایی که همان روز ثبت کرد (createdById)
//   • گزارش‌های QC همان روز
//
// userId اختیاری است: بدون آن، همهٔ کارمندان (خلاصهٔ هر کدام) برمی‌گردند؛
// با آن، جزئیات کامل همان کارمند (شامل ردیف‌ها).

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (user.role !== "master") {
    return NextResponse.json(
      { error: "مدیریت کارمندان مخصوص مدیر ارشد است" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const userId = searchParams.get("userId");

    // اعتبار تاریخ: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: "قالب تاریخ نامعتبر است — YYYY-MM-DD" },
        { status: 400 }
      );
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "تاریخ نامعتبر است" }, { status: 400 });
    }

    const whereDay = { createdAt: { gte: start, lt: end } };

    const [users, logs, designItems, printItems, tasksDone, tasksDue, ordersCreated, qcReports] =
      await Promise.all([
        db.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            modules: { select: { module: true } },
          },
          orderBy: { name: "asc" },
        }),
        db.userActivityLog.findMany({
          where: { ...whereDay, ...(userId ? { userId } : {}) },
          orderBy: { createdAt: "asc" },
        }),
        db.orderItem.findMany({
          where: {
            designCompletedAt: { gte: start, lt: end },
            designCompletedBy: userId ?? undefined,
          },
          select: {
            id: true,
            designCompletedAt: true,
            designCompletedBy: true,
            product: { select: { name: true } },
            order: {
              select: {
                number: true,
                customer: { select: { name: true } },
                assignedDesigner: { select: { id: true, name: true } },
              },
            },
          },
        }),
        db.orderItem.findMany({
          where: {
            printCompletedAt: { gte: start, lt: end },
            printCompletedBy: userId ?? undefined,
          },
          select: {
            id: true,
            printCompletedAt: true,
            printCompletedBy: true,
            product: { select: { name: true } },
            order: {
              select: {
                number: true,
                customer: { select: { name: true } },
                assignedPrinter: { select: { id: true, name: true } },
              },
            },
          },
        }),
        db.task.findMany({
          where: {
            completedAt: { gte: start, lt: end },
            assignedTo: userId ?? undefined,
          },
          select: { id: true, title: true, module: true, completedAt: true, assignedTo: true },
        }),
        db.task.findMany({
          where: {
            dueDate: { gte: start, lt: end },
            assignedTo: userId ?? undefined,
          },
          select: { id: true, title: true, status: true, dueDate: true, assignedTo: true },
        }),
        db.order.findMany({
          where: { createdAt: { gte: start, lt: end }, createdById: userId ?? undefined },
          select: {
            id: true,
            number: true,
            createdAt: true,
            createdById: true,
            customer: { select: { name: true } },
          },
        }),
        db.qcReport.findMany({
          where: { createdAt: { gte: start, lt: end }, reportedById: userId ?? undefined },
          select: {
            id: true,
            createdAt: true,
            reportedById: true,
            fromModule: true,
            order: { select: { number: true } },
          },
        }),
      ]);

    // گروه‌بندی همه‌چیز به‌ازای کاربر
    type DayEntry = {
      userId: string;
      name: string;
      events: {
        kind: "login" | "logout" | "design" | "print" | "task_done" | "task_due" | "order_created" | "qc";
        at: string; // ISO
        label: string;
        meta?: string;
      }[];
      summary: {
        logins: number;
        firstAt: string | null;
        lastAt: string | null;
        designCompleted: number;
        printCompleted: number;
        tasksCompleted: number;
        tasksDue: number;
        ordersCreated: number;
        qcReported: number;
      };
    };

    const byUser = new Map<string, DayEntry>();
    const ensure = (uid: string, name: string): DayEntry => {
      let e = byUser.get(uid);
      if (!e) {
        e = {
          userId: uid,
          name,
          events: [],
          summary: {
            logins: 0,
            firstAt: null,
            lastAt: null,
            designCompleted: 0,
            printCompleted: 0,
            tasksCompleted: 0,
            tasksDue: 0,
            ordersCreated: 0,
            qcReported: 0,
          },
        };
        byUser.set(uid, e);
      }
      return e;
    };
    const nameOf = (uid: string | null | undefined) =>
      users.find((u) => u.id === uid)?.name ?? "—";

    for (const l of logs) {
      const e = ensure(l.userId, nameOf(l.userId));
      e.events.push({
        kind: l.action === "logout" ? "logout" : "login",
        at: l.createdAt.toISOString(),
        label: l.action === "logout" ? "خروج از سیستم" : "ورود به سیستم",
      });
      if (l.action === "login") e.summary.logins++;
    }
    for (const it of designItems) {
      const uid = it.designCompletedBy ?? "";
      const e = ensure(uid, nameOf(uid));
      e.events.push({
        kind: "design",
        at: (it.designCompletedAt ?? new Date()).toISOString(),
        label: `تکمیل طراحی «${it.product?.name ?? "آیتم"}» — سفارش #${it.order?.number ?? "؟"}`,
        meta: it.order?.customer?.name ?? undefined,
      });
      e.summary.designCompleted++;
    }
    for (const it of printItems) {
      const uid = it.printCompletedBy ?? "";
      const e = ensure(uid, nameOf(uid));
      e.events.push({
        kind: "print",
        at: (it.printCompletedAt ?? new Date()).toISOString(),
        label: `تکمیل چاپ «${it.product?.name ?? "آیتم"}» — سفارش #${it.order?.number ?? "؟"}`,
        meta: it.order?.customer?.name ?? undefined,
      });
      e.summary.printCompleted++;
    }
    for (const t of tasksDone) {
      const e = ensure(t.assignedTo ?? "", nameOf(t.assignedTo));
      e.events.push({
        kind: "task_done",
        at: (t.completedAt ?? new Date()).toISOString(),
        label: `انجام تسک: ${t.title}`,
        meta: t.module,
      });
      e.summary.tasksCompleted++;
    }
    for (const t of tasksDue) {
      const e = ensure(t.assignedTo ?? "", nameOf(t.assignedTo));
      // تسکِ موعدِ امروز: رویداد مرزی — فقط در خلاصه می‌آید
      e.summary.tasksDue++;
    }
    for (const o of ordersCreated) {
      const e = ensure(o.createdById ?? "", nameOf(o.createdById));
      e.events.push({
        kind: "order_created",
        at: o.createdAt.toISOString(),
        label: `ثبت سفارش #${o.number}`,
        meta: o.customer?.name ?? undefined,
      });
      e.summary.ordersCreated++;
    }
    for (const r of qcReports) {
      const e = ensure(r.reportedById ?? "", nameOf(r.reportedById));
      e.events.push({
        kind: "qc",
        at: r.createdAt.toISOString(),
        label: `گزارش کنترل کیفی — سفارش #${r.order?.number ?? "؟"}`,
        meta: r.fromModule,
      });
      e.summary.qcReported++;
    }

    // خلاصهٔ زمانی هر کاربر + مرتب‌سازی رویدادها
    for (const e of byUser.values()) {
      e.events.sort((a, b) => a.at.localeCompare(b.at));
      if (e.events.length) {
        e.summary.firstAt = e.events[0].at;
        e.summary.lastAt = e.events[e.events.length - 1].at;
      }
    }

    // بدون userId → همه (فقط خلاصه)؛ با userId → جزئیات کامل + کاربران بدون فعالیت هم می‌آیند
    if (userId) {
      const target = users.find((u) => u.id === userId);
      const entry = byUser.get(userId);
      return NextResponse.json({
        date: dateStr,
        user: {
          id: userId,
          name: target?.name ?? "—",
          modules: target?.role === "master" ? [] : (target?.modules ?? []).map((m) => m.module),
        },
        day: entry ?? null,
      });
    }

    return NextResponse.json({
      date: dateStr,
      days: Array.from(byUser.values()),
    });
  } catch (e) {
    return jsonError(e, "خطا در فعالیت روزانهٔ کارمندان");
  }
}
