// Printoo24 ERP — Phase 13: هستهٔ محاسباتی «مانیتورینگ»
//
// تغذیهٔ سه endpoint: /api/monitoring/users (لیست)، /users/[id] (ریز یک
// کاربر با بازهٔ زمانی) و /modules (برد ماژول). همه‌چیز per-item است
// (designAssigneeId/printAssigneeId + فال‌بک سطح سفارش) — «مشخص شه
// هرکی چه سفارشی دستشه چه تسکی دسشته».
//
// استراتژی: مثل employees/stats همهٔ دادهٔ خام یک‌جا خوانده و در JS
// تجمیع می‌شود — برای مقیاس SQLite این ERP کاملاً سریع و تایپ‌دار است.

import { db } from "@/lib/db";
import { activeLeaveToday, localDayKey, type LeaveSpan } from "@/lib/access";

// ─── انواع اشتراکی (قرارداد API → فرانت) ───────────────────────────

export type UserStats = {
  design: { open: number; completed: number; delayed: number; delayedDays: number };
  print: { open: number; completed: number; delayed: number; delayedDays: number };
  tasks: { open: number; done: number; overdue: number; overdueDays: number };
  qc: { reported: number; reviewed: number };
  createdOrders: number;
};

export type MonitorUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  modules: string[];
  online: boolean;
  lastSeenAt: Date | null;
  lastLoginAt: Date | null;
  loginCount: number;
  onLeaveToday: boolean;
  leaveUntil: string | null;
  leaveNote: string | null;
  stats: UserStats;
};

// ─── محدودهٔ تاریخ (yyyy-MM-dd لوکال) ───────────────────────────────

export type DateRange = { from: string; to: string };

