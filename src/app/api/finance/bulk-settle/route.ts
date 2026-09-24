import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { applyPaidAmountChange, inferRevenueModule } from "@/lib/paid-sync";
import { logOrderEvent, actorNameOf } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";
import { formatMoney, CURRENCIES, type Currency } from "@/lib/money";
import { getLiveRates } from "@/lib/fx";

// ─── Phase 26: تسویه گروهی — POST /api/finance/bulk-settle ──────────
//
// مشتری چند سفارش بدهکار دارد و یک موج پرداخت می‌کند؛ به‌جای باز کردن
// تک‌تک سفارش‌ها، مبلغ دریافتی را یک‌بار وارد می‌کنیم و سیستم آن را
// روی سفارش‌های باز همان ارز تخصیص می‌دهد.
//
//   body: {
//     customerId  : string            (الزامی)
//     currency    : "IQD"|"USD"|"IRT" (الزامی — ارز وجه دریافتی)
//     amount      : number > 0        (الزامی — مبلغ دریافتی کل)
//     method      ?: "cash"|"transfer"|"cheque"
//     note        ?: string
//     allocations ?: [{ orderId: string, amount: number }]   // تخصیص دستی
//   }
//
// قواعد امنیتی (سرور همیشه مرجع است — عدد کلاینت فقط «پیشنهاد» است):
//   1) ماندهٔ هر سفارش «الان» از DB خوانده می‌شود؛ تخصیص هر ردیف به
//      [0, ماندهٔ تازه] کلمپ می‌شود (پرداخت هم‌زمانِ کاربر دیگر → ردیف
//      صفر می‌شود و رد می‌شود، نه اینکه بدهی منفی شود).
//   2) بدون allocations → FIFO قدیمی‌ترین‌اول (createdAt asc).
//   3) Σ تخصیص هرگز از amount بیشتر نمی‌شود (از انتهای لیست کلمپ می‌شود)
//      و هرگز از Σ بدهی بیشتر نمی‌شود؛ مازاد = «excess» در پاسخ
//      گزارش می‌شود و ثبت نمی‌شود (بدهی هرگز منفی نمی‌شود).
//   4) فقط سفارش‌های همان ارزِ وجه — ارزهای دیگر دست‌نخورده می‌مانند
//      (دفتر ارزی هر سفارش با ارز دریافتی‌اش هم‌عدد بماند).
//   5) هر ردیف از همان applyPaidAmountChange موجود رد می‌شود →
//      RevenueLog + توزیع پیش‌فاکتور + آینهٔ فاکتور + رویداد حساس؛
//      یعنی صفر مسیر حسابداری جدید.
//   6) همه‌چیز در یک db.$transaction — یا همهٔ ردیف‌ها یا هیچ‌کدام.
//
// دسترسی: مستر، مالی، مدیر، انبار (همان قاعدهٔ ثبت دریافتی تک‌سفارش).

async function canRecord(user: { role: string; modules: string[] }) {
  return (
    user.role === "master" ||
    user.modules.includes("finance") ||
    user.modules.includes("admin") ||
    user.modules.includes("warehouse")
  );
}

const VALID_CURRENCIES = new Set(["IQD", "USD", "IRT"]);
const VALID_METHODS = new Set(["cash", "transfer", "cheque"]);

