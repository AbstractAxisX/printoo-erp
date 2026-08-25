import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { requireUser } from "@/lib/auth";

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
    items: { name: string; quantity: number; total: number; paid: number }[];
    totalAmount: number;
    paidAmount: number;
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
// Pre-Phase-6: nextNumber did `tx.order.aggregate({ _max: { number: true } })`
// + 1. Even inside $transaction that approach (a) scans the full table O(n),
// (b) depends on write-lock serialization for correctness, (c) reuses numbers
// if rows are deleted. The Counter model uses an atomic upsert + increment:
// a single SQL UPDATE that returns the new value — inherently race-free, O(1),
// and never reuses numbers. Callers pass the tx from db.$transaction() so the
// counter increment is composable with the rest of the create cascade.
async function nextNumber(
  tx: Prisma.TransactionClient,
  model: "order" | "preInvoice" | "invoice"
): Promise<number> {
  // upsert: if the counter row exists, atomically increment + return the NEW
  // value; if it doesn't exist yet (first-ever create for this model), create
  // it with next=1 and return 1. Prisma's `increment` maps to `SET next = next + 1`
  // in a single UPDATE — the database handles the atomicity, no read-then-write
  // gap exists.
  const counter = await tx.counter.upsert({
    where: { id: model },
    update: { next: { increment: 1 } },
    create: { id: model, next: 1 },
  });
  return counter.next;
}

// ─── One-time seed: initialize counters from existing max numbers ─────────
// Called lazily on first nextNumber() if the counter row is missing (the
// upsert's `create` branch handles it with next=1, but if the table already
// has rows with higher numbers, we'd get a collision). This seed runs on
// server startup (or first request) to backfill the counter to the current
// max so the first new order gets max+1, not 1.
//
// IMPORTANT: the seed sets `next = currentMax` (NOT currentMax+1). This is
// because nextNumber() does `update: { next: { increment: 1 } }` which
// increments FIRST then returns the new value. So if max=12 and seed sets
// next=12, the first nextNumber call increments 12→13 and returns 13 (correct:
// max+1). If we seeded with next=13 (max+1), the first call would increment
// 13→14 and return 14, skipping number 13 (off-by-one gap).
let counterSeeded = false;
async function seedCounters() {
  if (counterSeeded) return;
  counterSeeded = true;
  try {
    const [maxOrder, maxPre, maxInv] = await Promise.all([
      db.order.aggregate({ _max: { number: true } }),
      db.preInvoice.aggregate({ _max: { number: true } }),
      db.invoice.aggregate({ _max: { number: true } }),
    ]);
    // upsert: if row missing → create with next=currentMax (so first increment
    // yields currentMax+1). If row exists → no-op (update:{} keeps current value;
    // a prior seed or nextNumber already set it correctly).
    await db.counter.upsert({
      where: { id: "order" },
      update: {},
      create: { id: "order", next: maxOrder._max.number ?? 0 },
    });
    await db.counter.upsert({
      where: { id: "preInvoice" },
      update: {},
      create: { id: "preInvoice", next: maxPre._max.number ?? 0 },
    });
    await db.counter.upsert({
      where: { id: "invoice" },
      update: {},
      create: { id: "invoice", next: maxInv._max.number ?? 0 },
    });
  } catch {
    // Counter table not created yet (db:push not run) — upsert will retry on
    // first nextNumber() call; the create branch there handles first-run.
    counterSeeded = false;
  }
}

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
    const totalAmount: Prisma.NumberFilter = {};
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

  // R3: ensure Counter rows are seeded from existing max numbers before the
  // first nextNumber() call (idempotent — skips if already seeded).
  await seedCounters();

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
          if (preInvoice) await createPreInvoice(tx, order.id, customerId, preInvoice);
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
            if (preInvoice) await createPreInvoice(tx, order.id, customerId, preInvoice);
            if (invoice && markCompleted)
              await createInvoice(tx, order.id, customerId, invoice);
          }
        }
      }

      return result;
    });

    return NextResponse.json({ created, count: created.length }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ایجاد سفارش" }, { status: 500 });
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
async function createPreInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
  customerId: string,
  pi: NonNullable<CreateBody["preInvoice"]>
) {
  const num = await nextNumber(tx, "preInvoice");
  await tx.preInvoice.create({
    data: {
      number: num,
      orderId,
      customerId,
      totalAmount: Number(pi.totalAmount) || 0,
      paidAmount: Number(pi.paidAmount) || 0,
      items: JSON.stringify(pi.items),
    },
  });
  // bump order paidAmount
  await tx.order.update({
    where: { id: orderId },
    data: { paidAmount: Number(pi.paidAmount) || 0 },
  });
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
