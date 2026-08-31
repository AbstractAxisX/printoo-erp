// Printoo24 ERP — Order workflow engine (Phase 9)
//
// منبع واحد حقیقت برای «گردش کار سفارش» — به‌ویژه سفارش‌های گروهی.
//
// قاعدهٔ اصلی (خواستهٔ صریح کاربر):
//   سفارش گروهی = یک سفارش با چند آیتم که «با هم» جلو می‌روند.
//   طراح فقط آیتم‌های stage=design را می‌بیند و یکی‌یکی تکمیل می‌کند؛
//   تا آخرین آیتم طراحی تکمیل نشده، سفارش به چاپ نمی‌رود و هیچ ماژول
//   دیگری (حتی چاپ، حتی اگر آیتم‌های چاپیِ داخلش آماده باشند) حق کار
//   روی آن سفارش را ندارد. پس از اتمام طراحیِ همه، سفارش خودکار به
//   in_printing می‌رود؛ چاپ همین منطق را برای warehouse تکرار می‌کند.
//
//   سفارش تفکیک‌شده (separated) = هر آیتم یک سفارش تک‌آیتمی است؛
//   همان موتور، بدون تغییر، برایش کار می‌کند (تکمیل تنها آیتم =
//   انتقال سفارش).
//
// اصول:
//   ۱. aggregateStatus(items) — وضعیت موثر سفارش = پایین‌ترین مرحلهٔ
//      فعالِ آیتم‌ها (design < print < warehouse < completed).
//   ۲. recomputeOrderStatus(tx, orderId) — بعد از هر تغییر stage آیتم،
//      وضعیت سفارش بازمحاسبه می‌شود + نوتیفیکیشن انتقال.
//   ۳. وضعیت‌های دستیِ پایانی (completed/archived/cancelled) توسط
//      موتور «پایین‌آورده» نمی‌شوند — فقط admin می‌تواند دستی عوضشان کند.
//   ۴. syncItemsToStatus — تغییر دستی وضعیت توسط ادمین، stage آیتم‌ها را
//      همگام می‌کند تا سفارش و آیتم‌ها هرگز ناهمخوان نشوند.

import type { Prisma } from "@prisma/client";

export type ItemStageStr =
  | "design"
  | "print"
  | "warehouse"
  | "completed"
  | "archive";

export type OrderStatusStr =
  | "pending_design"
  | "in_printing"
  | "warehouse_logistics"
  | "completed"
  | "archived"
  | "cancelled";

export type Tx = Prisma.TransactionClient;

const STAGE_RANK: Record<string, number> = {
  design: 0,
  print: 1,
  warehouse: 2,
  completed: 3,
  archive: 3,
};

/** وضعیت‌های «در جریان» — موتور آزادانه بازمحاسبه‌شان می‌کند */
export const FLOW_STATUSES: OrderStatusStr[] = [
  "pending_design",
  "in_printing",
  "warehouse_logistics",
];

/** وضعیت‌هایی که در آن‌ها می‌توان فاکتور نهایی صادر کرد */
export const INVOICE_ELIGIBLE_STATUSES: OrderStatusStr[] = [
  "warehouse_logistics",
  "completed",
];

/**
 * وضعیت موثر سفارش از جمع مرحله‌های آیتم‌ها:
 *   - اگر «هر» آیتمی در design باشد → pending_design (گیت طراحی)
 *   - وگرنه اگر هر آیتمی در print باشد → in_printing
 *   - وگرنه اگر هر آیتمی در warehouse باشد → warehouse_logistics
 *   - وگرنه همه completed (یا archive) → completed (یا archived خالص)
 */
export function aggregateStatus(
  items: { stage: string }[]
): OrderStatusStr {
  if (!items.length) return "pending_design";
  // سفارشِ فقط-آرشیوی
  if (items.every((i) => i.stage === "archive")) return "archived";

  const active = items.filter((i) => i.stage !== "archive");
  if (!active.length) return "archived";

  if (active.some((i) => i.stage === "design")) return "pending_design";
  if (active.some((i) => i.stage === "print")) return "in_printing";
  if (active.some((i) => i.stage === "warehouse")) return "warehouse_logistics";
  return "completed";
}

/** آیتم‌هایی که طراح حق دیدن/کار رویشان دارد */
export function designerItems<T extends { stage: string }>(items: T[]): T[] {
  return items.filter((i) => i.stage === "design");
}

/** تعداد آیتم‌های باقی‌مانده در مرحلهٔ طراحی */
export function remainingDesign<T extends { stage: string }>(items: T[]): number {
  return designerItems(items).length;
}

/** تعداد آیتم‌های باقی‌مانده در مرحلهٔ چاپ */
export function remainingPrint<T extends { stage: string }>(items: T[]): number {
  return items.filter((i) => i.stage === "print").length;
}

