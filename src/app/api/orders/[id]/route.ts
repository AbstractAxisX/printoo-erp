import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toISO } from "@/lib/format";
import { TASK_INCLUDE } from "@/lib/task-validation";
import { jsonError } from "@/lib/api-error";

type ItemDraft = {
  productId: string;
  quantity: number;
  pricePerUnit: number;
  totalAmount?: number;
  note?: string | null;
  description?: string | null;
  stage?: string;
  needsMaterial?: boolean;
};

type ModuleDates = {
  design?: { start?: string | null; end?: string | null };
  print?: { start?: string | null; end?: string | null };
};

type UpdateBody = {
  note?: string;
  endDate?: string | null;
  noEndDate?: boolean;
  priority?: string;
  totalAmount?: number;
  status?: string;
  customerId?: string;
  splitMode?: string;
  items?: ItemDraft[];
  moduleDates?: ModuleDates;
};

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        preInvoices: true,
        invoice: true,
        tasks: { include: { assignedUser: TASK_INCLUDE.assignedUser } },
      },
    });
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    // این همان endpoint مودال جزئیات سفارش در ماژول طراح/چاپ است —
    // پیام قابل‌اقدام به‌جای «سرور پاسخ نداد» خاموش
    return jsonError(e, "خطا در بارگذاری سفارش");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await db.order.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, "حذف ناموفق");
  }
}

// Update order (note, endDate, status, customer, items, etc.)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as UpdateBody;

  try {
    // 1) Build base scalar data
    const data: Record<string, unknown> = {};
    if (typeof body.note === "string") data.note = body.note;
    if (typeof body.endDate !== "undefined") data.endDate = toISO(body.endDate);
    if (typeof body.noEndDate === "boolean") data.noEndDate = body.noEndDate;
    if (typeof body.priority === "string") data.priority = body.priority;
    if (typeof body.totalAmount === "number") data.totalAmount = body.totalAmount;
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.customerId === "string") data.customerId = body.customerId;
    if (typeof body.splitMode === "string") data.splitMode = body.splitMode;

    // 2) Replace items if provided
    const hasItems = Array.isArray(body.items);
    const moduleDates = body.moduleDates ?? {};
    let newItems: { id: string; totalAmount: number; stage: string }[] = [];

    if (hasItems) {
      const items = body.items as ItemDraft[];
      // delete existing items first
      await db.orderItem.deleteMany({ where: { orderId: id } });

      // create new items
      newItems = await Promise.all(
        items.map(async (it) => {
          const total = Number(it.totalAmount) || Number(it.quantity) * Number(it.pricePerUnit);
          const created = await db.orderItem.create({
            data: {
              orderId: id,
              productId: it.productId,
              quantity: Number(it.quantity) || 1,
              pricePerUnit: Number(it.pricePerUnit) || 0,
              totalAmount: total,
              note: it.note || null,
              description: it.description || null,
              stage: it.stage || "design",
              needsMaterial: !!it.needsMaterial,
              designStartDate: toISO(moduleDates.design?.start),
              designEndDate: toISO(moduleDates.design?.end),
              printStartDate: toISO(moduleDates.print?.start),
              printEndDate: toISO(moduleDates.print?.end),
            },
          });
          return { id: created.id, totalAmount: total, stage: created.stage };
        })
      );

      // auto-update totalAmount if not explicitly provided
      if (typeof body.totalAmount !== "number") {
        data.totalAmount = newItems.reduce((s, i) => s + i.totalAmount, 0);
      }

      // auto-update status if not explicitly provided and there's at least one item
      if (typeof body.status !== "string" && newItems.length > 0) {
        data.status = stageToStatus(newItems[0].stage);
      }
    }

    // 3) Update the order
    const order = await db.order.update({ where: { id }, data });

    return NextResponse.json({ order, items: newItems });
  } catch (e) {
    return jsonError(e, "به‌روزرسانی ناموفق");
  }
}
