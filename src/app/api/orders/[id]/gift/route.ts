import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { logOrderEvent } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";

// ─── Phase 22 (خواستهٔ ۶): هدیه دادن سفارش ─────────────────────────
//
// POST /api/orders/[id]/gift
//   body: { amount?: number, percentage?: number, note?: string }
//
// سناریوی کارفرما (بازگویی):
//   «اگر بخوایم کاری رو هدیه کنیم… طبیعتا نباید مشتری بدهکار باشه و تو
//    هزینه‌های سایت بیاد (انگار از جیب ضرر دادیم) — میخوام توی دیتابیس
//    هزینه‌هاش باشه ولی نه به عنوان بدهکار. تخفیف رو ذکر کنه تو سوابق
//    مشتری، به درصد تخفیف و محاسبهٔ عددش.»
//
// منطق:
//   • amount یا percentage (یکی) — درصد روی مبلغ خام (total + هدیهٔ قبلی)
//     حساب می‌شود؛ هدیهٔ دوم، اولی را «جایگزین» می‌کند نه جمع‌کردن.
//   • order.totalAmount -= giftAmount → بدهی/بستانکار همان لحظه صفر/کم می‌شود.
//   • هزینه‌های واقعی سفارش دست نمی‌خورند → سود سفارش (قیمت − هزینه)
//     منفی می‌شود = زیان، همان‌جا جلوی چشم رئیس است (رادار: زیان‌ده‌ها).
//   • OrderEvent حساس + Activity مشتری (سوابق مشتری) با «درصد + عدد» ثبت
//     می‌شود تا پروندهٔ مشتری همیشه هدیه را نشان دهد.
//   • اگر فاکتور فعال باشد: تخفیف فاکتور به‌روز می‌شود و total سفارش از
//     روی همان سند سینک می‌ماند (خواستهٔ ۱۰).
//
// دسترسی: مستر یا واحد مالی (تصمیم مالی — نه ادمین داخلی، نه طراح/چاپ).

type GiftBody = {
  amount?: number;
  percentage?: number;
  note?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isFinanceStaff(user)) {
    return NextResponse.json(
      { error: "هدیه دادن سفارش فقط توسط مدیر ارشد یا واحد مالی انجام می‌شود" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = (await req.json()) as GiftBody;

    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        paidAmount: true,
        giftAmount: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
        items: { select: { totalAmount: true } },
        invoice: { select: { id: true, status: true, subtotal: true, discountAmount: true, taxRate: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // مبلغ خام سفارش = جمع اقلام (اگر فاکتور فعال است همان subtotal
    // فاکتور) — مبنای درصدِ هدیه. توجه: هدیهٔ قبلی روی «total» نشسته،
    // نه روی اقلام — پس برای درصدِ درستِ هدیهٔ مجدد، itemsSum به‌تنهایی
    // مبلغ خام است (جمع‌کردن هدیهٔ قبلی با itemsSum درصد را متورم می‌کند).
    const itemsSum = order.items.reduce((s, it) => s + (it.totalAmount || 0), 0);
    const activeInvoice =
      order.invoice && order.invoice.status !== "cancelled" ? order.invoice : null;
    const rawTotal = activeInvoice ? activeInvoice.subtotal : itemsSum;

    const hasAmount =
      typeof body.amount === "number" && Number.isFinite(body.amount);
    const hasPct =
      typeof body.percentage === "number" && Number.isFinite(body.percentage);

    if (!hasAmount && !hasPct) {
      return NextResponse.json(
        { error: "مبلغ یا درصد هدیه را مشخص کنید" },
        { status: 400 }
      );
    }

    let giftAmount: number;
    let giftPercentage: number;
    if (hasPct) {
      giftPercentage = Math.min(100, Math.max(0, body.percentage!));
      giftAmount = Math.round((rawTotal * giftPercentage) / 100);
    } else {
      giftAmount = Math.round(Math.min(Math.max(0, body.amount!), rawTotal));
      giftPercentage = rawTotal > 0
        ? Math.round((giftAmount / rawTotal) * 10000) / 100
        : 100;
    }

    const note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (giftAmount <= 0) {
      return NextResponse.json(
        { error: "مبلغ هدیه باید بزرگ‌تر از صفر باشد" },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      let newTotal: number;

      if (activeInvoice) {
        // فاکتور فعال: تخفیف سند = تخفیف قبلی − هدیهٔ قبلیِ سند + هدیهٔ جدید
        // (invoice.discountAmount به‌روز می‌شود تا total سند همیشه درست باشد)
        const prevGiftInDoc = Math.min(order.giftAmount, activeInvoice.discountAmount);
        const newDiscount = Math.min(
          activeInvoice.subtotal,
          Math.max(0, activeInvoice.discountAmount - prevGiftInDoc + giftAmount),
        );
        const taxAmount = Math.round(
          (activeInvoice.subtotal - newDiscount) * (activeInvoice.taxRate / 100)
        );
        const invTotal = Math.round(activeInvoice.subtotal - newDiscount + taxAmount);
        await tx.invoice.update({
          where: { id: activeInvoice.id },
          data: {
            discountAmount: newDiscount,
            taxAmount,
            totalAmount: invTotal,
          },
        });
        newTotal = invTotal;
      } else {
        // بدون فاکتور: مستقیم روی سفارش
        newTotal = Math.max(0, rawTotal - giftAmount);
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          totalAmount: newTotal,
          giftAmount,
          giftPercentage,
          giftNote: note,
          giftedAt: new Date(),
          giftedByName: user.name,
        },
      });

      // سوابق مشتری (خواستهٔ ۶): هدیه با درصد و عدد در Activity ذکر می‌شود
      await tx.activity.create({
        data: {
          type: "note",
          title: `هدیه — سفارش #${order.number}`,
          description: `تخفیف ${giftPercentage.toLocaleString("fa-IR")}٪ معادل ${giftAmount.toLocaleString("fa-IR")} دینار روی سفارش #${order.number} بخشیده شد.${note ? ` (${note})` : ""}`,
          customerId: order.customerId,
          date: new Date(),
        },
      });

      return updated;
    });

    // رویداد سفارش — حساس (ادمین داخلی نمی‌بیند)
    await logOrderEvent(db, {
      orderId: id,
      type: "gifted",
      stage: "finance",
      actorId: user.id,
      actorName: user.name,
      title: "هدیه ثبت شد",
      description: `تخفیف ${giftPercentage.toLocaleString("fa-IR")}٪ = ${giftAmount.toLocaleString("en-US")} دینار — مانده سفارش: ${result.totalAmount.toLocaleString("en-US")} دینار${note ? ` — ${note}` : ""}`,
      sensitive: true,
    });

    return NextResponse.json({
      order: result,
      gift: { amount: giftAmount, percentage: giftPercentage, newTotal: result.totalAmount },
    });
  } catch (e) {
    return jsonError(e, "خطا در ثبت هدیه");
  }
}
