import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const [
    customersCount,
    ordersCount,
    openOrdersCount,
    completedCount,
    archivedCount,
    payments,
    expenses,
    recentOrders,
    byStatus,
  ] = await Promise.all([
    db.customer.count(),
    db.order.count(),
    db.order.count({ where: { status: { in: ["pending_design", "in_printing", "warehouse_logistics"] } } }),
    db.order.count({ where: { status: "completed" } }),
    db.order.count({ where: { status: "archived" } }),
    db.payment.aggregate({ _sum: { amount: true } }),
    db.expense.aggregate({ _sum: { amount: true } }),
    db.order.findMany({ take: 6, orderBy: { createdAt: "desc" }, include: { customer: true, items: true } }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);

  const totalPayments = payments._sum.amount ?? 0;
  const totalExpenses = expenses._sum.amount ?? 0;

  return NextResponse.json({
    stats: {
      customers: customersCount,
      orders: ordersCount,
      openOrders: openOrdersCount,
      completed: completedCount,
      archived: archivedCount,
      payments: totalPayments,
      expenses: totalExpenses,
      profit: totalPayments - totalExpenses,
    },
    recentOrders,
    byStatus,
  });
}
