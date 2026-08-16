import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const [
    suppliersCount,
    categoriesCount,
    servicesCount,
    priceListsCount,
    totalCosts,
    approvedCosts,
    pendingCosts,
    recentCosts,
    suppliersByCategory,
  ] = await Promise.all([
    db.supplier.count(),
    db.supplierCategory.count(),
    db.supplierService.count(),
    db.priceList.count(),
    db.materialCost.aggregate({ _sum: { amount: true } }),
    db.materialCost.aggregate({ _sum: { amount: true }, where: { status: "approved" } }),
    db.materialCost.aggregate({ _sum: { amount: true }, where: { status: "pending" } }),
    db.materialCost.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { supplier: true, expenseType: true, order: { include: { customer: true } } },
    }),
    db.supplierCategory.findMany({
      include: {
        subcategories: { include: { _count: { select: { suppliers: true } } } },
        _count: { select: { subcategories: true } },
      },
    }),
  ]);

  return NextResponse.json({
    stats: {
      suppliers: suppliersCount,
      categories: categoriesCount,
      services: servicesCount,
      priceLists: priceListsCount,
      totalCosts: totalCosts._sum.amount ?? 0,
      approvedCosts: approvedCosts._sum.amount ?? 0,
      pendingCosts: pendingCosts._sum.amount ?? 0,
    },
    recentCosts,
    suppliersByCategory,
  });
}