const TRANSITION_MESSAGES: Partial<
  Record<`${OrderStatusStr}→${OrderStatusStr}`, { title: string; message: string; type: string }>
> = {
  "pending_design→in_printing": {
    title: "طراحی سفارش کامل شد",
    message: "همهٔ آیتم‌های نیازمند طراحی تکمیل شد و سفارش به مرحلهٔ چاپ رفت.",
    type: "success",
  },
  "in_printing→warehouse_logistics": {
    title: "چاپ سفارش کامل شد",
    message: "همهٔ آیتم‌ها چاپ شدند و سفارش به انبار و لجستیک رفت.",
    type: "success",
  },
  "warehouse_logistics→completed": {
    title: "سفارش تکمیل شد",
    message: "سفارش از انبار خارج و تکمیل شد.",
    type: "success",
  },
};

/**
 * بازمحاسبهٔ وضعیت سفارش بعد از تغییر stage آیتم‌ها.
 *   - فقط اگر وضعیت «تغییر واقعی» کند آپدیت می‌زند (بدون آپدیت خالی).
 *   - وضعیت‌های پایانیِ دستی (completed/archived/cancelled) را پایین
 *     نمی‌آورد — مگر اینکه aggregate همانشان باشد.
 *   - نوتیفیکیشن فقط برای «انتقال به جلو» ساخته می‌شود.
 * خروجی: { status, changed, items }
 */
export async function recomputeOrderStatus(
  tx: Tx,
  orderId: string
): Promise<{
  status: OrderStatusStr;
  changed: boolean;
  remaining: { design: number; print: number; warehouse: number };
}> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, status: true, items: { select: { stage: true } } },
  });
  if (!order) throw new Error("سفارش یافت نشد");

  const next = aggregateStatus(order.items);
  const current = order.status as OrderStatusStr;

  // وضعیت پایانیِ دستی: موتور آن را تغییر نمی‌دهد (مگر همنشین aggregate)
  const isTerminal = !FLOW_STATUSES.includes(current);
  const changed = next !== current && (!isTerminal || next === current);

  if (changed) {
    await tx.order.update({ where: { id: orderId }, data: { status: next } });

    const t = TRANSITION_MESSAGES[`${current}→${next}` as const];
    if (t) {
      await tx.notification.create({
        data: {
          title: `${t.title} — سفارش #${order.number}`,
          message: t.message,
          type: t.type,
          link: "admin:orders",
        },
      });
    }
  }

  return {
    status: next,
    changed,
    remaining: {
      design: order.items.filter((i) => i.stage === "design").length,
      print: order.items.filter((i) => i.stage === "print").length,
      warehouse: order.items.filter((i) => i.stage === "warehouse").length,
    },
  };
}

/** stage هدف برای همگام‌سازی آیتم‌ها وقتی ادمین وضعیت سفارش را دستی می‌برد */
const STATUS_TO_STAGE: Partial<Record<OrderStatusStr, ItemStageStr>> = {
  pending_design: "design",
  in_printing: "print",
  warehouse_logistics: "warehouse",
  completed: "completed",
};

/**
 * تغییر دستی وضعیت سفارش توسط ادمین → stage همهٔ آیتم‌ها به «کفِ»
 * وضعیت جدید همگام می‌شود تا جدول آیتم‌ها و وضعیت سفارش ناهمخوان
 * نمانند (مثلاً «ارسال به چاپ» دستی، آیتم‌های design را به print
 * می‌برد + مهر زمانی تکمیل).
 * آیتم‌های archive دست‌نخورده می‌مانند؛ archived/cancelled هم چیزی
 * تغییر نمی‌دهند (سطح سفارش‌اند).
 */
export async function syncItemsToStatus(
  tx: Tx,
  orderId: string,
  newStatus: OrderStatusStr
): Promise<void> {
  const target = STATUS_TO_STAGE[newStatus];
  if (!target) return;

  const items = await tx.orderItem.findMany({
    where: { orderId, stage: { not: "archive" } },
    select: { id: true, stage: true },
  });

  const now = new Date();
  for (const it of items) {
    if (it.stage === target) continue;
    const data: Record<string, unknown> = { stage: target };
    // مهر زمانی تکمیل مرحله‌های «گذشته» هنگام پرش دستی به جلو
    if (STAGE_RANK[target] >= 1) data.designCompletedAt = now;
    if (STAGE_RANK[target] >= 2) data.printCompletedAt = now;
    await tx.orderItem.update({ where: { id: it.id }, data });
  }
}

/** آیا این سفارش در مرحلهٔ صادرکردن فاکتور نهایی است؟ */
export function canIssueInvoice(status: string): boolean {
  return INVOICE_ELIGIBLE_STATUSES.includes(status as OrderStatusStr);
}
