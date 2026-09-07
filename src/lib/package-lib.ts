import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyPaidAmountChange } from "@/lib/paid-sync";
import { logOrderEvent } from "@/lib/order-events";

// ─── Phase 16: منطق مشترک بسته‌بندی/ارسال/تحویل ──────────────────
// همهٔ توابع tx می‌گیرند (تراکنش route) — قاعدهٔ connection-limit=1.

type Tx = Prisma.TransactionClient;
type CtxUser = { id: string; name: string };

/** کد QR غیرقابل حدس: PKG- + ۶ کاراکتر از الفبای بدون‌ابهام. */
export function generatePackageCode(): string {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون I,O,0,1
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `PKG-${out}`;
}

export type PackageStatus = "packing" | "ready" | "sent" | "delivered" | "cancelled";

/** جریان مجاز وضعیت‌ها. */
const TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  packing: ["ready", "cancelled"],
  ready: ["sent", "cancelled", "packing"],
  // sent → cancelled = مرجوعی (بسته از پیک برگشت) — اقلام آزاد می‌شوند
  sent: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: PackageStatus, to: PackageStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** آیا این آیتمِ سفارش در بستهٔ فعال (غیر-cancelled) هست؟ */
export async function isItemPacked(
  tx: Tx,
  orderItemId: string
): Promise<{ packed: boolean; packageCode?: string; packageStatus?: string }> {
  const pi = await tx.packageItem.findFirst({
    where: { orderItemId, package: { status: { not: "cancelled" } } },
    include: { package: { select: { code: true, status: true } } },
  });
  if (!pi) return { packed: false };
  return { packed: true, packageCode: pi.package.code, packageStatus: pi.package.status };
}

/**
 * تحویل بسته:
 *   ۱) اقلام → stage=completed؛ سفارشِ کاملاً-تحویل‌شده → status=completed
 *   ۲) COD جمع‌شده → توزیع FIFO روی سفارش‌های بسته (RevenueLog با
 *      module=logistics) — همان مسیر «دریافت نقدی در محل» لجستیک
 *   ۳) رویداد package_delivered برای هر سفارش
 */
export async function finalizeDelivery(
  tx: Tx,
  args: {
    packageId: string;
    actor: CtxUser;
    receiverName?: string | null;
    collectCod: boolean;
  }
): Promise<{ completedOrders: number; codOrders: { number: number; diff: number }[]; codTotal: number }> {
  const pkg = await tx.package.findUnique({
    where: { id: args.packageId },
    include: {
      items: { include: { order: { select: { id: true, number: true } } } },
    },
  });
  if (!pkg) throw new Error("بسته یافت نشد");

  // ۱) تکمیل اقلام
  const orderIds = [...new Set(pkg.items.map((i) => i.orderId))];
  let completedOrders = 0;
  for (const oid of orderIds) {
    await tx.orderItem.updateMany({
      where: { orderId: oid, packageItems: { some: { packageId: pkg.id } } },
      data: { stage: "completed" },
    });
    const remaining = await tx.orderItem.count({
      where: { orderId: oid, stage: { not: "completed" } },
    });
    if (remaining === 0) {
      await tx.order.update({ where: { id: oid }, data: { status: "completed" } });
      completedOrders += 1;
    }
  }

  // ۲) COD — توزیع FIFO روی سفارش‌های بسته (به ترتیب شماره)
  const codOrders: { number: number; diff: number }[] = [];
  let codTotal = 0;
  if (args.collectCod && pkg.codAmount > 0) {
    let remaining = pkg.codAmount;
    const sortedOrders = [...orderIds].sort((a, b) => {
      const na = pkg.items.find((i) => i.orderId === a)?.order.number ?? 0;
      const nb = pkg.items.find((i) => i.orderId === b)?.order.number ?? 0;
      return na - nb;
    });
    for (const oid of sortedOrders) {
      if (remaining <= 0.001) break;
      const order = await tx.order.findUnique({
        where: { id: oid },
        select: { number: true, paidAmount: true, totalAmount: true },
      });
      if (!order) continue;
      const due = Math.max(0, order.totalAmount - order.paidAmount);
      if (due <= 0.001) continue;
      const give = Math.min(due, remaining);
      remaining -= give;
      const res = await applyPaidAmountChange(tx, {
        orderId: oid,
        newPaid: order.paidAmount + give,
        actor: {
          userId: args.actor.id,
          userName: args.actor.name,
          module: "logistics",
          method: "cash",
          note: `پول در محل — تحویل بسته ${pkg.code}`,
        },
      });
      codOrders.push({ number: order.number, diff: res.diff });
      codTotal += res.diff;
    }
  }

  // ۳) رویدادها
  for (const oid of orderIds) {
    await logOrderEvent(tx, {
      orderId: oid,
      type: "package_delivered",
      actorId: args.actor.id,
      title: "تحویل بسته",
      description: `بسته ${pkg.code} تحویل شد${args.receiverName ? ` — گیرنده: ${args.receiverName}` : ""}${
        args.collectCod && pkg.codAmount > 0 ? " (پول در محل دریافت شد)" : ""
      }`,
    });
  }

  await tx.package.update({
    where: { id: pkg.id },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      receiverName: args.receiverName ?? pkg.receiverName,
      codCollected: args.collectCod && pkg.codAmount > 0 ? true : pkg.codCollected,
    },
  });

  return { completedOrders, codOrders, codTotal };
}
