import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import { unsettledByCustomer } from "@/lib/customer-debt";

function getRange(req: NextRequest): { from: Date; to: Date } {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: toParam ? new Date(toParam) : now };
}

function prevRange(from: Date, to: Date): { from: Date; to: Date } {
  const len = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - len);
  return { from: prevFrom, to: prevTo };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // Phase 12: داشبورد جامع مدیریت — عملیات مدیریتی
  // Phase 19: «درآمد» = پولِ واقعاً دریافت‌شده (RevenueLog) — نه ارزش
  // سفارشات (خواستهٔ صریح: «فاکتور بدون دریافت پول نباید در درآمد برود»).
  // ارزش سفارشات جدید → KPI جداگانهٔ orderValue. KPI قدیمی payments
  // (مدل Payment بدون write) حذف شد.
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  try {
    const { from, to } = getRange(req);
    const prev = prevRange(from, to);

    const [
      ordersInPeriod, revenueInPeriod, newCustomersInPeriod, completedInPeriod,
      urgentInPeriod, expensesInPeriod,
      ordersPrev, revenuePrev, newCustomersPrev, completedPrev, urgentPrev, orderValuePrevAgg,
      byStatus,
      recentOrders,
      nearDeadlineOrders,
      latestTasks,
      overdueOrders,
      noEndDateCount,
      pendingTasksCount,
      // For chart series — fetch raw records in range
      ordersRaw, customersRaw, revenueRaw, expensesRaw,
      // Phase 19: رادار رئیس — بدهی‌ها و تعهدها (point-in-time)
      unsettledMap,
      suppliersDebt,
      pendingCosts,
      latestEvents,
    ] = await Promise.all([
      db.order.count({ where: { createdAt: { gte: from, lte: to } } }),
      // درآمد واقعی = Σ RevenueLog (هر دریافتی، هر زمان ثبت)
      db.revenueLog.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: from, lte: to } } }),
      db.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      db.order.count({ where: { status: "completed", createdAt: { gte: from, lte: to } } }),
      db.order.count({ where: { priority: "urgent", createdAt: { gte: from, lte: to } } }),
      db.materialCost.aggregate({ _sum: { amount: true }, where: { status: "approved", createdAt: { gte: from, lte: to } } }),
      db.order.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
      db.revenueLog.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: prev.from, lte: prev.to } } }),
      db.customer.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
      db.order.count({ where: { status: "completed", createdAt: { gte: prev.from, lte: prev.to } } }),
      db.order.count({ where: { priority: "urgent", createdAt: { gte: prev.from, lte: prev.to } } }),
      db.order.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: prev.from, lte: prev.to } } }),
      db.order.groupBy({ by: ["status"], _count: true }),
      db.order.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { customer: true, items: { include: { product: true } } } }),
      db.order.findMany({
        where: { endDate: { gte: new Date(), lte: new Date(Date.now() + 5 * 86400000) }, status: { notIn: ["completed", "archived", "cancelled"] }, noEndDate: false },
        orderBy: { endDate: "asc" }, take: 5, include: { customer: true, items: { include: { product: true } } },
      }),
      db.task.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { order: { include: { customer: true } } } }),
      db.order.findMany({
        where: { endDate: { lt: new Date() }, status: { notIn: ["completed", "archived", "cancelled"] }, noEndDate: false },
        orderBy: { endDate: "asc" }, take: 5, include: { customer: true },
      }),
      db.order.count({ where: { noEndDate: true, status: { notIn: ["completed", "archived", "cancelled"] } } }),
      db.task.count({ where: { status: "todo" } }),
      // Raw records for chart series
      db.order.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, totalAmount: true, status: true, priority: true } }),
      db.customer.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
      db.revenueLog.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true, amount: true } }),
      db.materialCost.findMany({ where: { status: "approved", createdAt: { gte: from, lte: to } }, select: { createdAt: true, amount: true } }),
      // ── Phase 19: رادار رئیس ──
      unsettledByCustomer(),
      db.supplier.findMany({ where: { balanceDue: { gt: 0 } }, select: { name: true, balanceDue: true }, orderBy: { balanceDue: "desc" }, take: 4 }),
      db.materialCost.aggregate({ _sum: { amount: true }, _count: true, where: { status: "pending" } }),
      db.orderEvent.findMany({
        where: user.role === "master" ? {} : { sensitive: false },
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, stage: true, title: true, actorName: true, sensitive: true, createdAt: true, order: { select: { number: true } } },
      }),
    ]);

    // Phase 17-D: «مشتریان تسویه‌نکرده» — بدهیِ الان (بدون فیلتر بازه؛
    // subValue = جمع مطالبات؛ کارت KPI فقط count را بزرگ نشان می‌دهد).
    const unsettledValues = Array.from(unsettledMap.values());
    const unsettledCount = unsettledValues.length;
    const unsettledSum = unsettledValues.reduce((a, b) => a + b, 0);

    // ارزش سفارشات جدید (سفارش‌هایی که در بازه ساخته شده‌اند)
    const orderValue = ordersRaw.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
    const orderValuePrev = orderValuePrevAgg._sum.totalAmount ?? 0;

    // Build per-metric daily series
    const days = new Map<string, { revenue: number; orders: number; completed: number; urgent: number; newCustomers: number; expenses: number; avgOrderValue: number; orderValue: number }>();
    function ensureDay(key: string) {
      if (!days.has(key)) days.set(key, { revenue: 0, orders: 0, completed: 0, urgent: 0, newCustomers: 0, expenses: 0, avgOrderValue: 0, orderValue: 0 });
      return days.get(key)!;
    }
    for (const o of ordersRaw) {
      const d = ensureDay(dayKey(o.createdAt));
      d.orderValue += o.totalAmount;
      d.orders += 1;
      if (o.status === "completed") d.completed += 1;
      if (o.priority === "urgent") d.urgent += 1;
    }
    for (const c of customersRaw) { ensureDay(dayKey(c.createdAt)).newCustomers += 1; }
    for (const r of revenueRaw) { ensureDay(dayKey(r.createdAt)).revenue += r.amount; }
    for (const e of expensesRaw) { ensureDay(dayKey(e.createdAt)).expenses += e.amount; }
    // Compute avgOrderValue per day (بر پایهٔ ارزش سفارش، نه درآمد)
    for (const d of days.values()) { d.avgOrderValue = d.orders > 0 ? Math.round(d.orderValue / d.orders) : 0; }

    const sortedDays = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const series: Record<string, { date: string; value: number }[]> = {
      revenue: sortedDays.map(([d, v]) => ({ date: d, value: v.revenue })),
      orders: sortedDays.map(([d, v]) => ({ date: d, value: v.orders })),
      avgOrderValue: sortedDays.map(([d, v]) => ({ date: d, value: v.avgOrderValue })),
      newCustomers: sortedDays.map(([d, v]) => ({ date: d, value: v.newCustomers })),
      completed: sortedDays.map(([d, v]) => ({ date: d, value: v.completed })),
      urgent: sortedDays.map(([d, v]) => ({ date: d, value: v.urgent })),
      orderValue: sortedDays.map(([d, v]) => ({ date: d, value: v.orderValue })),
    };

    const revenue = revenueInPeriod._sum.amount ?? 0;
    const revenuePrevVal = revenuePrev._sum.amount ?? 0;
    const expenses = expensesInPeriod._sum.amount ?? 0;
    const avgOrderValue = ordersInPeriod > 0 ? orderValue / ordersInPeriod : 0;
    const avgOrderValuePrev = ordersPrev > 0 ? orderValuePrev / ordersPrev : 0;

    function pctChange(curr: number, prevVal: number): number {
      if (prevVal === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prevVal) / prevVal) * 100);
    }

    // ── Phase 19: رادار رئیس — همه در یک نگاه ──
    // بدهکارترین مشتریان (اسم + عدد)
    const debtorNames = await db.customer.findMany({
      where: { id: { in: Array.from(unsettledMap.keys()) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(debtorNames.map((c) => [c.id, c.name]));
    const topDebtors = Array.from(unsettledMap.entries())
      .map(([id, due]) => ({ name: nameById.get(id) ?? "—", due }))
      .filter((x) => x.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 3);

    const supplierDebtSum = suppliersDebt.reduce((s, x) => s + x.balanceDue, 0);
    const now = new Date();
    const oldestOverdueDays = overdueOrders.length
      ? Math.max(...overdueOrders.map((o) => Math.floor((now.getTime() - new Date(o.endDate ?? now).getTime()) / 86400000)))
      : 0;

    // ── Phase 22 (خواستهٔ ۶): سفارش‌های زیان‌ده — «بیاد جلو چشمم» ──
    // سفارش‌های غیر لغو که هزینهٔ تأییدشده‌شان از مبلغشان بیشتر است.
    // هدیه‌ها همین‌جا خودشان را نشان می‌دهند: total کم شده، هزینه مانده.
    const [allOrdersForLoss, costsByOrder] = await Promise.all([
      db.order.findMany({
        where: { status: { not: "cancelled" } },
        select: {
          id: true,
          number: true,
          totalAmount: true,
          paidAmount: true,
          customer: { select: { name: true } },
        },
      }),
      db.materialCost.groupBy({
        by: ["orderId"],
        where: { status: "approved", orderId: { not: null } },
        _sum: { amount: true },
      }),
    ]);
    const costByOrder = new Map(
      costsByOrder.map((c) => [c.orderId as string, c._sum.amount ?? 0])
    );
    const lossList = allOrdersForLoss
      .map((o) => ({
        name: `#${o.number} — ${o.customer?.name ?? "—"}`,
        due: Math.round((costByOrder.get(o.id) ?? 0) - o.totalAmount), // زیان = هزینه − مبلغ
      }))
      .filter((x) => x.due > 0)
      .sort((a, b) => b.due - a.due);

    const radar = {
      customersDue: { count: unsettledCount, sum: unsettledSum, top: topDebtors },
      supplierDebt: { count: suppliersDebt.length, sum: supplierDebtSum, top: suppliersDebt.slice(0, 3) },
      overdue: { count: overdueOrders.length, oldestDays: oldestOverdueDays },
      pendingCosts: { count: pendingCosts._count, sum: pendingCosts._sum.amount ?? 0 },
      profit: { revenue, costs: expenses, net: revenue - expenses },
      // Phase 22 (خواستهٔ ۶): زیان‌ده‌ها — count + جمع زیان + بزرگ‌ترین‌ها
      lossOrders: {
        count: lossList.length,
        sum: lossList.reduce((s, x) => s + x.due, 0),
        top: lossList.slice(0, 3),
      },
    };

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        // Phase 19: درآمد = پول دریافتی‌شده (RevenueLog) — «فاکتور بدون
        // پول دیگر درآمد نیست»؛ subValue = سود خالص دوره.
        revenue: { value: revenue, prev: revenuePrevVal, change: pctChange(revenue, revenuePrevVal), total: revenue, subValue: revenue - expenses },
        orders: { value: ordersInPeriod, prev: ordersPrev, change: pctChange(ordersInPeriod, ordersPrev), total: ordersInPeriod },
        orderValue: { value: orderValue, prev: 0, change: 0, total: orderValue },
        avgOrderValue: { value: avgOrderValue, prev: avgOrderValuePrev, change: pctChange(avgOrderValue, avgOrderValuePrev), total: avgOrderValue },
        newCustomers: { value: newCustomersInPeriod, prev: newCustomersPrev, change: pctChange(newCustomersInPeriod, newCustomersPrev), total: newCustomersInPeriod },
        completed: { value: completedInPeriod, prev: completedPrev, change: pctChange(completedInPeriod, completedPrev), total: completedInPeriod },
        urgent: { value: urgentInPeriod, prev: urgentPrev, change: pctChange(urgentInPeriod, urgentPrev), total: urgentInPeriod },
        // Phase 17-D: جای «سود تخمینی» — طلبِ جاری از مشتریان (point-in-time)
        unsettledCustomers: { value: unsettledCount, prev: 0, change: 0, total: unsettledCount, subValue: unsettledSum },
      },
      quickStats: {
        overdueOrders: overdueOrders.length,
        nearDeadline: nearDeadlineOrders.length,
        noEndDate: noEndDateCount,
        pendingTasks: pendingTasksCount,
      },
      radar,
      recentOrders,
      nearDeadlineOrders,
      overdueOrders,
      latestTasks,
      latestEvents,
      byStatus,
      series,
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت داشبورد");
  }
}
