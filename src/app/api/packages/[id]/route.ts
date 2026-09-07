import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { canTransition, finalizeDelivery, type PackageStatus } from "@/lib/package-lib";
import { logOrderEvent } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: /api/packages/[id] ───────────────────────────────
// GET    → جزئیات کامل بسته (اقلام + سفارش‌ها + مشتری)
// PATCH  → ویرایش فیلدها یا جریان وضعیت:
//          ready | sent{courier,trackingNo} | delivered{receiverName,collectCod}
//          | cancelled — با رویداد، تکمیل سفارش و COD (RevenueLog لجستیک)
// DELETE → فقط packing/ready (آزادسازی اقلام)

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const pkg = await db.package.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            order: {
              include: {
                customer: { select: { id: true, name: true, phone: true, address: true } },
                items: {
                  include: { product: { select: { name: true } } },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
            orderItem: { include: { product: { select: { name: true } } } },
          },
        },
        createdByUser: { select: { name: true } },
      },
    });
    if (!pkg) return jsonError(new Error("nf"), "بسته یافت نشد", 404);

    const orderMap = new Map<
      string,
      {
        id: string;
        number: number;
        status: string;
        totalAmount: number;
        paidAmount: number;
        address: string | null;
        customer: { id: string; name: string; phone: string; address: string | null };
        allItems: { id: string; productName: string; stage: string; quantity: number }[];
        itemsInPackage: { productName: string; quantity: number }[];
      }
    >();
    for (const it of pkg.items) {
      const o = it.order;
      if (!orderMap.has(o.id)) {
        orderMap.set(o.id, {
          id: o.id,
          number: o.number,
          status: o.status,
          totalAmount: o.totalAmount,
          paidAmount: o.paidAmount,
          address: o.address ?? o.customer.address,
          customer: o.customer,
          allItems: o.items.map((oi) => ({
            id: oi.id,
            productName: oi.product.name,
            stage: oi.stage,
            quantity: oi.quantity,
          })),
          itemsInPackage: [],
        });
      }
      const entry = orderMap.get(o.id)!;
      entry.itemsInPackage.push({
        productName: it.orderItem?.product?.name ?? "قلم سفارش",
        quantity: it.quantity,
      });
    }

    return NextResponse.json({
      package: {
        id: pkg.id,
        code: pkg.code,
        seq: pkg.seq,
        address: pkg.address,
        receiverName: pkg.receiverName,
        receiverPhone: pkg.receiverPhone,
        contentsNote: pkg.contentsNote,
        courier: pkg.courier,
        trackingNo: pkg.trackingNo,
        status: pkg.status,
        codAmount: pkg.codAmount,
        codCollected: pkg.codCollected,
        note: pkg.note,
        packedAt: pkg.packedAt,
        sentAt: pkg.sentAt,
        deliveredAt: pkg.deliveredAt,
        createdByName: pkg.createdByName ?? pkg.createdByUser?.name ?? null,
        orders: [...orderMap.values()],
      },
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت بسته");
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const actor = { id: user.id, name: user.name };

    const pkg = await db.package.findUnique({
      where: { id },
      include: { items: { select: { orderId: true } } },
    });
    if (!pkg) return jsonError(new Error("nf"), "بسته یافت نشد", 404);

    const orderIds = [...new Set(pkg.items.map((i) => i.orderId))];
    const nextStatus = typeof body.status === "string" ? (body.status as PackageStatus) : null;

    // ── جریان وضعیت ──
    if (nextStatus && nextStatus !== pkg.status) {
      if (!canTransition(pkg.status as PackageStatus, nextStatus)) {
        return jsonError(
          new Error("transition"),
          `گذار از «${pkg.status}» به «${nextStatus}» مجاز نیست`,
          409
        );
      }

      if (nextStatus === "cancelled") {
        await db.$transaction(async (tx) => {
          await tx.package.update({ where: { id }, data: { status: "cancelled" } });
          for (const oid of orderIds) {
            await logOrderEvent(tx, {
              orderId: oid,
              type: "package_cancelled",
              actorId: actor.id,
              title: "لغو بسته",
              description: `بستهٔ ${pkg.code} لغو شد — اقلام به انبار برمی‌گردند`,
            });
          }
        });
        return NextResponse.json({ message: "بسته لغو شد و اقلام آزاد شدند" });
      }

      if (nextStatus === "ready") {
        await db.package.update({ where: { id }, data: { status: "ready" } });
        return NextResponse.json({ message: `بستهٔ ${pkg.code} آمادهٔ ارسال است` });
      }

      if (nextStatus === "sent") {
        const courier = typeof body.courier === "string" ? body.courier.trim() : pkg.courier;
        const trackingNo = typeof body.trackingNo === "string" ? body.trackingNo.trim() : pkg.trackingNo;
        const result = await db.$transaction(async (tx) => {
          await tx.package.update({
            where: { id },
            data: { status: "sent", sentAt: new Date(), courier, trackingNo },
          });
          for (const oid of orderIds) {
            await logOrderEvent(tx, {
              orderId: oid,
              type: "package_sent",
              actorId: actor.id,
              title: "ارسال بسته",
              description: `بستهٔ ${pkg.code} ارسال شد${courier ? ` با ${courier}` : ""}${
                trackingNo ? ` (پیگیری: ${trackingNo})` : ""
              }`,
            });
          }
          return true;
        });
        void result;
        return NextResponse.json({ message: `بستهٔ ${pkg.code} ارسال شد` });
      }

      if (nextStatus === "delivered") {
        const receiverName = typeof body.receiverName === "string" ? body.receiverName.trim() : "";
        const collectCod = body.collectCod !== false && pkg.codAmount > 0;
        const result = await db.$transaction(async (tx) =>
          finalizeDelivery(tx, {
            packageId: id,
            actor,
            receiverName: receiverName || null,
            collectCod,
          })
        );
        return NextResponse.json({
          message:
            `بستهٔ ${pkg.code} تحویل شد` +
            (result.completedOrders > 0
              ? ` — ${result.completedOrders.toLocaleString("fa-IR")} سفارش تکمیل شد`
              : "") +
            (result.codTotal > 0
              ? ` — پول در محل: ${result.codTotal.toLocaleString("fa-IR")} دینار ثبت درآمد شد`
              : ""),
          completedOrders: result.completedOrders,
          codTotal: result.codTotal,
          codOrders: result.codOrders,
        });
      }
    }

    // ── ویرایش فیلدها (بدون تغییر وضعیت) ──
    const data: Record<string, unknown> = {};
    if (typeof body.address === "string" && body.address.trim()) data.address = body.address.trim();
    if (typeof body.receiverName === "string") data.receiverName = body.receiverName.trim() || null;
    if (typeof body.receiverPhone === "string") data.receiverPhone = body.receiverPhone.trim() || null;
    if (typeof body.contentsNote === "string") data.contentsNote = body.contentsNote.trim() || null;
    if (typeof body.courier === "string") data.courier = body.courier.trim() || null;
    if (typeof body.trackingNo === "string") data.trackingNo = body.trackingNo.trim() || null;
    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (body.codAmount !== undefined) {
      const cod = Number(body.codAmount);
      if (!Number.isFinite(cod) || cod < 0 || cod > 1_000_000_000) {
        return jsonError(new Error("v"), "مبلغ پول در محل نامعتبر است", 400);
      }
      data.codAmount = cod;
    }
    if (Object.keys(data).length === 0) {
      return jsonError(new Error("v"), "چیزی برای ذخیره نیست", 400);
    }

    await db.package.update({ where: { id }, data });
    return NextResponse.json({ message: "بسته به‌روزرسانی شد" });
  } catch (e) {
    return jsonError(e, "خطا در به‌روزرسانی بسته");
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await ctx.params;
    const pkg = await db.package.findUnique({ where: { id }, select: { status: true, code: true } });
    if (!pkg) return jsonError(new Error("nf"), "بسته یافت نشد", 404);
    if (pkg.status === "sent" || pkg.status === "delivered") {
      return jsonError(
        new Error("sent"),
        "بستهٔ ارسال/تحویل‌شده قابل حذف نیست — از لغو استفاده کنید",
        409
      );
    }
    await db.package.delete({ where: { id } });
    return NextResponse.json({ message: `بستهٔ ${pkg.code} حذف شد` });
  } catch (e) {
    return jsonError(e, "خطا در حذف بسته");
  }
}
