import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import { sumByCurrency, toIqdEquivalent } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";

// ─── Phase 15: دفتر درآمد — GET /api/revenues ──────────────────────
// هر تغییر «پرداخت‌شدهٔ» هر سفارش، ریز-به-ریز با تاریخ/ساعت دقیق،
// ماژول ثبت‌کننده (مالی/ادمین داخلی/لجستیک)، کارمند و تفاضل هوشمند.
// فیلترها: from/to (تاریخ ثبت)، orderId، module.
// دسترسی: مالی/مدیر (دادهٔ مالی است).

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isFinanceStaff(user) && user.role !== "master" && !user.modules.includes("admin")) {
    return NextResponse.json({ error: "دفتر دریافتی فقط برای واحد مالی قابل مشاهده است" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const orderId = searchParams.get("orderId");
    const modFilter = searchParams.get("module");
    const currency = searchParams.get("currency"); // فاز ۲۵: فیلتر ارزی

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (modFilter) where.module = modFilter;
    if (currency === "IQD" || currency === "USD" || currency === "IRT") where.currency = currency;
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const logs = await db.revenueLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            customer: { select: { id: true, name: true } },
          },
        },
        createdByUser: { select: { id: true, name: true } },
      },
    });

    // ── فاز ۲۵: جمع تفکیکی به ارز + معادل دیناری با نرخ لحظه‌ای ──
    let sums: { per: Record<string, number>; iqdEquivalent: number };
    try {
      const per = sumByCurrency(logs.map((l) => ({ amount: Math.abs(l.amount), currency: l.currency })));
      const rates = await getLiveRates();
      sums = { per: per as unknown as Record<string, number>, iqdEquivalent: toIqdEquivalent(per, rates) };
    } catch {
      const per = sumByCurrency(logs.map((l) => ({ amount: Math.abs(l.amount), currency: l.currency })));
      sums = { per: per as unknown as Record<string, number>, iqdEquivalent: 0 };
    }

    return NextResponse.json({ logs, sums });
  } catch (e) {
    return jsonError(e, "خطا در دریافت درآمدها");
  }
}
