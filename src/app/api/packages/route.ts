import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { ensureCounters, nextNumber } from "@/lib/counter";
import { generatePackageCode, isItemPacked } from "@/lib/package-lib";
import { logOrderEvent } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET/POST /api/packages ───────────────────────────
// GET  ?status=&q= → بسته‌ها با اقلام (سفارش + مشتری)
//      ?packable=1 → فقط سفارش‌های آمادهٔ بسته‌بندی (آیتم warehouse
//      بسته‌نشده) — برای فرم «بسته جدید»
// POST → ساخت بسته از اقلام چند سفارش + کد QR + رویداد.

const ITEM_STAGES_PACKABLE = ["warehouse"];

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = (searchParams.get("q") || "").trim();
    const packable = searchParams.get("packable");

    // آیتم‌های آمادهٔ بسته‌بندی (دریافت‌شده از چاپ و بسته‌نشده)
    if (packable) {
      const orders = await db.order.findMany({
        where: {
          status: { in: ["in_printing", "warehouse_logistics"] },
          items: { some: { stage: { in: ITEM_STAGES_PACKABLE } } },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, address: true } },
          items: {
            where: { stage: { in: ITEM_STAGES_PACKABLE } },
            include: { product: { select: { name: true } } },
          },
        },
        orderBy: { number: "desc" },
      });

      // آیتم‌هایی که در بستهٔ فعال هستند → علامت‌گذاری
      const itemIds = orders.flatMap((o) => o.items.map((i) => i.id));
      const packedItems = await db.packageItem.findMany({
        where: { orderItemId: { in: itemIds }, package: { status: { not: "cancelled" } } },
        select: { orderItemId: true, package: { select: { code: true, status: true } } },
      });
      const packedMap = new Map(packedItems.map((p) => [p.orderItemId, p.package]));

      return NextResponse.json({
        orders: orders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          totalAmount: o.totalAmount,
          paidAmount: o.paidAmount,
          address: o.address ?? o.customer.address,
          customer: o.customer,
          items: o.items.map((i) => ({
            id: i.id,
            productName: i.product.name,
            quantity: i.quantity,
            note: i.note,
            packedIn: packedMap.get(i.id) ?? null,
          })),
        })),
      });
    }

    const where: Record<string, unknown> = {};
    if (status) {
      const mods = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = mods.length === 1 ? mods[0] : { in: mods };
    }
    if (q) {
      const or: Record<string, unknown>[] = [
        { code: { contains: q.toUpperCase() } },
        { address: { contains: q } },
        { contentsNote: { contains: q } },
        { courier: { contains: q } },
        { trackingNo: { contains: q } },
        { items: { some: { order: { customer: { name: { contains: q } } } } } },
      ];
      const qNum = Number(q.replace(/[^\d]/g, ""));
      if (Number.isFinite(qNum) && qNum > 0) {
        or.push({ seq: qNum });
        or.push({ items: { some: { order: { number: qNum } } } });
      }
      where.OR = or;
    }

    const packages = await db.package.findMany({
      where,
      orderBy: { seq: "desc" },
      include: {
        items: {
          include: {
            order: {
              include: { customer: { select: { id: true, name: true, phone: true, address: true } } },
            },
          },
        },
        createdByUser: { select: { name: true } },
      },
    });

    return NextResponse.json({
      packages: packages.map((p) => serializePackage(p)),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت بسته‌ها");
  }
}

export function serializePackage(p: {
  id: string;
  code: string;
  seq: number;
  address: string;
  receiverName: string | null;
  receiverPhone: string | null;
  contentsNote: string | null;
  courier: string | null;
  trackingNo: string | null;
  status: string;
  codAmount: number;
  codCollected: boolean;
  note: string | null;
  packedAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  createdByName: string | null;
  createdByUser?: { name: string } | null;
  items: {
    id: string;
    quantity: number;
    orderItemId: string | null;
    order: {
      id: string;
      number: number;
      status: string;
      totalAmount: number;
      paidAmount: number;
      address: string | null;
      customer: { id: string; name: string; phone: string; address: string | null };
    };
    orderItem?: { product: { name: string }; quantity: number } | null;
  }[];
}) {
  return {
    id: p.id,
    code: p.code,
    seq: p.seq,
    address: p.address,
    receiverName: p.receiverName,
    receiverPhone: p.receiverPhone,
    contentsNote: p.contentsNote,
    courier: p.courier,
    trackingNo: p.trackingNo,
    status: p.status,
    codAmount: p.codAmount,
    codCollected: p.codCollected,
    note: p.note,
    packedAt: p.packedAt,
    sentAt: p.sentAt,
    deliveredAt: p.deliveredAt,
    createdByName: p.createdByName ?? p.createdByUser?.name ?? null,
    orders: [...new Map(p.items.map((i) => [i.order.id, i.order])).values()].map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      address: o.address ?? o.customer.address,
      customer: o.customer,
    })),
    items: p.items.map((i) => ({
      id: i.id,
      orderId: i.order.id,
      orderNumber: i.order.number,
      orderItemId: i.orderItemId,
      productName: i.orderItem?.product?.name ?? "—",
      quantity: i.quantity,
    })),
    itemsCount: p.items.length,
  };
}

