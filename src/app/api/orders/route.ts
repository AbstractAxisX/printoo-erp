import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { normalizeItems, computeTotals } from "@/lib/pre-invoice";
import { nextNumber, ensureCounters } from "@/lib/counter";
import { jsonError } from "@/lib/api-error";

type ItemDraft = {
  productId: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  note?: string | null;
  description?: string | null;
  stage: string;
  needsMaterial?: boolean;
};

type ModuleDates = {
  design?: { start?: string | null; end?: string | null };
  print?: { start?: string | null; end?: string | null };
};

type CreateBody = {
  customers: string[];
  itemsByCustomer: Record<string, ItemDraft[]>;
  splitMode: "grouped" | "separated";
  priority: "normal" | "urgent";
  endDate?: string | null;
  noEndDate?: boolean;
  note?: string | null;
  moduleDates?: ModuleDates;
  preInvoice?: {
    items: { name: string; quantity: number; unit?: string; unitPrice: number; discount?: number }[];
    discountAmount?: number;
    taxRate?: number;
    paidAmount?: number;
    validDays?: number;
    notes?: string | null;
    terms?: string | null;
  } | null;
  invoice?: {
    items: { name: string; quantity: number; total: number; paid: number }[];
    totalAmount: number;
    paidAmount: number;
    discountAmount: number;
  } | null;
  markCompleted?: boolean;
  createdBy?: string | null;
};

// ─── R3 fix: atomic Counter upsert (replaces aggregate _max + 1) ───────────
// شماره‌گذاری و ترمیم شمارنده در lib/counter متمرکز شده است —
// nextNumber اتمیک است و حتی با شمارندهٔ خراب هرگز شمارهٔ تکراری نمی‌دهد
// (عکس‌العمل به باگ «خطا در ساخت سفارش» در دیتابیس‌های محلی ناهمگام).

export async function GET(req: NextRequest) {
  // Defense-in-depth: proxy.ts gates by cookie presence; requireUser verifies
  // the HMAC signature. Returns 401 NextResponse if invalid.
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const productId = searchParams.get("productId");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search") || "";
  const excludeArchived = searchParams.get("excludeArchived") === "true";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const amountMin = searchParams.get("amountMin");
  const amountMax = searchParams.get("amountMax");

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (excludeArchived) where.status = { not: "archived" };
  if (priority) where.priority = priority;
  if (productId) where.items = { some: { productId } };
  if (search) {
    where.OR = [
      { customer: { name: { contains: search } } },
      { customer: { phone: { contains: search } } },
    ];
  }
  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) createdAt.lte = new Date(dateTo);
    where.createdAt = createdAt;
  }
  if (amountMin || amountMax) {
    const totalAmount: Prisma.FloatFilter = {};
    if (amountMin) totalAmount.gte = Number(amountMin);
    if (amountMax) totalAmount.lte = Number(amountMax);
    where.totalAmount = totalAmount;
  }

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      items: { include: { product: true } },
      _count: { select: { items: true } },
    },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  // R3: شمارنده‌ها قبل از تراکنش ترمیم/سید می‌شوند (idempotent)
  await ensureCounters();

  try {
    const body = (await req.json()) as CreateBody;
    const {
      customers,
      itemsByCustomer,
      splitMode,
      priority,
      endDate,
      noEndDate,
      note,
      moduleDates,
      preInvoice,
      invoice,
      markCompleted,
      createdBy,
    } = body;

    if (!customers?.length) {
      return NextResponse.json(
        { error: "حداقل یک مشتری انتخاب کنید" },
        { status: 400 }
      );
    }

    // Validate every customer has items
    for (const cid of customers) {
      const items = itemsByCustomer[cid];
      if (!items || items.length === 0) {
        return NextResponse.json(
          { error: "هر مشتری باید حداقل یک آیتم سفارش داشته باشد" },
          { status: 400 }
        );
      }
    }

    // ─── R4 fix: atomic all-or-nothing via a single transaction ──────────
    // Pre-Phase-3, if createPreInvoice/createInvoice failed AFTER order.create,
    // the order was orphaned (paidAmount never bumped, invoice missing).
    // Now the entire creation (order + pre-invoice + invoice + paidAmount
    // bump) happens inside one Prisma transaction → any failure rolls back
    // everything. nextNumber also runs inside tx → R3 race fixed.
    const created = await db.$transaction(async (tx) => {
      const result: { id: string; number: number; customerId: string }[] = [];
      // اولین پیش‌فاکتور ساخته‌شده — برای «چاپ بلافاصله پس از ثبت» به کلاینت برمی‌گردد
      let firstPreInvoice: { id: string; number: number } | null = null;

      for (const customerId of customers) {
        const items = itemsByCustomer[customerId] || [];
        const md = moduleDates ?? {};

        if (splitMode === "grouped") {
          // single order with all items
          const num = await nextNumber(tx, "order");
          const total = items.reduce(
            (s, i) => s + (i.totalAmount || i.quantity * i.pricePerUnit),
            0
          );
          const order = await tx.order.create({
            data: {
              number: num,
              customerId,
              status: markCompleted
                ? "completed"
                : items[0]?.stage === "archive"
                ? "archived"
                : stageToStatus(items[0]?.stage),
              splitMode,
              priority,
              endDate: noEndDate ? null : toISO(endDate),
              noEndDate: !!noEndDate,
              totalAmount: total,
              paidAmount: 0,
              note: note || null,
              createdBy: createdBy || null,
              items: {
                create: items.map((it) => ({
                  productId: it.productId,
                  quantity: Number(it.quantity) || 1,
                  pricePerUnit: Number(it.pricePerUnit) || 0,
                  totalAmount:
                    Number(it.totalAmount) ||
                    Number(it.quantity) * Number(it.pricePerUnit) ||
                    0,
                  note: it.note || null,
                  description: it.description || null,
                  stage: it.stage || "design",
                  needsMaterial: !!it.needsMaterial,
                  designStartDate: toISO(md.design?.start),
                  designEndDate: toISO(md.design?.end),
                  printStartDate: toISO(md.print?.start),
                  printEndDate: toISO(md.print?.end),
                })),
              },
            },
          });
          result.push({ id: order.id, number: order.number, customerId });
          if (preInvoice) {
            const pi = await createPreInvoice(tx, order.id, customerId, preInvoice);
            if (!firstPreInvoice) firstPreInvoice = { id: pi.id, number: pi.number };
          }
          if (invoice && markCompleted)
            await createInvoice(tx, order.id, customerId, invoice);
        } else {
          // separated: one order per item
          for (const it of items) {
            const num = await nextNumber(tx, "order");
            const total =
              Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
            const order = await tx.order.create({
              data: {
                number: num,
                customerId,
                status: markCompleted
                  ? "completed"
                  : it.stage === "archive"
                  ? "archived"
                  : stageToStatus(it.stage),
                splitMode,
                priority,
                endDate: noEndDate ? null : toISO(endDate),
                noEndDate: !!noEndDate,
                totalAmount: total,
                paidAmount: 0,
                note: note || null,
                createdBy: createdBy || null,
                items: {
                  create: [
                    {
                      productId: it.productId,
                      quantity: Number(it.quantity) || 1,
                      pricePerUnit: Number(it.pricePerUnit) || 0,
                      totalAmount: total,
                      note: it.note || null,
                      description: it.description || null,
                      stage: it.stage || "design",
                      needsMaterial: !!it.needsMaterial,
                      designStartDate: toISO(md.design?.start),
                      designEndDate: toISO(md.design?.end),
                      printStartDate: toISO(md.print?.start),
                      printEndDate: toISO(md.print?.end),
                    },
                  ],
                },
              },
            });
            result.push({ id: order.id, number: order.number, customerId });
            if (preInvoice) {
              const pi = await createPreInvoice(tx, order.id, customerId, preInvoice);
              if (!firstPreInvoice) firstPreInvoice = { id: pi.id, number: pi.number };
            }
            if (invoice && markCompleted)
              await createInvoice(tx, order.id, customerId, invoice);
          }
        }
      }

      return { orders: result, preInvoice: firstPreInvoice };
    });

    return NextResponse.json(
      { created: created.orders, count: created.orders.length, preInvoice: created.preInvoice },
      { status: 201 }
    );
  } catch (e) {
    return jsonError(e, "خطا در ایجاد سفارش");
  }
}

