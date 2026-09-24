import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { getLiveRates, setManualRates, clearManualRates } from "@/lib/fx";
import { jsonError } from "@/lib/api-error";
import { roundMoney, irtPerIqd } from "@/lib/money";

// ─── Phase 25.1: GET/POST /api/fx — نرخ ارز لحظه‌ای (بازار TGJU) ──
// GET  → نرخ‌ها + منبع + سن (هر کاربر لاگین‌شده — نمایش در کل سیستم)
// POST → { USD_IQD?, USD_IRT? } تنظیم دستی چسبنده | { clear } بازگشت به خودکار

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const rates = await getLiveRates();
    return NextResponse.json({
      rates: {
        USD_IQD: roundMoney(rates.USD_IQD, "IQD"),
        USD_IRT: roundMoney(rates.USD_IRT, "IRT"),
        IQD_IRT: irtPerIqd(rates), // ۱ دینار = X تومان
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
    // بازگشت به نرخ خودکار — حذف نرخ‌های دستی همان جفت‌ها
    if (body?.clear === "USD_IQD" || body?.clear === "USD_IRT" || body?.clear === "all") {
      const rates = await clearManualRates(body.clear);
      return NextResponse.json({
        ok: true,
        rates: {
          USD_IQD: roundMoney(rates.USD_IQD, "IQD"),
          USD_IRT: roundMoney(rates.USD_IRT, "IRT"),
          IQD_IRT: irtPerIqd(rates),
        },
        sources: rates.sources,
        ageHours: Math.round(rates.ageHours * 10) / 10,
      });
    }
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
        IQD_IRT: irtPerIqd(rates),
      },
      sources: rates.sources,
      ageHours: 0,
    });
  } catch (e) {
    return jsonError(e, "خطا در ثبت نرخ دستی");
  }
}
