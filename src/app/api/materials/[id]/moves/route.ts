import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET/POST /api/materials/[id]/moves ───────────────
// GET  ?limit= → گردش انبار این ماده (تازه‌ها اول)
// POST → ثبت گردش { delta (+ورود/−خروج), reason } — موجودی همگام.

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const mat = await db.material.findUnique({ where: { id }, select: { id: true } });
    if (!mat) return jsonError(new Error("nf"), "ماده یافت نشد", 404);

    const moves = await db.materialStockMove.findMany({
      where: { materialId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ moves });
  } catch (e) {
    return jsonError(e, "خطا در دریافت گردش انبار");
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const mat = await db.material.findUnique({ where: { id } });
    if (!mat) return jsonError(new Error("nf"), "ماده یافت نشد", 404);

    const body = await req.json();
    const delta = Number(body.delta);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) {
      return jsonError(new Error("v"), "مقدار گردش باید عددی غیرصفر باشد", 400);
    }
    if (mat.quantity + delta < 0) {
      return jsonError(
        new Error("stock"),
        `موجودی کافی نیست (موجودی فعلی: ${mat.quantity.toLocaleString("fa-IR")} ${mat.unit})`,
        400
      );
    }

    const move = await db.$transaction(async (tx) => {
      const m = await tx.materialStockMove.create({
        data: {
          materialId: id,
          delta,
          reason: reason || (delta > 0 ? "ورود به انبار" : "خروج از انبار"),
          createdById: user.id,
          createdByName: user.name,
        },
      });
      await tx.material.update({
        where: { id },
        data: { quantity: { increment: delta } },
      });
      return m;
    });

    const after = await db.material.findUnique({ where: { id }, select: { quantity: true } });
    return NextResponse.json(
      {
        move,
        quantityAfter: after?.quantity ?? 0,
        message: `گردش ثبت شد — موجودی جدید: ${(after?.quantity ?? 0).toLocaleString("fa-IR")} ${mat.unit}`,
      },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در ثبت گردش انبار");
  }
}