type ItemDraft = { orderId: string; orderItemId?: string | null; quantity?: number };

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await req.json();
    const {
      items,
      address,
      receiverName,
      receiverPhone,
      contentsNote,
      courier,
      trackingNo,
      codAmount,
      note,
    }: {
      items: ItemDraft[];
      address?: string;
      receiverName?: string;
      receiverPhone?: string;
      contentsNote?: string;
      courier?: string;
      trackingNo?: string;
      codAmount?: number;
      note?: string;
    } = body;

    // ── اعتبارسنجی ──
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError(new Error("v"), "حداقل یک قلم برای بسته انتخاب کنید", 400);
    }
    const destAddress = typeof address === "string" ? address.trim() : "";
    if (!destAddress) {
      return jsonError(new Error("v"), "آدرس تحویل بسته الزامی است", 400);
    }
    const cod = Number(codAmount ?? 0);
    if (!Number.isFinite(cod) || cod < 0 || cod > 1_000_000_000) {
      return jsonError(new Error("v"), "مبلغ پول در محل نامعتبر است", 400);
    }

    await ensureCounters();

    const result = await db.$transaction(async (tx) => {
      // اعتبارسنجی اقلام: سفارش موجود + آیتمِ همان سفارش + مرحلهٔ انبار + بسته‌نشده
      const validated: { orderId: string; orderItemId: string; quantity: number; orderNumber: number }[] = [];
      for (const it of items) {
        if (typeof it?.orderId !== "string" || !it.orderId) {
          throw new Error("سفارش اقلام بسته نامعتبر است");
        }
        const order = await tx.order.findUnique({
          where: { id: it.orderId },
          select: { id: true, number: true },
        });
        if (!order) throw new Error("سفارش یافت نشد");

        // بدون آیتم مشخص → همهٔ اقلام انبارِ سفارش
        if (!it.orderItemId) {
          const whItems = await tx.orderItem.findMany({
            where: { orderId: order.id, stage: { in: ITEM_STAGES_PACKABLE } },
            select: { id: true },
          });
          for (const wi of whItems) {
            const packed = await isItemPacked(tx, wi.id);
            if (packed.packed) continue;
            validated.push({ orderId: order.id, orderItemId: wi.id, quantity: 1, orderNumber: order.number });
          }
          continue;
        }

        const item = await tx.orderItem.findUnique({
          where: { id: it.orderItemId },
          include: { order: { select: { id: true, number: true } } },
        });
        if (!item || item.order.id !== order.id) {
          throw new Error("قلم بسته به این سفارش تعلق ندارد");
        }
        if (!ITEM_STAGES_PACKABLE.includes(item.stage)) {
          throw new Error(`قلم سفارش #${order.number} هنوز به انبار نرسیده است`);
        }
        const packed = await isItemPacked(tx, item.id);
        if (packed.packed) {
          throw new Error(`این قلم قبلاً در بستهٔ ${packed.packageCode} است`);
        }
        const qty = Math.max(1, Math.min(Number(it.quantity ?? 1) || 1, item.quantity));
        validated.push({ orderId: order.id, orderItemId: item.id, quantity: qty, orderNumber: order.number });
      }

      if (validated.length === 0) {
        throw new Error("هیچ قلم قابل بسته‌بندی انتخاب نشده است");
      }

      const seq = await nextNumber(tx, "package");
      let code = generatePackageCode();
      // یکتایی کد (تا ۵ تلاش)
      for (let i = 0; i < 5; i++) {
        const exists = await tx.package.findUnique({ where: { code }, select: { id: true } });
        if (!exists) break;
        code = generatePackageCode();
      }

      const pkg = await tx.package.create({
        data: {
          code,
          seq,
          address: destAddress,
          receiverName: receiverName?.trim() || null,
          receiverPhone: receiverPhone?.trim() || null,
          contentsNote: contentsNote?.trim() || null,
          courier: courier?.trim() || null,
          trackingNo: trackingNo?.trim() || null,
          codAmount: cod,
          note: note?.trim() || null,
          createdById: user.id,
          createdByName: user.name,
          items: {
            create: validated.map((v) => ({
              orderId: v.orderId,
              orderItemId: v.orderItemId,
              quantity: v.quantity,
            })),
          },
        },
      });

      // آدرس سفارش‌های بی‌آدرس ← آدرس بسته (برای «هر سفارش آدرسش کجاست»)
      const orderIds = [...new Set(validated.map((v) => v.orderId))];
      for (const oid of orderIds) {
        const o = await tx.order.findUnique({ where: { id: oid }, select: { address: true, number: true } });
        if (o && !o.address) {
          await tx.order.update({ where: { id: oid }, data: { address: destAddress } });
        }
        await logOrderEvent(tx, {
          orderId: oid,
          type: "package_packed",
          actorId: user.id,
          title: "بسته‌بندی",
          description: `قلم‌های این سفارش در بستهٔ ${code} (بستهٔ #${seq}) قرار گرفت`,
        });
      }

      return pkg;
    });

    return NextResponse.json(
      { package: { id: result.id, code: result.code, seq: result.seq }, message: `بستهٔ ${result.code} ساخته شد` },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطا در ساخت بسته";
    return jsonError(e, msg, 400);
  }
}
