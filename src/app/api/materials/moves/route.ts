import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET /api/materials/moves?materialId=&limit= ──────
// همهٔ گردش‌های انبار (با نام ماده) — صفحهٔ «موجودی و مواد».

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId");
    const limitRaw = Number(searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

    const moves = await db.materialStockMove.findMany({
      where: materialId ? { materialId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { material: { select: { id: true, name: true, unit: true } } },
    });
    return NextResponse.json({ moves });
  } catch (e) {
    return jsonError(e, "خطا در دریافت گردش‌ها");
  }
}
