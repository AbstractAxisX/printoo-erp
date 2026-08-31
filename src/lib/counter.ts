import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// ─── Atomic, self-healing document numbering ─────────────────────────
//
// چرا این فایل وجود دارد؟
// شمارهٔ سفارش/پیش‌فاکتور/فاکتور «@unique» است و از جدول Counter گرفته
// می‌شود. نسخه‌های قبلی در اولین اجرا ردیف شمارنده را با next=1 می‌ساختند؛
// اگر دیتابیس از قبل ردیفی با همان شماره داشت (دیتای واقعی کاربر!)
// ساخت سند بعدی همیشه با خطای Unique Constraint (P2002) شکست می‌خورد —
// دقیقاً باگ «خطا در ساخت سفارش» روی ماشین محلی.
//
// دو لایهٔ دفاعی:
//  ۱) ensureCounters() — قبل از تراکنش صدا زده می‌شود؛ شمارندهٔ غایب را
//     با max موجود و شمارندهٔ «عقب‌مانده» را به max موجود ترمیم می‌کند.
//  ۲) nextNumber() — حتی اگر شمارنده خراب باشد، شمارهٔ اشغال‌شده را
//     رد می‌کند و آن‌قدر جلو می‌رود تا به شمارهٔ آزاد برسد.
//
// هر دو لایه idempotent هستند و در sandbox (شمارندهٔ سالم) هیچ رفتار
// جدیدی ندارند — فقط در دیتابیس‌های ناهمگام خودشان را نشان می‌دهند.

export type CounterModel = "order" | "preInvoice" | "invoice";

/** آیا شمارهٔ n قبلاً روی یک سند واقعی ثبت شده؟ */
async function isNumberTaken(
  tx: Prisma.TransactionClient,
  model: CounterModel,
  n: number
): Promise<boolean> {
  if (model === "order") {
    return !!(await tx.order.findFirst({ where: { number: n }, select: { id: true } }));
  }
  if (model === "preInvoice") {
    return !!(await tx.preInvoice.findFirst({ where: { number: n }, select: { id: true } }));
  }
  return !!(await tx.invoice.findFirst({ where: { number: n }, select: { id: true } }));
}

/**
 * شمارهٔ بعدی — اتمیک (تک UPDATE) + مقاوم در برابر شمارندهٔ خراب.
 * حتماً داخل db.$transaction صدا زده شود.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  model: CounterModel
): Promise<number> {
  let counter = await tx.counter.upsert({
    where: { id: model },
    update: { next: { increment: 1 } },
    create: { id: model, next: 1 },
  });

  // لایهٔ دفاعی ۲: شمارندهٔ کهنه/خراب ممکن است شمارهٔ تکراری بدهد؛
  // آن‌قدر جلو برو تا شمارهٔ واقعاً آزاد پیدا شود (سقف ۱۰٬۰۰۰ برای اطمینان).
  let guard = 0;
  while (guard < 10000 && (await isNumberTaken(tx, model, counter.next))) {
    guard += 1;
    counter = await tx.counter.update({
      where: { id: model },
      data: { next: { increment: 1 } },
    });
  }
  return counter.next;
}

let countersEnsured = false;

/**
 * لایهٔ دفاعی ۱ — ترمیم شمارنده‌ها بر اساس max موجود (یک‌بار در هر پروسه).
 * قبل از شروع تراکنشِ ساخت سند صدا زده شود. اگر جدول هنوز ساخته نشده
 * باشد بی‌صدا رد می‌شود و دفعهٔ بعد دوباره تلاش می‌کند.
 */
export async function ensureCounters(): Promise<void> {
  if (countersEnsured) return;
  countersEnsured = true;
  try {
    const [maxOrder, maxPre, maxInv] = await Promise.all([
      db.order.aggregate({ _max: { number: true } }),
      db.preInvoice.aggregate({ _max: { number: true } }),
      db.invoice.aggregate({ _max: { number: true } }),
    ]);
    const targets: [CounterModel, number][] = [
      ["order", maxOrder._max.number ?? 0],
      ["preInvoice", maxPre._max.number ?? 0],
      ["invoice", maxInv._max.number ?? 0],
    ];
    for (const [id, max] of targets) {
      const row = await db.counter.findUnique({ where: { id } });
      // غایب → بساز با max؛ موجود ولی عقب‌مانده (دیتای واقعی جلوتر است) → ترمیم.
      // توجه: next=max است نه max+1، چون nextNumber ابتدا increment می‌کند.
      if (!row || row.next < max) {
        await db.counter.upsert({
          where: { id },
          update: { next: max },
          create: { id, next: max },
        });
      }
    }
  } catch {
    // جدول Counter هنوز push نشده — nextNumber با شاخهٔ create خودش را دارد
    countersEnsured = false;
  }
}
