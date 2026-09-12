import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireManager } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 18: جغرافیا — استان/شهر (فهرست مجاز دراپ‌داون مشتریان) ──
//
// GET  /api/locations → { provinces: [{id,name,cityCount}], cities: [{id,name,provinceId}] }
//        (همهٔ کاربران لاگین‌شده — دراپ‌داون فرم مشتری)
// POST /api/locations → { kind: "province", name } | { kind: "city", name, provinceId }
//        (مدیریت — مدیر داخلی/مستر)
//
// DELETE → /api/locations/provinces/[id] و /api/locations/cities/[id]

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const [provinces, cities] = await Promise.all([
      db.province.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { cities: true } } },
      }),
      db.city.findMany({
        orderBy: [{ province: { name: "asc" } }, { name: "asc" }],
        include: { province: { select: { name: true } } },
      }),
    ]);
    return NextResponse.json({
      provinces: provinces.map((p) => ({
        id: p.id,
        name: p.name,
        cityCount: p._count.cities,
        createdAt: p.createdAt,
      })),
      cities: cities.map((c) => ({
        id: c.id,
        name: c.name,
        provinceId: c.provinceId,
        provinceName: c.province?.name ?? "",
        createdAt: c.createdAt,
      })),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت شهرها و استان‌ها");
  }
}

export async function POST(req: NextRequest) {
  // ثبت استان/شهر = عملیات مدیریتی (صفحهٔ مدیریت در ادمین داخلی است)
  const user = await requireManager();
  if (user instanceof NextResponse) return user;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const kind = typeof body.kind === "string" ? body.kind : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "نام الزامی است" },
        { status: 400 }
      );
    }

    if (kind === "province") {
      const exists = await db.province.findUnique({ where: { name } });
      if (exists) {
        return NextResponse.json(
          { error: `استان «${name}» قبلاً ثبت شده است` },
          { status: 409 }
        );
      }
      const province = await db.province.create({ data: { name } });
      return NextResponse.json({ province }, { status: 201 });
    }

    if (kind === "city") {
      const provinceId = typeof body.provinceId === "string" ? body.provinceId : "";
      if (!provinceId) {
        return NextResponse.json(
          { error: "انتخاب استان برای شهر الزامی است" },
          { status: 400 }
        );
      }
      const province = await db.province.findUnique({ where: { id: provinceId } });
      if (!province) {
        return NextResponse.json(
          { error: "استان انتخاب‌شده موجود نیست — صفحه را رفرش کنید" },
          { status: 400 }
        );
      }
      const exists = await db.city.findFirst({ where: { name, provinceId } });
      if (exists) {
        return NextResponse.json(
          { error: `شهر «${name}» در استان «${province.name}» قبلاً ثبت شده است` },
          { status: 409 }
        );
      }
      const city = await db.city.create({ data: { name, provinceId } });
      return NextResponse.json({ city }, { status: 201 });
    }

    return NextResponse.json({ error: "نوع ثبت نامعتبر است (province | city)" }, { status: 400 });
  } catch (e) {
    return jsonError(e, "خطا در ثبت شهر/استان");
  }
}
