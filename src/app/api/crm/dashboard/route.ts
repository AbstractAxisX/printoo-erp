import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export async function GET() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const in7Days = new Date(now.getTime() + 7 * 86400000);

  const [
    totalCustomers,
    activeDealsCount,
    pipelineValueAgg,
    wonThisMonthAgg,
    wonThisMonthCount,
    dealsByStageRaw,
    recentActivities,
    topCustomersByOrderCount,
    closingSoonDeals,
    lostThisMonthCount,
    totalDeals,
    wonTotalCount,
    newCustomersThisMonth,
  ] = await Promise.all([
    db.customer.count(),
    db.deal.count({ where: { stage: { notIn: ["won", "lost"] } } }),
    db.deal.aggregate({
      _sum: { value: true },
      where: { stage: { notIn: ["won", "lost"] } },
    }),
    db.deal.aggregate({
      _sum: { value: true },
      where: { stage: "won", updatedAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    db.deal.count({
      where: { stage: "won", updatedAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    db.deal.groupBy({
      by: ["stage"],
      _count: true,
      _sum: { value: true },
    }),
    db.activity.findMany({
      take: 6,
      orderBy: { date: "desc" },
      include: { customer: true, deal: true },
    }),
    db.order.groupBy({
      by: ["customerId"],
      _count: true,
      orderBy: { _count: { customerId: "desc" } },
      take: 5,
    }),
    db.deal.findMany({
      where: {
        expectedCloseDate: { gte: now, lte: in7Days },
        stage: { notIn: ["won", "lost"] },
      },
      take: 5,
      orderBy: { expectedCloseDate: "asc" },
      include: { customer: true },
    }),
    db.deal.count({
      where: { stage: "lost", updatedAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    db.deal.count(),
    db.deal.count({ where: { stage: "won" } }),
    db.customer.count({ where: { createdAt: { gte: startOfMonth, lte: endOfMonth } } }),
  ]);

  // Fetch top customer details (by order count)
  const topCustomerIds = topCustomersByOrderCount.map((t) => t.customerId);
  const topCustomersRaw = topCustomerIds.length
    ? await db.customer.findMany({
        where: { id: { in: topCustomerIds } },
        include: { _count: { select: { orders: true, deals: true } } },
      })
    : [];

  // Build stage map with count + total value
  const stageMap: Record<string, { count: number; value: number }> = {};
  for (const s of STAGES) stageMap[s] = { count: 0, value: 0 };
  for (const row of dealsByStageRaw) {
    stageMap[row.stage] = {
      count: row._count,
      value: row._sum.value ?? 0,
    };
  }

  // Compute conversion rate = won / total closed (won + lost)
  // closed = wonTotalCount + lostTotalCount; lostTotalCount = total - won - activeDealsCount
  const lostTotalCount = totalDeals - wonTotalCount - activeDealsCount;
  const closedReal = wonTotalCount + Math.max(0, lostTotalCount);
  const conversionRate = closedReal > 0 ? Math.round((wonTotalCount / closedReal) * 100) : 0;

  // Compute top customers (preserving groupBy order = most orders first)
  const topCustomersWithOrders = await Promise.all(
    topCustomersRaw.map(async (c) => {
      const orderAgg = await db.order.aggregate({
        _sum: { totalAmount: true },
        where: { customerId: c.id },
      });
      const ordersCount =
        topCustomersByOrderCount.find((t) => t.customerId === c.id)?._count ??
        c._count.orders;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        isFavorite: c.isFavorite,
        ordersCount,
        dealsCount: c._count.deals,
        totalSpent: orderAgg._sum.totalAmount ?? 0,
        createdAt: c.createdAt,
      };
    })
  );
  // Sort by order count descending (preserves groupBy order)
  topCustomersWithOrders.sort((a, b) => b.ordersCount - a.ordersCount);

  return NextResponse.json({
    kpis: {
      totalCustomers,
      activeDeals: activeDealsCount,
      pipelineValue: pipelineValueAgg._sum.value ?? 0,
      wonThisMonthValue: wonThisMonthAgg._sum.value ?? 0,
      wonThisMonthCount,
      lostThisMonthCount,
      conversionRate,
      newCustomersThisMonth,
      totalDeals,
    },
    pipeline: STAGES.map((s) => ({
      stage: s,
      count: stageMap[s].count,
      value: stageMap[s].value,
    })),
    recentActivities,
    topCustomers: topCustomersWithOrders,
    closingSoonDeals,
  });
}