function stageToStatus(stage?: string) {
  switch (stage) {
    case "design":
      return "pending_design";
    case "print":
      return "in_printing";
    case "warehouse":
      return "warehouse_logistics";
    case "completed":
      return "completed";
    case "archive":
      return "archived";
    default:
      return "pending_design";
  }
}

// Helpers now take the tx client → run inside the caller's transaction.
// Phase 7: createPreInvoice fully rebuilt — normalized items, discount,
// tax, validity window, notes; paidAmount applies INCREMENTALLY to
// order.paidAmount (the old version overwrote it, which broke with
// multiple pre-invoices per order).
async function createPreInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
  customerId: string,
  pi: NonNullable<CreateBody["preInvoice"]>
): Promise<{ id: string; number: number }> {
  const items = normalizeItems(pi.items);
  const totals = computeTotals(items, pi.discountAmount ?? 0, pi.taxRate ?? 0);
  const paid = Math.min(
    Math.max(0, Number(pi.paidAmount) || 0),
    totals.totalAmount
  );

  const num = await nextNumber(tx, "preInvoice");
  const days = Math.max(1, Math.min(365, Number(pi.validDays) || 15));
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + days);

  const row = await tx.preInvoice.create({
    data: {
      number: num,
      orderId,
      customerId,
      status: "draft",
      validUntil,
      items: JSON.stringify(items),
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      paidAmount: paid,
      notes: pi.notes || null,
      terms: pi.terms || null,
    },
  });
  // همگام‌سازی افزایشی paidAmount سفارش (چند پیش‌فاکتور جمع می‌شود)
  if (paid > 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { paidAmount: { increment: paid } },
    });
  }
  return { id: row.id, number: row.number };
}

async function createInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
  customerId: string,
  inv: NonNullable<CreateBody["invoice"]>
) {
  const num = await nextNumber(tx, "invoice");
  await tx.invoice.create({
    data: {
      number: num,
      orderId,
      customerId,
      totalAmount: Number(inv.totalAmount) || 0,
      paidAmount: Number(inv.paidAmount) || 0,
      discountAmount: Number(inv.discountAmount) || 0,
      items: JSON.stringify(inv.items),
    },
  });
  await tx.order.update({
    where: { id: orderId },
    data: { paidAmount: Number(inv.paidAmount) || 0 },
  });
}
