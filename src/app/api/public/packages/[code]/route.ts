import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Phase 16: GET /api/public/packages/[code] ──────────────────
// صفحهٔ عمومی بسته — کد QR روی بج مستقیماً به این می‌رسد (بدون لاگین).
// خودِ کدِ غیرقابل حدس = توکن دسترسی. فقط دادهٔ مورد نیاز مأمور
// ارسال/مشتری برگردانده می‌شود (قیمت‌ها/وضعیت مالی داخلی هرگز).

const CACHE_TTL = 30_000; // کش کوتاه برای QRهای تکراری
const cache = new Map<string, { at: number; body: unknown }>();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  try {
    const { code: raw } = await ctx.params;
    const code = decodeURIComponent(raw).trim().toUpperCase();
    if (!/^PKG-[A-Z2-9]{6}$/.test(code)) {
      return NextResponse.json({ error: "کد بسته معتبر نیست" }, { status: 400 });
    }

    const hit = cache.get(code);
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      return NextResponse.json(hit.body, { headers: { "Cache-Control": "no-store" } });
    }

    const pkg = await db.package.findUnique({
      where: { code },
      include: {
        items: {
          include: {
            order: {
              include: {
                customer: { select: { name: true, phone: true, address: true } },
              },
            },
            orderItem: { include: { product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!pkg) {
      return NextResponse.json({ error: "بسته‌ای با این کد یافت نشد" }, { status: 404 });
    }

    // سفارش‌های داخل بسته (یکتا) + اقلام هر کدام
    const orderMap = new Map<
      string,
      {
        number: number;
        status: string;
        customer: { name: string; phone: string; address: string | null };
        address: string | null;
        items: { name: string; quantity: number }[];
      }
    >();
    for (const it of pkg.items) {
      const o = it.order;
      if (!orderMap.has(o.id)) {
        orderMap.set(o.id, {
          number: o.number,
          status: o.status,
          customer: o.customer,
          address: o.address ?? o.customer.address,
          items: [],
        });
      }
      orderMap.get(o.id)!.items.push({
        name: it.orderItem?.product?.name ?? "قلم سفارش",
        quantity: it.quantity,
      });
    }

    const body = {
      code: pkg.code,
      seq: pkg.seq,
      status: pkg.status,
      address: pkg.address,
      receiverName: pkg.receiverName,
      receiverPhone: pkg.receiverPhone,
      contentsNote: pkg.contentsNote,
      courier: pkg.courier,
      trackingNo: pkg.trackingNo,
      packedAt: pkg.packedAt,
      sentAt: pkg.sentAt,
      deliveredAt: pkg.deliveredAt,
      codAmount: pkg.codAmount,
      codCollected: pkg.codCollected,
      orders: [...orderMap.values()],
      company: { name: "Printoo24", faName: "پرینتو ۲۴", phone: "0770 000 0000" },
    };
    cache.set(code, { at: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
