import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Compare prices for services with the same name across suppliers
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceName = searchParams.get("name");

  if (serviceName) {
    // Compare specific service name across suppliers
    const services = await db.supplierService.findMany({
      where: { name: { contains: serviceName } },
      include: {
        supplier: true,
        subcategory: { include: { category: true } },
        priceLists: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });
    return NextResponse.json({ services });
  }

  // Get all unique service names with their price ranges
  const allServices = await db.supplierService.findMany({
    include: {
      supplier: true,
      priceLists: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Group by name
  const grouped = new Map<string, {
    name: string;
    suppliers: { id: string; name: string; price: number | null; serviceId: string }[];
    minPrice: number | null;
    maxPrice: number | null;
  }>();

  for (const svc of allServices) {
    const key = svc.name;
    if (!grouped.has(key)) {
      grouped.set(key, { name: key, suppliers: [], minPrice: null, maxPrice: null });
    }
    const group = grouped.get(key)!;
    const latestPrice = svc.priceLists[0]?.price ?? null;
    group.suppliers.push({ id: svc.supplier.id, name: svc.supplier.name, price: latestPrice, serviceId: svc.id });
    if (latestPrice !== null) {
      group.minPrice = group.minPrice === null ? latestPrice : Math.min(group.minPrice, latestPrice);
      group.maxPrice = group.maxPrice === null ? latestPrice : Math.max(group.maxPrice, latestPrice);
    }
  }

  const result = Array.from(grouped.values()).filter(g => g.suppliers.length > 0);
  return NextResponse.json({ comparisons: result });
}
