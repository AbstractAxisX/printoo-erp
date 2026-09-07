import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: PUT/DELETE /api/materials/[id] ───────────────────
// PUT    → ویرایش { name?, unit?, minQuantity?, note?, isActive? }
// DELETE → فقط وقتی هیچ گردشی ندارد (وگرنه «غیرفعال» کن)

export async function PUT(
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
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      const name = body.name.trim();
      const dup = await db.material.findFirst({ where: { name, id: { not: id } } });
      if (dup) return jsonError(new Error("dup"), "ماده‌ای با این نام موجود است", 409);
      data.name = name;
    }
    if (typeof body.unit === "string" && body.unit.trim()) data.unit = body.unit.trim();
    if (body.minQuantity !== undefined) {
      const min = Number(body.minQuantity);
      if (!Number.isFinite(min) || min < 0) {
        return jsonError(new Error("v"), "حداقل موجودی نامعتبر است", 400);
      }
      data.minQuantity = min;
    }
    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (Object.keys(data).length === 0) {
      return jsonError(new Error("v"), "چیزی برای ذخیره نیست", 400);
    }

    const updated = await db.material.update({ where: { id }, data });
    return NextResponse.json({ material: updated, message: "ماده به‌روزرسانی شد" });
  } catch (e) {
    return jsonError(e, "خطا در ویرایش ماده");
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const mat = await db.material.findUnique({
      where: { id },
      include: { _count: { select: { moves: true } } },
    });
    if (!mat) return jsonError(new Error("nf"), "ماده یافت نشد", 404);
    if (mat._count.moves > 0) {
      return jsonError(
        new Error("has-moves"),
        "این ماده گردش انبار دارد — به‌جای حذف، غیرفعالش کنید",
        409
      );
    }
    await db.material.delete({ where: { id } });
    return NextResponse.json({ message: "ماده حذف شد" });
  } catch (e) {
    return jsonError(e, "خطا در حذف ماده");
  }
}
