import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  const { from, to } = getRange(req);
  const prev = prevRange(from, to);

  const [
    ordersInPeriod, revenueInPeriod, newCustomersInPeriod, completedInPeriod,
    urgentInPeriod, paymentsInPeriod, expensesInPeriod,
    ordersPrev, revenuePrev, newCustomersPrev, completedPrev, urgentPrev, paymentsPrev,
    byStatus,
    recentOrders,
    nearDeadlineOrders,
    latestTasks,
    overdueOrders,
    noEndDateCount,
    pendingTasksCount,
    // For chart series — fetch raw records in range
    ordersRaw, customersRaw, paymentsRaw, expensesRaw,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.order.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: from, lte: to } } }),
    db.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.order.count({ where: { status: "completed", createdAt: { gte: from, lte: to } } }),
    db.order.count({ where: { priority: "urgent", createdAt: { gte: from, lte: to } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
    db.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
    db.order.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.customer.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.count({ where: { status: "completed", createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.count({ where: { priority: "urgent", createdAt: { gte: prev.from, lte: prev.to } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: prev.from, lte: prev.to } } }),
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
    db.payment.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, amount: true } }),
    db.expense.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, amount: true } }),
  ]);

  // Build per-metric daily series
  const days = new Map<string, { revenue: number; orders: number; completed: number; urgent: number; newCustomers: number; payments: number; expenses: number; profit: number; avgOrderValue: number }>();
  function ensureDay(key: string) {
    if (!days.has(key)) days.set(key, { revenue: 0, orders: 0, completed: 0, urgent: 0, newCustomers: 0, payments: 0, expenses: 0, profit: 0, avgOrderValue: 0 });
    return days.get(key)!;
  }
  for (const o of ordersRaw) {
    const d = ensureDay(dayKey(o.createdAt));
    d.revenue += o.totalAmount;
    d.orders += 1;
    if (o.status === "completed") d.completed += 1;
    if (o.priority === "urgent") d.urgent += 1;
  }
  for (const c of customersRaw) { ensureDay(dayKey(c.createdAt)).newCustomers += 1; }
  for (const p of paymentsRaw) { const d = ensureDay(dayKey(p.date)); d.payments += p.amount; d.profit += p.amount; }
  for (const e of expensesRaw) { const d = ensureDay(dayKey(e.date)); d.expenses += e.amount; d.profit -= e.amount; }
  // Compute avgOrderValue per day
  for (const d of days.values()) { d.avgOrderValue = d.orders > 0 ? Math.round(d.revenue / d.orders) : 0; }

  const sortedDays = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const series: Record<string, { date: string; value: number }[]> = {
    revenue: sortedDays.map(([d, v]) => ({ date: d, value: v.revenue })),
    orders: sortedDays.map(([d, v]) => ({ date: d, value: v.orders })),
    avgOrderValue: sortedDays.map(([d, v]) => ({ date: d, value: v.avgOrderValue })),
    newCustomers: sortedDays.map(([d, v]) => ({ date: d, value: v.newCustomers })),
    completed: sortedDays.map(([d, v]) => ({ date: d, value: v.completed })),
    urgent: sortedDays.map(([d, v]) => ({ date: d, value: v.urgent })),
    payments: sortedDays.map(([d, v]) => ({ date: d, value: v.payments })),
    profit: sortedDays.map(([d, v]) => ({ date: d, value: v.profit })),
  };

  const revenue = revenueInPeriod._sum.totalAmount ?? 0;
  const revenuePrevVal = revenuePrev._sum.totalAmount ?? 0;
  const payments = paymentsInPeriod._sum.amount ?? 0;
  const paymentsPrevVal = paymentsPrev._sum.amount ?? 0;
  const expenses = expensesInPeriod._sum.amount ?? 0;
  const profit = payments - expenses;
  const profitPrev = paymentsPrevVal;
  const avgOrderValue = ordersInPeriod > 0 ? revenue / ordersInPeriod : 0;
  const avgOrderValuePrev = ordersPrev > 0 ? (revenuePrevVal / ordersPrev) : 0;

  function pctChange(curr: number, prevVal: number): number {
    if (prevVal === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prevVal) / prevVal) * 100);
  }

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: {
      revenue: { value: revenue, prev: revenuePrevVal, change: pctChange(revenue, revenuePrevVal), total: revenue },
      orders: { value: ordersInPeriod, prev: ordersPrev, change: pctChange(ordersInPeriod, ordersPrev), total: ordersInPeriod },
      avgOrderValue: { value: avgOrderValue, prev: avgOrderValuePrev, change: pctChange(avgOrderValue, avgOrderValuePrev), total: avgOrderValue },
      newCustomers: { value: newCustomersInPeriod, prev: newCustomersPrev, change: pctChange(newCustomersInPeriod, newCustomersPrev), total: newCustomersInPeriod },
      completed: { value: completedInPeriod, prev: completedPrev, change: pctChange(completedInPeriod, completedPrev), total: completedInPeriod },
      urgent: { value: urgentInPeriod, prev: urgentPrev, change: pctChange(urgentInPeriod, urgentPrev), total: urgentInPeriod },
      payments: { value: payments, prev: paymentsPrevVal, change: pctChange(payments, paymentsPrevVal), total: payments },
      profit: { value: profit, prev: profitPrev, change: pctChange(profit, profitPrev), total: profit },
    },
    quickStats: {
      overdueOrders: overdueOrders.length,
      nearDeadline: nearDeadlineOrders.length,
      noEndDate: noEndDateCount,
      pendingTasks: pendingTasksCount,
    },
    recentOrders,
    nearDeadlineOrders,
    overdueOrders,
    latestTasks,
    byStatus,
    series,
  });
}
