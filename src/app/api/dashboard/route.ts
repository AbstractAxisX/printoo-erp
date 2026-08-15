import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Parse date range from query: ?from=ISO&to=ISO
// Presets handled client-side, server just receives from/to.
function getRange(req: NextRequest): { from: Date; to: Date } {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  // default: this month
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: toParam ? new Date(toParam) : now };
}

// Previous period of same length
function prevRange(from: Date, to: Date): { from: Date; to: Date } {
  const len = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - len);
  return { from: prevFrom, to: prevTo };
}

export async function GET(req: NextRequest) {
  const { from, to } = getRange(req);
  const prev = prevRange(from, to);

  // Current period aggregates
  const [
    ordersInPeriod, revenueInPeriod, newCustomersInPeriod, completedInPeriod,
    urgentInPeriod, paymentsInPeriod, expensesInPeriod,
    // Previous period
    ordersPrev, revenuePrev, newCustomersPrev, completedPrev, urgentPrev, paymentsPrev,
    // Status distribution (all time)
    byStatus,
    // Recent orders
    recentOrders,
    // Near deadline orders (5 days)
    nearDeadlineOrders,
    // Latest tasks
    latestTasks,
    // Overdue orders
    overdueOrders,
    // Orders without end date
    noEndDateCount,
    // Pending tasks count
    pendingTasksCount,
    // Daily revenue for chart (current period)
    dailyRevenue,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.order.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: from, lte: to } } }),
    db.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.order.count({ where: { status: "completed", createdAt: { gte: from, lte: to } } }),
    db.order.count({ where: { priority: "urgent", createdAt: { gte: from, lte: to } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
    db.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
    // prev
    db.order.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.customer.count({ where: { createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.count({ where: { status: "completed", createdAt: { gte: prev.from, lte: prev.to } } }),
    db.order.count({ where: { priority: "urgent", createdAt: { gte: prev.from, lte: prev.to } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: prev.from, lte: prev.to } } }),
    // status dist
    db.order.groupBy({ by: ["status"], _count: true }),
    // recent
    db.order.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { customer: true, items: { include: { product: true } } } }),
    // near deadline (next 5 days, not completed/archived)
    db.order.findMany({
      where: {
        endDate: { gte: new Date(), lte: new Date(Date.now() + 5 * 86400000) },
        status: { notIn: ["completed", "archived", "cancelled"] },
        noEndDate: false,
      },
      orderBy: { endDate: "asc" },
      take: 5,
      include: { customer: true, items: { include: { product: true } } },
    }),
    // latest tasks
    db.task.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { order: { include: { customer: true } } } }),
    // overdue
    db.order.findMany({
      where: {
        endDate: { lt: new Date() },
        status: { notIn: ["completed", "archived", "cancelled"] },
        noEndDate: false,
      },
      orderBy: { endDate: "asc" },
      take: 5,
      include: { customer: true },
    }),
    // no end date count
    db.order.count({ where: { noEndDate: true, status: { notIn: ["completed", "archived", "cancelled"] } } }),
    // pending tasks
    db.task.count({ where: { status: "todo" } }),
    // daily revenue (group by day for chart) — using raw-ish via findMany + JS grouping
    db.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, totalAmount: true },
    }),
  ]);

  // Group daily revenue
  const dayMap = new Map<string, number>();
  for (const o of dailyRevenue) {
    const key = o.createdAt.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + o.totalAmount);
  }
  const chartData = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));

  const revenue = revenueInPeriod._sum.totalAmount ?? 0;
  const revenuePrevVal = revenuePrev._sum.totalAmount ?? 0;
  const payments = paymentsInPeriod._sum.amount ?? 0;
  const paymentsPrevVal = paymentsPrev._sum.amount ?? 0;
  const expenses = expensesInPeriod._sum.amount ?? 0;
  const profit = payments - expenses;
  const profitPrev = paymentsPrevVal - 0; // prev expenses not fetched, approx
  const avgOrderValue = ordersInPeriod > 0 ? revenue / ordersInPeriod : 0;
  const avgOrderValuePrev = ordersPrev > 0 ? (revenuePrevVal / ordersPrev) : 0;

  function pctChange(curr: number, prevVal: number): number {
    if (prevVal === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prevVal) / prevVal) * 100);
  }

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: {
      revenue: { value: revenue, prev: revenuePrevVal, change: pctChange(revenue, revenuePrevVal), total: revenueInPeriod._sum.totalAmount ?? 0 },
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
    chartData,
  });
}
