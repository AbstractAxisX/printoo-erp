import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { getLiveRates, setManualRates } from "@/lib/fx";
import { jsonError } from "@/lib/api-error";
import { roundMoney, iqdPerIrt } from "@/lib/money";

// ─── Phase 25: GET/POST /api/fx — نرخ ارز لحظه‌ای ───────────────
// GET  → نرخ‌ها + منبع + سن (هر کاربر لاگین‌شده — نمایش در کل سیستم)
// POST → تنظیم دستی نرخ (فقط مالی/مستر) { USD_IQD?, USD_IRT? }

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const rates = await getLiveRates();
    return NextResponse.json({
      rates: {
        USD_IQD: roundMoney(rates.USD_IQD, "IQD"),
        USD_IRT: roundMoney(rates.USD_IRT, "IRT"),
        IQD_IRT: iqdPerIrt(rates), // 1 تومان = X دینار
      },
      sources: rates.sources,
      fetchedAt: rates.fetchedAt,
      ageHours: Math.round(rates.ageHours * 10) / 10,
      stale: rates.stale,
      canEdit: user.role === "master" || isFinanceStaff(user),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت نرخ ارز");
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (user.role !== "master" && !isFinanceStaff(user)) {
    return NextResponse.json({ error: "تنظیم دستی نرخ فقط توسط واحد مالی" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const USD_IQD = body.USD_IQD != null ? Number(body.USD_IQD) : undefined;
    const USD_IRT = body.USD_IRT != null ? Number(body.USD_IRT) : undefined;
    if (
      (USD_IQD != null && (!Number.isFinite(USD_IQD) || USD_IQD <= 0)) ||
      (USD_IRT != null && (!Number.isFinite(USD_IRT) || USD_IRT <= 0))
    ) {
      return NextResponse.json({ error: "نرخ باید عددی بزرگ‌تر از صفر باشد" }, { status: 400 });
    }
    const rates = await setManualRates({ USD_IQD, USD_IRT });
    return NextResponse.json({
      ok: true,
      rates: {
        USD_IQD: roundMoney(rates.USD_IQD, "IQD"),
        USD_IRT: roundMoney(rates.USD_IRT, "IRT"),
        IQD_IRT: iqdPerIrt(rates),
      },
      sources: rates.sources,
      ageHours: 0,
    });
  } catch (e) {
    return jsonError(e, "خطا در ثبت نرخ دستی");
  }
}
