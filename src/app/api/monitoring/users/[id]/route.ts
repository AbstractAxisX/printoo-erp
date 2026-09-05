import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isManager } from "@/lib/access";
import { clampRange, monitorUserDetail } from "@/lib/monitoring";
import { jsonError } from "@/lib/api-error";

// ─── GET /api/monitoring/users/[id]?from=&to= — صفحهٔ اختصاصی کاربر ──
//
// دسترسی: مستر/مدیر داخلی (هر کاربری) + خودِ کاربر (مانیتورینگ خودش —
// خواستهٔ صریح: «حتی مانیترینگ خودشونم اشکال نداره ببینن»).
// پاسخ: پروفایل + KPI بازه + گزارش امروز + خط زمانی + چارت سری +
// اوورویو تاخیر (سفارش و تسک) + مرخصی‌ها + سفارش‌های باز.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  if (!isManager(user) && user.id !== id) {
    return NextResponse.json(
      { error: "شما فقط مانیتورینگ خودتان را می‌بینید" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const range = clampRange({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    const report = await monitorUserDetail(id, range);
    if (!report) {
      return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (e) {
    return jsonError(e, "خطا در مانیتورینگ کاربر");
  }
}
