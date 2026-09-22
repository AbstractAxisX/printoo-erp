import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-error";
import { unsettledByCustomer, unsettledPerCurrencyByCustomer } from "@/lib/customer-debt";

// ─── GET /api/customers?search= — لیست + ماندهٔ زنده ────────────────────
// Phase 17-D: هر ردیف علاوه بر فیلدهای قبلی (سازگار با CRM/ویزارد) فیلدهای
// additive جدید دارد: address/city/province (از P17-PREP) + ordersCount +
// unsettled (محاسبهٔ زنده از سفارش‌ها — نه snapshot قدیمی balanceDue).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const where = search
      ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
      : {};

    const [customers, unsettled, unsettledPer] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { orders: true, deals: true, activities: true } },
        },
      }),
      unsettledByCustomer(),
      unsettledPerCurrencyByCustomer(), // فاز ۲۵: تفکیک ارزی
    ]);

    return NextResponse.json({
      customers: customers.map((c) => ({
        ...c,
        ordersCount: c._count.orders,
        unsettled: unsettled.get(c.id) ?? 0,
        // فاز ۲۵: مانده تفکیکی ارزی + mixed-flag (additive)
        unsettledPer: unsettledPer.get(c.id)?.per ?? null,
        unsettledMixed: unsettledPer.get(c.id)?.mixed ?? false,
      })),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت مشتریان");
  }
}

// ─── POST /api/customers — ثبت کامل مشتری (فرم ادمین) ──────────────────
// نام/تلفن/آدرس الزامی است (خواستهٔ کارفرما). ساختِ سریعِ بدون آدرس
// (ویزارد سفارش / CRM) → POST /api/customers/quick
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!name || !phone || !address) {
      return NextResponse.json(
        { error: "نام، شماره تلفن و آدرس الزامی است" },
        { status: 400 }
      );
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone,
        address,
        city: optionalText(body.city),
        province: optionalText(body.province),
        isFavorite: body.isFavorite === true,
        note: optionalText(body.note),
      },
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد مشتری");
  }
}

/** نرمال‌سازی متن اختیاری: trim؛ رشتهٔ خالی/غیرمتنی → null */
function optionalText(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}