type AppliedRow = {
  orderId: string;
  number: number;
  applied: number;
  paidAfter: number;
  remainingAfter: number;
  fullySettled: boolean;
};

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!(await canRecord(user))) {
    return NextResponse.json(
      { error: "تسویه گروهی فقط توسط مالی، مدیر یا لجستیک انجام می‌شود" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      customerId,
      currency,
      amount,
      method,
      note,
      allocations,
    } = body ?? {};

    // ── اعتبارسنجی ورودی خام ──
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "انتخاب مشتری الزامی است" }, { status: 400 });
    }
    if (typeof currency !== "string" || !VALID_CURRENCIES.has(currency)) {
      return NextResponse.json({ error: "ارز نامعتبر است (IQD | USD | IRT)" }, { status: 400 });
    }
    const payAmount = Number(amount);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return NextResponse.json(
        { error: "مبلغ دریافتی باید عددی بزرگ‌تر از صفر باشد" },
        { status: 400 }
      );
    }
    const payMethod =
      typeof method === "string" && VALID_METHODS.has(method) ? method : null;
    const payNote =
      typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;

    // ── مشتری + سفارش‌های باز همان ارز (مرجع: DB تازه) ──
    const [customer, openOrders] = await Promise.all([
      db.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true },
      }),
      db.order.findMany({
        where: {
          customerId,
          status: { not: "cancelled" },
          currency,
        },
        select: {
          id: true,
          number: true,
          paidAmount: true,
          totalAmount: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { number: "asc" }],
      }),
    ]);
    if (!customer) {
      return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
    }
    const open = openOrders.filter((o) => o.totalAmount - o.paidAmount > 0.001);
    if (open.length === 0) {
      return NextResponse.json(
        {
          error: `این مشتری بدهی باز به ${CURRENCIES[currency as Currency].fa} ندارد (شاید بدهی‌اش ارز دیگری است)`,
        },
        { status: 409 }
      );
    }
    const openIds = new Set(open.map((o) => o.id));

    // ── ساخت برنامهٔ تخصیص (سروری) ──
    // want: orderId → مبلغ پیشنهادی (قبل از کلمپ تراکنشی)
    const want = new Map<string, number>();
    const hasAllocations = Array.isArray(allocations) && allocations.length > 0;
    if (hasAllocations) {
      // تخصیص دستی کلاینت — فقط سفارش‌های معتبرِ همین مجموعه
      for (const a of allocations) {
        if (!a || typeof a.orderId !== "string" || !openIds.has(a.orderId)) continue;
        const v = Number(a.amount);
        if (!Number.isFinite(v) || v <= 0) continue;
        want.set(a.orderId, (want.get(a.orderId) ?? 0) + v);
      }
      // Σ تخصیص نباید از مبلغ دریافتی بیشتر شود → از انتهای لیست کم کن
      let sumWant = 0;
      for (const v of want.values()) sumWant += v;
      if (sumWant > payAmount) {
        // ردیف‌های آخر را اول کم می‌کنیم (نیت کاربر روی ردیف‌های اول حفظ می‌شود)
        const ids = [...want.keys()];
        for (let i = ids.length - 1; i >= 0 && sumWant > payAmount + 0.001; i--) {
          const id = ids[i];
          const over = sumWant - payAmount;
          const v = want.get(id)!;
          const cut = Math.min(v, over);
          if (v - cut <= 0.001) want.delete(id);
          else want.set(id, v - cut);
          sumWant -= cut;
        }
      }
    } else {
      // FIFO خودکار: قدیمی‌ترین‌اول تا مبلغ دریافتی یا پُرشدن بدهی
      let remainingMoney = payAmount;
      for (const o of open) {
        if (remainingMoney <= 0.001) break;
        const rem = o.totalAmount - o.paidAmount;
        const give = Math.min(rem, remainingMoney);
        if (give > 0.001) {
          want.set(o.id, give);
          remainingMoney -= give;
        }
      }
    }
    if (want.size === 0) {
      return NextResponse.json(
        { error: "برنامهٔ تخصیص خالی است — مبلغ یا ردیف‌های انتخابی را بررسی کنید" },
        { status: 400 }
      );
    }

    // ── اجرای اتمیک ──
    const actorName = (await actorNameOf(user.id)) ?? user.name;
    const revModule = inferRevenueModule(user);
    const bulkNote = payNote ? `تسویه گروهی — ${payNote}` : "تسویه گروهی";

    const { applied, events } = await db.$transaction(async (tx) => {
      const applied: AppliedRow[] = [];
      const events: { orderId: string; number: number; applied: number; paidAfter: number }[] = [];
      // ترتیب پایدار: به ترتیب زمان ایجاد سفارش
      const ordered = open.filter((o) => want.has(o.id));
      for (const o of ordered) {
        // ماندهٔ تازه داخل تراکنش (محافظ از ثبت هم‌زمان)
        const fresh = await tx.order.findUnique({
          where: { id: o.id },
          select: { paidAmount: true, totalAmount: true, status: true },
        });
        if (!fresh || fresh.status === "cancelled") continue;
        const freshRem = Math.max(0, fresh.totalAmount - fresh.paidAmount);
        const give = Math.min(want.get(o.id)!, freshRem);
        if (give <= 0.001) continue;

        const res = await applyPaidAmountChange(tx, {
          orderId: o.id,
          newPaid: fresh.paidAmount + give,
          actor: {
            userId: user.id,
            userName: actorName,
            module: revModule,
            method: payMethod,
            note: bulkNote,
          },
        });
        const remainingAfter = Math.max(
          0,
          Math.round((fresh.totalAmount - res.totalAfter) * 100) / 100
        );
        applied.push({
          orderId: o.id,
          number: o.number,
          applied: Math.round(give * 100) / 100,
          paidAfter: res.totalAfter,
          remainingAfter,
          fullySettled: remainingAfter <= 0.001,
        });
        events.push({
          orderId: o.id,
          number: o.number,
          applied: Math.round(give * 100) / 100,
          paidAfter: res.totalAfter,
        });
      }
      return { applied, events };
    });

    if (applied.length === 0) {
      return NextResponse.json(
        {
          error:
            "هیچ ردیفی قابل تخصیص نبود — ماندهٔ سفارش‌ها همین حالا تغییر کرده است؛ صفحه را رفرش کنید",
        },
        { status: 409 }
      );
    }

    // ── رویدادهای حساس (بعد از commit — همان الگوی ثبت تک‌پرداخت) ──
    for (const ev of events) {
      await logOrderEvent(db, {
        orderId: ev.orderId,
        type: "payment_recorded",
        stage: "finance",
        actorId: user.id,
        actorName,
        title: "پرداخت مشتری ثبت شد (تسویه گروهی)",
        description: `تخصیص از پرداخت جمعی: ${formatMoney(
          ev.applied,
          currency
        )} — کل پرداخت‌شدهٔ سفارش #${ev.number}: ${formatMoney(ev.paidAfter, currency)}`,
        sensitive: true,
      });
    }

    // ── بدهی تازهٔ مشتری (همهٔ ارزها) برای گزارش ──
    const [freshOrders, rates] = await Promise.all([
      db.order.findMany({
        where: { customerId, status: { notIn: ["cancelled"] } },
        select: { totalAmount: true, paidAmount: true, currency: true },
      }),
      getLiveRates(),
    ]);
    const remainingDebtPer: Record<Currency, number> = { IQD: 0, USD: 0, IRT: 0 };
    for (const o of freshOrders) {
      const due = Math.max(0, o.totalAmount - o.paidAmount);
      if (due <= 0) continue;
      const cur = (o.currency === "USD" || o.currency === "IRT" ? o.currency : "IQD") as Currency;
      remainingDebtPer[cur] += due;
    }
    const remainingDebtIqdEq =
      Math.round(
        (remainingDebtPer.IQD +
          remainingDebtPer.USD * rates.USD_IQD +
          remainingDebtPer.IRT / rates.USD_IRT) *
          100
      ) / 100;

    const totalApplied = Math.round(applied.reduce((s, r) => s + r.applied, 0) * 100) / 100;
    const excess = Math.round((payAmount - totalApplied) * 100) / 100;

    return NextResponse.json(
      {
        ok: true,
        customer: { id: customer.id, name: customer.name },
        currency,
        requestedAmount: payAmount,
        totalApplied,
        excess: excess > 0.001 ? excess : 0,
        applied,
        remainingDebtPer,
        remainingDebtIqdEq,
      },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در تسویه گروهی");
  }
}
