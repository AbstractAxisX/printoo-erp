import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-error";
import { unsettledByCustomer } from "@/lib/customer-debt";

// ─── GET /api/customers/[id] — پروندهٔ کامل مشتری + تاریخچه ─────────────
// Phase 17-D: علاوه بر شیء customer (سازگار با CRM)، تاریخچهٔ کامل و
// جمع‌های محاسبه‌شده هم برمی‌گردد: orders / invoices / payments / totals.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [customer, unsettled] = await Promise.all([
      db.customer.findUnique({
        where: { id },
        include: {
          _count: { select: { orders: true, deals: true, activities: true } },
          orders: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true, number: true, status: true, priority: true,
              totalAmount: true, paidAmount: true, endDate: true, createdAt: true,
            },
          },
          invoices: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true, number: true, status: true,
              totalAmount: true, paidAmount: true, createdAt: true,
            },
          },
          payments: {
            orderBy: { date: "desc" },
            select: { id: true, amount: true, method: true, date: true, createdAt: true },
          },
        },
      }),
      unsettledByCustomer(),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
    }

    const { orders, invoices, payments, ...customerFields } = customer;
    const totalBilled = orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalPaid = orders.reduce((s, o) => s + o.paidAmount, 0);

    return NextResponse.json({
      customer: {
        ...customerFields,
        unsettled: unsettled.get(id) ?? 0,
      },
      orders,
      invoices,
      payments,
      totals: {
        ordersCount: orders.length,
        unsettled: unsettled.get(id) ?? 0,
        totalBilled,
        totalPaid,
      },
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت مشتری");
  }
}

// ─── PUT /api/customers/[id] — ویرایش جزئی (فقط فیلدهای ارسال‌شده) ───────
// فیلدهای name/phone/address اگر ارسال شوند باید غیرخالی باشند؛
// city/province/note با رشتهٔ خالی پاک می‌شوند (→ null).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const data: Record<string, string | boolean | null> = {};

    if (body.name !== undefined) {
      const v = textOrEmpty(body.name);
      if (!v) return NextResponse.json({ error: "نام مشتری نمی‌تواند خالی باشد" }, { status: 400 });
      data.name = v;
    }
    if (body.phone !== undefined) {
      const v = textOrEmpty(body.phone);
      if (!v) return NextResponse.json({ error: "شماره تلفن نمی‌تواند خالی باشد" }, { status: 400 });
      data.phone = v;
    }
    if (body.address !== undefined) {
      const v = textOrEmpty(body.address);
      if (!v) return NextResponse.json({ error: "آدرس نمی‌تواند خالی باشد" }, { status: 400 });
      data.address = v;
    }
    if (body.city !== undefined) data.city = optionalText(body.city);
    if (body.province !== undefined) data.province = optionalText(body.province);
    if (body.isFavorite !== undefined) data.isFavorite = body.isFavorite === true;
    if (body.note !== undefined) data.note = optionalText(body.note);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "موردی برای ویرایش ارسال نشده است" }, { status: 400 });
    }

    const customer = await db.customer.update({ where: { id }, data });
    return NextResponse.json({ customer });
  } catch (e) {
    return notFoundOrError(e, "خطا در ویرایش مشتری");
  }
}

// ─── DELETE /api/customers/[id] — حذف با گارد سوابق ─────────────────────
// قبلاً raw delete بود و رابطه‌های FK خطای خام ۵۰۰ می‌دادند؛ حالا اگر
// مشتری سفارش/فاکتور/پیش‌فاکتور/پرداخت (یا سابقهٔ CRM) داشته باشد → 409.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [orders, preInvoices, invoices, payments, deals, activities] = await Promise.all([
      db.order.count({ where: { customerId: id } }),
      db.preInvoice.count({ where: { customerId: id } }),
      db.invoice.count({ where: { customerId: id } }),
      db.payment.count({ where: { customerId: id } }),
      db.deal.count({ where: { customerId: id } }),
      db.activity.count({ where: { customerId: id } }),
    ]);

    if (orders + preInvoices + invoices + payments > 0) {
      return NextResponse.json(
        { error: "این مشتری سفارش ثبت‌شده دارد و قابل حذف نیست" },
        { status: 409 }
      );
    }
    if (deals + activities > 0) {
      return NextResponse.json(
        { error: "این مشتری در ماژول CRM سابقه دارد و قابل حذف نیست" },
        { status: 409 }
      );
    }

    await db.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return notFoundOrError(e, "حذف ناموفق");
  }
}

// ─── ابزارهای مشترک ─────────────────────────────────────────────────────

function textOrEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optionalText(v: unknown): string | null {
  return textOrEmpty(v).length ? textOrEmpty(v) : null;
}

/** Prisma P2025 (رکورد غایب) → ۴۰۴ فارسی؛ بقیه → jsonError */
function notFoundOrError(e: unknown, fallback: string): NextResponse {
  const err = e as { name?: string; code?: string } | null;
  if (err?.name === "PrismaClientKnownRequestError" && err?.code === "P2025") {
    return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
  }
  return jsonError(e, fallback);
}
