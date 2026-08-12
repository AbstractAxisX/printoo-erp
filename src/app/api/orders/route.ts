import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";

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

async function nextNumber(model: "order" | "preInvoice" | "invoice") {
  if (model === "order") {
    const last = await db.order.aggregate({ _max: { number: true } });
    return (last._max.number ?? 0) + 1;
  }
  if (model === "preInvoice") {
    const last = await db.preInvoice.aggregate({ _max: { number: true } });
    return (last._max.number ?? 0) + 1;
  }
  const last = await db.invoice.aggregate({ _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const productId = searchParams.get("productId");
  const search = searchParams.get("search") || "";
  const excludeArchived = searchParams.get("excludeArchived") === "true";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (excludeArchived) where.status = { not: "archived" };
  if (productId) where.items = { some: { productId } };
  if (search) {
    where.OR = [
      { customer: { name: { contains: search } } },
      { customer: { phone: { contains: search } } },
    ];
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
      return NextResponse.json({ error: "حداقل یک مشتری انتخاب کنید" }, { status: 400 });
    }

    // Validate every customer has items
    for (const cid of customers) {
      const items = itemsByCustomer[cid];
      if (!items || items.length === 0) {
        return NextResponse.json({ error: "هر مشتری باید حداقل یک آیتم سفارش داشته باشد" }, { status: 400 });
      }
    }

    const created: { id: string; number: number; customerId: string }[] = [];

    for (const customerId of customers) {
      const items = itemsByCustomer[customerId] || [];
      const md = moduleDates ?? {};

      if (splitMode === "grouped") {
        // single order with all items
        const num = await nextNumber("order");
        const total = items.reduce((s, i) => s + (i.totalAmount || i.quantity * i.pricePerUnit), 0);
        const order = await db.order.create({
          data: {
            number: num,
            customerId,
            status: markCompleted ? "completed" : (items[0]?.stage === "archive" ? "archived" : stageToStatus(items[0]?.stage)),
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
                totalAmount: Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit) || 0,
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
        created.push({ id: order.id, number: order.number, customerId });
        if (preInvoice) await createPreInvoice(order.id, customerId, preInvoice);
        if (invoice && markCompleted) await createInvoice(order.id, customerId, invoice);
      } else {
        // separated: one order per item
        for (const it of items) {
          const num = await nextNumber("order");
          const total = Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
          const order = await db.order.create({
            data: {
              number: num,
              customerId,
              status: markCompleted ? "completed" : (it.stage === "archive" ? "archived" : stageToStatus(it.stage)),
              splitMode,
              priority,
              endDate: noEndDate ? null : toISO(endDate),
              noEndDate: !!noEndDate,
              totalAmount: total,
              paidAmount: 0,
              note: note || null,
              createdBy: createdBy || null,
              items: {
                create: [{
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
                }],
              },
            },
          });
          created.push({ id: order.id, number: order.number, customerId });
          if (preInvoice) await createPreInvoice(order.id, customerId, preInvoice);
          if (invoice && markCompleted) await createInvoice(order.id, customerId, invoice);
        }
      }
    }

    return NextResponse.json({ created, count: created.length }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطا در ایجاد سفارش" }, { status: 500 });
  }
}

function stageToStatus(stage?: string) {
  switch (stage) {
    case "design": return "pending_design";
    case "print": return "in_printing";
    case "warehouse": return "warehouse_logistics";
    case "completed": return "completed";
    case "archive": return "archived";
    default: return "pending_design";
  }
}

async function createPreInvoice(orderId: string, customerId: string, pi: NonNullable<CreateBody["preInvoice"]>) {
  const num = await nextNumber("preInvoice");
  await db.preInvoice.create({
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
  await db.order.update({ where: { id: orderId }, data: { paidAmount: Number(pi.paidAmount) || 0 } });
}

async function createInvoice(orderId: string, customerId: string, inv: NonNullable<CreateBody["invoice"]>) {
  const num = await nextNumber("invoice");
  await db.invoice.create({
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
  await db.order.update({ where: { id: orderId }, data: { paidAmount: Number(inv.paidAmount) || 0 } });
}