export function clampRange(raw: { from?: string | null; to?: string | null }): DateRange {
  const today = localDayKey();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(raw.from ?? "") ? (raw.from as string) : addDays(today, -30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(raw.to ?? "") ? (raw.to as string) : today;
  return { from, to };
}

export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDayKey(dt);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

function dayKeyOf(date: Date): string {
  return localDayKey(date);
}

// ─── لیست کاربران + آمار فوری (open/delayed) ───────────────────────

export async function monitorUsersList(): Promise<{
  users: MonitorUserRow[];
  summary: {
    total: number;
    active: number;
    onlineNow: number;
    onLeaveNow: number;
    delayedOrders: number;
    delayedTasks: number;
  };
}> {
  const now = Date.now();

  const [users, orders, tasks, qcReportedAgg, qcReviewedAgg] = await Promise.all([
    db.user.findMany({
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true,
        lastSeenAt: true, lastLoginAt: true, loginCount: true,
        modules: { select: { module: true } },
        leaves: { select: { startDate: true, endDate: true, note: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.order.findMany({
      select: {
        number: true,
        status: true,
        assignedDesignerId: true,
        assignedPrinterId: true,
        createdById: true,
        items: {
          select: {
            stage: true,
            designAssigneeId: true,
            printAssigneeId: true,
            designEndDate: true,
            printEndDate: true,
            designCompletedAt: true,
            printCompletedAt: true,
            designCompletedBy: true,
            printCompletedBy: true,
          },
        },
      },
    }),
    db.task.findMany({
      select: { id: true, assignedTo: true, status: true, dueDate: true, completedAt: true },
    }),
    db.qcReport.groupBy({ by: ["reportedById"], where: { reportedById: { not: null } }, _count: { _all: true } }),
    db.qcReport.groupBy({ by: ["reviewedById"], where: { reviewedById: { not: null } }, _count: { _all: true } }),
  ]);

  const qcReported = new Map(qcReportedAgg.map((r) => [r.reportedById ?? "", r._count._all]));
  const qcReviewed = new Map(qcReviewedAgg.map((r) => [r.reviewedById ?? "", r._count._all]));

  const rows: MonitorUserRow[] = users.map((u) => {
    const today = localDayKey();
    const activeLeave = activeLeaveToday(u.leaves as LeaveSpan[]);
    // نزدیک‌ترین مرخصی آینده (نمایش «تا تاریخ X»)
    const futureLeave = (u.leaves as LeaveSpan[])
      .filter((l) => l.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

    const stats: UserStats = {
      design: { open: 0, completed: 0, delayed: 0, delayedDays: 0 },
      print: { open: 0, completed: 0, delayed: 0, delayedDays: 0 },
      tasks: { open: 0, done: 0, overdue: 0, overdueDays: 0 },
      qc: { reported: qcReported.get(u.id) ?? 0, reviewed: qcReviewed.get(u.id) ?? 0 },
      createdOrders: 0,
    };

    for (const o of orders) {
      if (o.createdById === u.id) stats.createdOrders += 1;
      for (const it of o.items) {
        const effD = it.designAssigneeId ?? o.assignedDesignerId ?? null;
        const effP = it.printAssigneeId ?? o.assignedPrinterId ?? null;
        // طراحی
        if (effD === u.id) {
          if (it.stage === "design") {
            stats.design.open += 1;
            if (it.designEndDate && it.designEndDate.getTime() < now) {
              stats.design.delayed += 1;
              stats.design.delayedDays += Math.max(
                1,
                Math.ceil((now - it.designEndDate.getTime()) / 86400000)
              );
            }
          } else if (it.designCompletedBy === u.id) {
            stats.design.completed += 1;
          }
        }
        // چاپ (آیتم در طراحی هم «چاپِ پیش‌رو» دارد ولی شمارش فقط فعالی)
        if (effP === u.id) {
          if (it.stage === "print") {
            stats.print.open += 1;
            if (it.printEndDate && it.printEndDate.getTime() < now) {
              stats.print.delayed += 1;
              stats.print.delayedDays += Math.max(
                1,
                Math.ceil((now - it.printEndDate.getTime()) / 86400000)
              );
            }
          } else if (it.stage === "warehouse" || it.stage === "completed" || it.stage === "archive") {
            if (it.printCompletedBy === u.id) stats.print.completed += 1;
          }
        }
      }
    }

    for (const t of tasks) {
      if (t.assignedTo !== u.id) continue;
      if (t.status === "done") {
        stats.tasks.done += 1;
      } else {
        stats.tasks.open += 1;
        if (t.dueDate && t.dueDate.getTime() < now) {
          stats.tasks.overdue += 1;
          stats.tasks.overdueDays += Math.max(
            1,
            Math.ceil((now - t.dueDate.getTime()) / 86400000)
          );
        }
      }
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      modules: u.role === "master" ? [] : u.modules.map((m) => m.module),
      online: !!u.lastSeenAt && now - u.lastSeenAt.getTime() < 3 * 60 * 1000,
      lastSeenAt: u.lastSeenAt,
      lastLoginAt: u.lastLoginAt,
      loginCount: u.loginCount,
      onLeaveToday: !!activeLeave,
      leaveUntil: activeLeave ? activeLeave.endDate : futureLeave ? futureLeave.endDate : null,
      leaveNote: activeLeave?.note ?? null,
      stats,
    };
  });

  return {
    users: rows,
    summary: {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      onlineNow: rows.filter((r) => r.online).length,
      onLeaveNow: rows.filter((r) => r.onLeaveToday).length,
      delayedOrders: rows.reduce((s, r) => s + r.stats.design.delayed + r.stats.print.delayed, 0),
      delayedTasks: rows.reduce((s, r) => s + r.stats.tasks.overdue, 0),
    },
  };
}

// ─── ریز یک کاربر در بازهٔ زمانی (صفحهٔ اختصاصی مانیتورینگ) ────────

export type TimelineEvent = {
  at: Date;
  kind: "login" | "logout" | "design_done" | "print_done" | "task_done" | "task_created" | "qc_reported" | "qc_reviewed" | "order_created" | "leave";
  title: string;
  subtitle?: string;
  orderNumber?: number;
  taskId?: string;
};

export type UserDetailReport = {
  user: {
    id: string; name: string; email: string; phone: string | null; role: string;
    status: string; modules: string[]; createdAt: Date;
    lastSeenAt: Date | null; lastLoginAt: Date | null; loginCount: number;
  };
  online: boolean;
  onLeaveToday: boolean;
  leaves: { id: string; startDate: string; endDate: string; note: string | null; days: number }[];
  range: DateRange;
  kpis: {
    design: { open: number; completed: number; delayed: number; delayedDays: number };
    print: { open: number; completed: number; delayed: number; delayedDays: number };
    tasks: { open: number; done: number; overdue: number; overdueDays: number };
    qc: { reported: number; reviewed: number };
    loginsInRange: number;
    activeDays: number;
    createdOrders: number;
    onlineHoursEstimate: number; // برآورد از فاصلهٔ رویدادهای لاگ
  };
  delayOverview: {
    orders: {
      count: number;
      totalDays: number;
      items: { orderNumber: number; customerName: string; stage: "design" | "print"; endDate: string; daysDelayed: number }[];
    };
    tasks: {
      count: number;
      totalDays: number;
      items: { id: string; title: string; dueDate: string; daysDelayed: number; status: string }[];
    };
  };
  openOrders: { number: number; customerName: string; stageCounts: { design: number; print: number; warehouse: number }; endDate: string | null }[];
  today: { events: TimelineEvent[] };
  timeline: TimelineEvent[];
  activitySeries: { date: string; logins: number; itemsDone: number; tasksDone: number; qc: number }[];
};

export async function monitorUserDetail(userId: string, range: DateRange): Promise<UserDetailReport | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true,
      createdAt: true, lastSeenAt: true, lastLoginAt: true, loginCount: true,
      modules: { select: { module: true } },
      leaves: { select: { id: true, startDate: true, endDate: true, note: true }, orderBy: { startDate: "asc" } },
    },
  });
  if (!user) return null;

  const now = Date.now();
  const nowDay = localDayKey();

  const [orders, tasks, qcReports, activityLogs] = await Promise.all([
    db.order.findMany({
      where: {
        OR: [
          { assignedDesignerId: userId },
          { assignedPrinterId: userId },
          { createdById: userId },
          {
            items: {
              some: {
                OR: [
                  { designAssigneeId: userId },
                  { printAssigneeId: userId },
                  { designCompletedBy: userId },
                  { printCompletedBy: userId },
                ],
              },
            },
          },
        ],
      },
      select: {
        id: true, number: true, status: true,
        assignedDesignerId: true, assignedPrinterId: true, createdById: true, createdAt: true,
        endDate: true,
        customer: { select: { name: true } },
        items: {
          select: {
            stage: true,
            product: { select: { name: true } },
            designAssigneeId: true, printAssigneeId: true,
            designEndDate: true, printEndDate: true,
            designCompletedAt: true, printCompletedAt: true,
            designCompletedBy: true, printCompletedBy: true,
          },
        },
      },
      orderBy: { number: "desc" },
    }),
    db.task.findMany({
      where: { OR: [{ assignedTo: userId }, { completedAt: { not: null } }] },
      select: { id: true, title: true, status: true, dueDate: true, completedAt: true, assignedTo: true, createdAt: true, module: true },
      orderBy: { createdAt: "desc" },
    }),
    db.qcReport.findMany({
      where: { OR: [{ reportedById: userId }, { reviewedById: userId }] },
      select: { id: true, description: true, reportedById: true, reviewedById: true, reviewedAt: true, createdAt: true, orderId: true },
      orderBy: { createdAt: "desc" },
    }),
    db.userActivityLog.findMany({
      where: { userId, createdAt: { gte: new Date(range.from + "T00:00:00"), lte: new Date(range.to + "T23:59:59") } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // ── KPI ها ──
  const kpis: UserDetailReport["kpis"] = {
    design: { open: 0, completed: 0, delayed: 0, delayedDays: 0 },
    print: { open: 0, completed: 0, delayed: 0, delayedDays: 0 },
    tasks: { open: 0, done: 0, overdue: 0, overdueDays: 0 },
    qc: { reported: 0, reviewed: 0 },
    loginsInRange: 0,
    activeDays: 0,
    createdOrders: 0,
    onlineHoursEstimate: 0,
  };

  const delayOrders: UserDetailReport["delayOverview"]["orders"]["items"] = [];
  const openOrders: UserDetailReport["openOrders"] = [];
  const timeline: TimelineEvent[] = [];
  const rangeFrom = new Date(range.from + "T00:00:00");
  const rangeTo = new Date(range.to + "T23:59:59");
  const inRange = (d: Date | null | undefined) => !!d && d >= rangeFrom && d <= rangeTo;

  for (const o of orders) {
    if (o.createdById === userId) {
      kpis.createdOrders += 1;
      if (inRange(o.createdAt)) {
        timeline.push({ at: o.createdAt, kind: "order_created", title: `ثبت سفارش #${o.number}`, subtitle: o.customer?.name ?? undefined, orderNumber: o.number });
      }
    }
    const stageCounts = { design: 0, print: 0, warehouse: 0 };
    let isOpenOrder = false;
    for (const it of o.items) {
      const effD = it.designAssigneeId ?? o.assignedDesignerId ?? null;
      const effP = it.printAssigneeId ?? o.assignedPrinterId ?? null;
      if (it.stage === "design") stageCounts.design += 1;
      else if (it.stage === "print") stageCounts.print += 1;
      else if (it.stage === "warehouse") stageCounts.warehouse += 1;

      // ── طراحیِ من ──
      if (effD === userId) {
        if (it.stage === "design") {
          isOpenOrder = true;
          kpis.design.open += 1;
          if (it.designEndDate) {
            const endDay = dayKeyOf(it.designEndDate);
            if (endDay < nowDay) {
              const days = Math.max(1, daysBetween(endDay, nowDay));
              kpis.design.delayed += 1;
              kpis.design.delayedDays += days;
              delayOrders.push({
                orderNumber: o.number,
                customerName: o.customer?.name ?? "—",
                stage: "design",
                endDate: endKey(it.designEndDate),
                daysDelayed: days,
              });
            }
          }
        }
      }
      if (it.designCompletedBy === userId && it.designCompletedAt) {
        kpis.design.completed += 1;
        if (inRange(it.designCompletedAt)) {
          timeline.push({
            at: it.designCompletedAt,
            kind: "design_done",
            title: `تکمیل طراحی آیتم «${it.product?.name ?? "—"}» — سفارش #${o.number}`,
            subtitle: o.customer?.name ?? undefined,
            orderNumber: o.number,
          });
        }
      }
      // ── چاپِ من ──
      if (effP === userId && it.stage === "print") {
        isOpenOrder = true;
        kpis.print.open += 1;
        if (it.printEndDate) {
          const endDay = dayKeyOf(it.printEndDate);
          if (endDay < nowDay) {
            const days = Math.max(1, daysBetween(endDay, nowDay));
            kpis.print.delayed += 1;
            kpis.print.delayedDays += days;
            delayOrders.push({
              orderNumber: o.number,
              customerName: o.customer?.name ?? "—",
              stage: "print",
              endDate: endKey(it.printEndDate),
              daysDelayed: days,
            });
          }
        }
      }
      if (it.printCompletedBy === userId && it.printCompletedAt) {
        kpis.print.completed += 1;
        if (inRange(it.printCompletedAt)) {
          timeline.push({
            at: it.printCompletedAt,
            kind: "print_done",
            title: `تکمیل چاپ آیتم «${it.product?.name ?? "—"}» — سفارش #${o.number}`,
            subtitle: o.customer?.name ?? undefined,
            orderNumber: o.number,
          });
        }
      }
    }
    if (isOpenOrder) {
      openOrders.push({
        number: o.number,
        customerName: o.customer?.name ?? "—",
        stageCounts,
        endDate: o.endDate ? endKey(o.endDate) : null,
      });
    }
  }

  function endKey(d: Date): string {
    return dayKeyOf(d);
  }

  // ── تسک‌ها ──
  const delayTasks: UserDetailReport["delayOverview"]["tasks"]["items"] = [];
  const myTasks = tasks.filter((t) => t.assignedTo === userId);
  for (const t of myTasks) {
    if (t.status === "done") {
      kpis.tasks.done += 1;
      if (inRange(t.completedAt)) {
        timeline.push({ at: t.completedAt!, kind: "task_done", title: `تکمیل تسک «${t.title}»`, taskId: t.id });
      }
    } else {
      kpis.tasks.open += 1;
      if (t.dueDate) {
        const dueDay = dayKeyOf(t.dueDate);
        if (dueDay < nowDay) {
          const days = Math.max(1, daysBetween(dueDay, nowDay));
          kpis.tasks.overdue += 1;
          kpis.tasks.overdueDays += days;
          delayTasks.push({ id: t.id, title: t.title, dueDate: dueDay, daysDelayed: days, status: t.status });
        }
      }
    }
  }

  // ── QC ──
  for (const q of qcReports) {
    if (q.reportedById === userId) kpis.qc.reported += 1;
    if (q.reviewedById === userId) kpis.qc.reviewed += 1;
    if (q.reportedById === userId && inRange(q.createdAt)) {
      timeline.push({ at: q.createdAt, kind: "qc_reported", title: "ثبت گزارش کنترل کیفیت", subtitle: q.description.slice(0, 60) });
    }
    if (q.reviewedAt && inRange(q.reviewedAt)) {
      timeline.push({ at: q.reviewedAt, kind: "qc_reviewed", title: "بررسی گزارش کنترل کیفیت" });
    }
  }

  // ── حضور (login/logout) ──
  let onlineMs = 0;
  const activeDaySet = new Set<string>();
  for (const log of activityLogs) {
    if (log.action === "login") kpis.loginsInRange += 1;
    activeDaySet.add(dayKeyOf(log.createdAt));
    timeline.push({
      at: log.createdAt,
      kind: log.action === "login" ? "login" : "logout",
      title: log.action === "login" ? "ورود به سیستم" : "خروج از سیستم",
    });
  }
  // برآورد ساعت آنلاین: هر login تا رویداد بعدی (حداکثر ۶ ساعت)
  for (let i = 0; i < activityLogs.length; i++) {
    const log = activityLogs[i];
    if (log.action !== "login") continue;
    const next = activityLogs[i + 1];
    const until = next ? Math.min(next.createdAt.getTime(), log.createdAt.getTime() + 6 * 3600_000) : log.createdAt.getTime() + 3600_000;
    onlineMs += Math.max(0, until - log.createdAt.getTime());
  }
  kpis.onlineHoursEstimate = Math.round((onlineMs / 3600000) * 10) / 10;
  kpis.activeDays = activeDaySet.size;

  // ── مرخصی‌ها ──
  const leaves = (user.leaves ?? []).map((l) => ({
    id: l.id,
    startDate: l.startDate,
    endDate: l.endDate,
    note: l.note,
    days: daysBetween(l.startDate, l.endDate) + 1,
  }));
  for (const l of leaves) {
    if (l.startDate >= range.from && l.startDate <= range.to) {
      timeline.push({ at: new Date(l.startDate + "T08:00:00"), kind: "leave", title: `شروع مرخصی (${l.days} روز)`, subtitle: l.note ?? undefined });
    }
  }

  // ── سری فعالیت روزانه (چارت) ──
  const seriesMap = new Map<string, { logins: number; itemsDone: number; tasksDone: number; qc: number }>();
  const daysCount = Math.min(400, Math.max(1, daysBetween(range.from, range.to) + 1));
  for (let i = 0; i < daysCount; i++) {
    seriesMap.set(addDays(range.from, i), { logins: 0, itemsDone: 0, tasksDone: 0, qc: 0 });
  }
  const bump = (d: Date, field: "logins" | "itemsDone" | "tasksDone" | "qc") => {
    const k = dayKeyOf(d);
    const row = seriesMap.get(k);
    if (row) row[field] += 1;
  };
  for (const log of activityLogs) if (log.action === "login") bump(log.createdAt, "logins");
  for (const o of orders) {
    for (const it of o.items) {
      if (it.designCompletedBy === userId && inRange(it.designCompletedAt)) bump(it.designCompletedAt!, "itemsDone");
      if (it.printCompletedBy === userId && inRange(it.printCompletedAt)) bump(it.printCompletedAt!, "itemsDone");
    }
  }
  for (const t of myTasks) if (t.status === "done" && inRange(t.completedAt)) bump(t.completedAt!, "tasksDone");
  for (const q of qcReports) {
    if (q.reportedById === userId && inRange(q.createdAt)) bump(q.createdAt, "qc");
  }

  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());
  const todayEvents = timeline.filter((e) => dayKeyOf(e.at) === nowDay);

  const leavesSpans = (user.leaves ?? []) as LeaveSpan[];

  return {
    user: {
      id: user.id, name: user.name, email: user.email, phone: user.phone,
      role: user.role, status: user.status,
      modules: user.role === "master" ? [] : user.modules.map((m) => m.module),
      createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, lastLoginAt: user.lastLoginAt,
      loginCount: user.loginCount,
    },
    online: !!user.lastSeenAt && now - user.lastSeenAt.getTime() < 3 * 60 * 1000,
    onLeaveToday: !!activeLeaveToday(leavesSpans),
    leaves,
    range,
    kpis,
    delayOverview: {
      orders: {
        count: delayOrders.length,
        totalDays: delayOrders.reduce((s, i) => s + i.daysDelayed, 0),
        items: delayOrders.slice(0, 50),
      },
      tasks: {
        count: delayTasks.length,
        totalDays: delayTasks.reduce((s, i) => s + i.daysDelayed, 0),
        items: delayTasks.slice(0, 50),
      },
    },
    openOrders: openOrders.slice(0, 100),
    today: { events: todayEvents },
    timeline: timeline.slice(0, 300),
    activitySeries: Array.from(seriesMap.entries()).map(([date, v]) => ({ date, ...v })),
  };
}

// ─── برد ماژول (مانیتورینگ ماژول) ──────────────────────────────────

export type ModuleEmployeeRow = {
  userId: string;
  name: string;
  online: boolean;
  onLeaveToday: boolean;
  leaveUntil: string | null;
  // آیتم‌های فعلی این ماژول
  openItems: number;
  busyUntil: string | null; // آخرین موعدِ آیتم‌های باز (yyyy-MM-dd)
  delayedOpen: number;
  delayedDays: number;
  // عملکرد در بازه
  completedInRange: number;
  lateCompletions: number; // تکمیل بعد از موعد
  tasksOpen: number;
  tasksDoneInRange: number;
  tasksOverdue: number;
};

export type ModuleBoardReport = {
  module: string;
  range: DateRange;
  employees: ModuleEmployeeRow[];
  totals: {
    openItems: number;
    delayedOpen: number;
    completedInRange: number;
    tasksOpen: number;
  };
  completedTrend: { date: string; count: number }[];
};

export async function monitorModuleBoard(
  module: string,
  range: DateRange
): Promise<ModuleBoardReport | null> {
  const users = await db.user.findMany({
    where: { status: "active", modules: { some: { module } } },
    select: {
      id: true, name: true, lastSeenAt: true,
      leaves: { select: { startDate: true, endDate: true, note: true } },
    },
    orderBy: { name: "asc" },
  });
  if (users.length === 0) {
    return {
      module, range, employees: [], totals: { openItems: 0, delayedOpen: 0, completedInRange: 0, tasksOpen: 0 },
      completedTrend: [],
    };
  }
  const userIds = new Set(users.map((u) => u.id));
  const now = Date.now();
  const nowDay = localDayKey();
  const rangeFrom = new Date(range.from + "T00:00:00");
  const rangeTo = new Date(range.to + "T23:59:59");
  const inRange = (d: Date | null | undefined) => !!d && d >= rangeFrom && d <= rangeTo;

  const isDesign = module === "designer";
  const isPrint = module === "print";

  const [orders, tasks] = await Promise.all([
    isDesign || isPrint
      ? db.order.findMany({
          where: {
            items: {
              some: isDesign
                ? { OR: [{ designAssigneeId: { in: [...userIds] } }, { designCompletedBy: { in: [...userIds] } }] }
                : { OR: [{ printAssigneeId: { in: [...userIds] } }, { printCompletedBy: { in: [...userIds] } }] },
            },
          },
          select: {
            number: true,
            assignedDesignerId: true,
            assignedPrinterId: true,
            items: {
              select: {
                stage: true,
                designAssigneeId: true,
                printAssigneeId: true,
                designEndDate: true,
                printEndDate: true,
                designCompletedAt: true,
                printCompletedAt: true,
                designCompletedBy: true,
                printCompletedBy: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    db.task.findMany({
      where: { OR: [{ assignedTo: { in: [...userIds] } }, { module, status: "done", completedAt: { not: null } }] },
      select: { id: true, title: true, assignedTo: true, status: true, dueDate: true, completedAt: true, module: true },
    }),
  ]);

  const rows: ModuleEmployeeRow[] = users.map((u) => {
    const row: ModuleEmployeeRow = {
      userId: u.id,
      name: u.name,
      online: !!u.lastSeenAt && now - u.lastSeenAt.getTime() < 3 * 60 * 1000,
      onLeaveToday: !!activeLeaveToday(u.leaves as LeaveSpan[]),
      leaveUntil: activeLeaveToday(u.leaves as LeaveSpan[])?.endDate ?? null,
      openItems: 0,
      busyUntil: null,
      delayedOpen: 0,
      delayedDays: 0,
      completedInRange: 0,
      lateCompletions: 0,
      tasksOpen: 0,
      tasksDoneInRange: 0,
      tasksOverdue: 0,
    };
    let busyUntilKey: string | null = null;

    for (const o of orders) {
      for (const it of o.items) {
        if (isDesign) {
          const eff = it.designAssigneeId ?? o.assignedDesignerId ?? null;
          if (eff === u.id && it.stage === "design") {
            row.openItems += 1;
            if (it.designEndDate) {
              const k = dayKeyOf(it.designEndDate);
              if (busyUntilKey === null || k > busyUntilKey) busyUntilKey = k;
              if (k < nowDay) {
                row.delayedOpen += 1;
                row.delayedDays += Math.max(1, daysBetween(k, nowDay));
              }
            }
          }
          if (it.designCompletedBy === u.id && inRange(it.designCompletedAt)) {
            row.completedInRange += 1;
            if (it.designEndDate && it.designCompletedAt! > it.designEndDate) row.lateCompletions += 1;
          }
        } else if (isPrint) {
          const eff = it.printAssigneeId ?? o.assignedPrinterId ?? null;
          if (eff === u.id && it.stage === "print") {
            row.openItems += 1;
            if (it.printEndDate) {
              const k = dayKeyOf(it.printEndDate);
              if (busyUntilKey === null || k > busyUntilKey) busyUntilKey = k;
              if (k < nowDay) {
                row.delayedOpen += 1;
                row.delayedDays += Math.max(1, daysBetween(k, nowDay));
              }
            }
          }
          if (it.printCompletedBy === u.id && inRange(it.printCompletedAt)) {
            row.completedInRange += 1;
            if (it.printEndDate && it.printCompletedAt! > it.printEndDate) row.lateCompletions += 1;
          }
        }
      }
    }
    row.busyUntil = busyUntilKey;

    for (const t of tasks) {
      if (t.assignedTo === u.id) {
        if (t.status === "done") {
          if (inRange(t.completedAt)) row.tasksDoneInRange += 1;
        } else {
          row.tasksOpen += 1;
          if (t.dueDate && dayKeyOf(t.dueDate) < nowDay) row.tasksOverdue += 1;
        }
      }
    }
    return row;
  });

  // روند تکمیل روزانهٔ ماژول (آیتم‌های design/print + تسک‌ها)
  const trendMap = new Map<string, number>();
  const daysCount = Math.min(120, Math.max(1, daysBetween(range.from, range.to) + 1));
  for (let i = 0; i < daysCount; i++) trendMap.set(addDays(range.from, i), 0);
  const bumpTrend = (d: Date) => {
    const k = dayKeyOf(d);
    if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
  };
  for (const o of orders) {
    for (const it of o.items) {
      if (isDesign && it.designCompletedAt && inRange(it.designCompletedAt)) bumpTrend(it.designCompletedAt);
      if (isPrint && it.printCompletedAt && inRange(it.printCompletedAt)) bumpTrend(it.printCompletedAt);
    }
  }
  for (const t of tasks) {
    if (t.module === module && t.status === "done" && t.completedAt && inRange(t.completedAt)) bumpTrend(t.completedAt);
  }

  return {
    module,
    range,
    employees: rows,
    totals: {
      openItems: rows.reduce((s, r) => s + r.openItems, 0),
      delayedOpen: rows.reduce((s, r) => s + r.delayedOpen, 0),
      completedInRange: rows.reduce((s, r) => s + r.completedInRange, 0),
      tasksOpen: rows.reduce((s, r) => s + r.tasksOpen, 0),
    },
    completedTrend: Array.from(trendMap.entries()).map(([date, count]) => ({ date, count })),
  };
}
