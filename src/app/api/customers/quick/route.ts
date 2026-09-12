import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-error";

// ─── POST /api/customers/quick — ساخت سریع مشتری (Phase 17-D) ───────────
// مصرف‌کننده: ویزارد سفارش (جریان «مشتری جدید» وسط ثبت سفارش) و فرم
// سریع CRM. برخلاف POST /api/customers اینجا آدرس الزامی نیست تا جریان
// ویزارد نشکند؛ address/city/province/note اگر ارسال شوند پاس می‌شوند.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (!name || !phone) {
      return NextResponse.json(
        { error: "نام و شماره تلفن الزامی است" },
        { status: 400 }
      );
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone,
        address: optionalText(body.address),
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

function optionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}
