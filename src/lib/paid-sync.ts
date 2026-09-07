// Printoo24 ERP — paid-amount synchronization (Phase 11)
//
// مدل پول «آینه‌ای» — یک منبع حقیقت: order.paidAmount (کل دریافتی).
//
//   • order.paidAmount  = کل دریافتی مشتری برای سفارش (منبع حقیقت)
//   • PreInvoice.paidAmount = نمایشِ همان کل روی سند (توزیع پله‌ای با سقفِ
//     مبلغ همان سند) — «اگر توی فاکتور مبلغ پرداختی ادیت شود، تو
//     پیش‌فاکتور هم سینک شود» (خواستهٔ صریح کاربر).
//   • Invoice.paidAmount = نمایشِ همان کل روی فاکتور نهایی (سقفِ total).
//
// قواعد:
//   ۱) تغییر paid فاکتور (POST/PUT/PATCH paid) → order.paid مقدار جدید می‌شود
//      و مبلغ PIs از نو توزیع می‌شود (redistributePiPaid).
//   ۲) تغییر paid پیش‌فاکتور (PUT/POST) → delta روی order.paid و اگر
//      فاکتور صادرشده (غیر cancelled) باشد، آینه می‌شود (mirrorInvoicePaid).
//   ۳) ابطال/حذف فاکتور → order.paid به حالت «پیش از فاکتور» برمی‌گردد
//      (Σ paid پیش‌فاکتورهای همان سفارش).
//
// همهٔ توابع tx می‌گیرند تا داخل تراکنشِ route فراخوانی شوند.

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * توزیع پله‌ای «کل دریافتی» روی پیش‌فاکتورهای سفارش:
 * سندها به ترتیب شماره پر می‌شوند (هر سند حداکثر تا total خودش).
 * باقی‌ماندهٔ بیشتر از Σ total سندها نادیده گرفته می‌شود.
 */
export async function redistributePiPaid(tx: Tx, orderId: string, total: number): Promise<void> {
  const pis = await tx.preInvoice.findMany({
    where: { orderId },
    orderBy: { number: "asc" },
    select: { id: true, totalAmount: true, paidAmount: true },
  });
  let remaining = Math.max(0, Math.round(total) || 0);
  for (const pi of pis) {
    const newPaid = Math.min(remaining, pi.totalAmount);
    if (Math.abs(newPaid - pi.paidAmount) > 0.001) {
      await tx.preInvoice.update({
        where: { id: pi.id },
        data: { paidAmount: newPaid },
      });
    }
    remaining -= newPaid;
  }
}

/**
 * آینه‌کردن کل دریافتی سفارش روی فاکتور نهایی (اگر صادر شده و باطل نیست).
 * فاکتور cancelled دیگر آینه نیست (پول از پیش‌فاکتورها می‌آید).
 */
export async function mirrorInvoicePaid(tx: Tx, orderId: string): Promise<void> {
  const [order, invoice] = await Promise.all([
    tx.order.findUnique({ where: { id: orderId }, select: { paidAmount: true } }),
    tx.invoice.findUnique({
      where: { orderId },
      select: { id: true, paidAmount: true, totalAmount: true, status: true },
    }),
  ]);
  if (!order || !invoice || invoice.status === "cancelled") return;
  const target = Math.min(order.paidAmount, invoice.totalAmount);
  if (Math.abs(target - invoice.paidAmount) > 0.001) {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: target },
    });
  }
}

// ─── Phase 15: تغییر متمرکز مبلغ پرداخت‌شده + دفتر درآمد ──────────
// applyPaidAmountChange — تنها نقطهٔ تغییرِ order.paidAmount:
//   ۱) diff هوشمند = newPaid − current (ادیت ۱۰۰۰→۶۰۰۰ → درآمد جدید ۵۰۰۰)
//   ۲) order.paidAmount = newPaid
//   ۳) RevenueLog با (amount=diff, totalAfter, module, کارمند, زمان)
//   ۴) redistributePiPaid + mirrorInvoicePaid → سند‌ها همیشه هم‌عدد
// فراخوانی از: PUT/POST/DELETE پیش‌فاکتور، PUT/POST/صدور فاکتور،
// ثبت درآمد مالی، دریافت نقدی لجستیک.
export type PaidChangeActor = {
  userId: string | null;
  userName: string | null;
  /** ماژولی که عدد را زد — برای لاگ درآمد */
  module: "finance" | "admin" | "logistics" | "other";
  method?: string | null;
  note?: string | null;
};

export async function applyPaidAmountChange(
  tx: Tx,
  args: {
    orderId: string;
    newPaid: number;
    actor: PaidChangeActor;
    /** skipLog: تغییرات بازسازی (recompute) لاگ نمی‌شوند */
    skipLog?: boolean;
  }
): Promise<{ diff: number; totalAfter: number }> {
  const clamped = Math.max(0, Math.round(args.newPaid * 100) / 100);
  const order = await tx.order.findUnique({
    where: { id: args.orderId },
    select: { paidAmount: true },
  });
  const current = order?.paidAmount ?? 0;
  const diff = Math.round((clamped - current) * 100) / 100;

  await tx.order.update({ where: { id: args.orderId }, data: { paidAmount: clamped } });
  await redistributePiPaid(tx, args.orderId, clamped);
  await mirrorInvoicePaid(tx, args.orderId);

  // دفتر درآمد — فقط تغییر واقعیِ اعمال‌شده توسط کاربر لاگ می‌شود
  if (!args.skipLog && Math.abs(diff) > 0.001) {
    try {
      await tx.revenueLog.create({
        data: {
          orderId: args.orderId,
          amount: diff,
          totalAfter: clamped,
          module: args.actor.module,
          method: args.actor.method ?? null,
          note: args.actor.note ?? null,
          createdById: args.actor.userId,
          createdByName: args.actor.userName,
        },
      });
    } catch (e) {
      console.error("[revenue-log] failed:", e);
    }
  }
  return { diff, totalAfter: clamped };
}

/** ماژولِ ثبت‌کنندهٔ درآمد از روی ماژول‌های کاربر استنباط می‌شود. */
export function inferRevenueModule(
  user: { role: string; modules: string[] }
): "finance" | "admin" | "logistics" | "other" {
  if (user.role === "master" || user.modules.includes("admin")) return "admin";
  if (user.modules.includes("finance")) return "finance";
  if (user.modules.includes("warehouse")) return "logistics";
  return "other";
}

/**
 * حالت «پیش از فاکتور»: کل دریافتی = Σ paid همهٔ پیش‌فاکتورهای سفارش
 * (شامل converted — پولی که واقعاً دریافت شده است). برای ابطال/حذف فاکتور.
 */
export async function recomputeOrderPaidFromPIs(tx: Tx, orderId: string): Promise<void> {
  const agg = await tx.preInvoice.aggregate({
    where: { orderId },
    _sum: { paidAmount: true },
  });
  const total = agg._sum.paidAmount ?? 0;
  await tx.order.update({ where: { id: orderId }, data: { paidAmount: total } });
}
