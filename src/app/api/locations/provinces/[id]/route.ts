import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// DELETE /api/locations/provinces/[id] — حذف استان (مدیریت)
//
// گاردها:
//   1. استانِ دارای شهر → ۴۰۹ (اول شهرها را حذف/منتقل کنید)
//   2. مشتری‌ای با province == نام استان → ۴۰۹ (فیلد متنی مشتری مرجع است)
// Cascade روی شهرها عمداً فعال نیست — حذف تصادفی کل شهرهای استان ریسک دارد.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireManager();
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  try {
    const province = await db.province.findUnique({
      where: { id },
      include: { _count: { select: { cities: true } } },
    });
    if (!province) {
      return NextResponse.json({ error: "استان یافت نشد" }, { status: 404 });
    }
    if (province._count.cities > 0) {
      return NextResponse.json(
        {
          error: `این استان ${province._count.cities} شهر ثبت‌شده دارد — ابتدا شهرهای آن را حذف کنید`,
        },
        { status: 409 }
      );
    }
    const customers = await db.customer.count({ where: { province: province.name } });
    if (customers > 0) {
      return NextResponse.json(
        {
          error: `${customers} مشتری با این استان ثبت شده‌اند — ابتدا استان مشتریان را تغییر دهید`,
        },
        { status: 409 }
      );
    }
    await db.province.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "حذف استان ناموفق");
  }
}
