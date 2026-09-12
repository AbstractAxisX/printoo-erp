import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// DELETE /api/locations/cities/[id] — حذف شهر (مدیریت)
//
// گارد: مشتری‌ای با city == نام شهر → ۴۰۹ (فیلد متنی مشتری مرجع است).
// (شهرهای هم‌نام در استان‌های دیگر مال خودشان‌اند — گارد فقط نام+استان را
// چک می‌کند تا حذف شهری در استان دیگر، مشتریان استان دیگر را نبندد.)

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireManager();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    const city = await db.city.findUnique({
      where: { id },
      include: { province: { select: { name: true } } },
    });
    if (!city) {
      return NextResponse.json({ error: "شهر یافت نشد" }, { status: 404 });
    }
    const customers = await db.customer.count({
      where: { city: city.name, province: city.province?.name },
    });
    if (customers > 0) {
      return NextResponse.json(
        {
          error: `${customers} مشتری با این شهر ثبت شده‌اند — ابتدا شهر مشتریان را تغییر دهید`,
        },
        { status: 409 }
      );
    }
    await db.city.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "حذف شهر ناموفق");
  }
}
