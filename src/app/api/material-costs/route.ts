import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logOrderEvent, actorNameOf } from "@/lib/order-events";
import { jsonError } from "@/lib/api-error";

// ─── Phase 14: ثبت هزینه با پیوست واقعی (آپلود) ────────────────
// POST body:
//   { orderId, supplierId?, expenseTypeId?, description?, amount,
//     module: "print" | "material" | "warehouse",
//     attachments?: [{ url, fileName, mimeType, size }] }
// legacy fileUrl1/fileUrl2 همچنان پذیرفته می‌شود (compat).
// ثبت هزینه حساس (مالی) است → OrderEvent با sensitive=true؛
// ادمین داخلی آن را در تاریخچه نمی‌بیند (فقط مالی/مستر).

const VALID_MODULES = new Set(["print", "material", "warehouse"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const mod = searchParams.get("module");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (orderId) where.orderId = orderId;
  if (mod) where.module = mod;
  if (status) where.status = status;
  const costs = await db.materialCost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
      expenseType: true,
      attachments: true,
      order: { include: { customer: true } },
    },
  });
  return NextResponse.json({ costs });
}

type AttachmentDraft = { url: string; fileName: string; mimeType?: string; size?: number };

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const body = await req.json();
    const {
      orderId,
      supplierId,
      expenseTypeId,
      description,
      amount,
      fileUrl1,
      fileUrl2,
      module,
      attachments,
    } = body;
    if (!orderId || !amount) {
      return NextResponse.json({ error: "سفارش و مبلغ الزامی است" }, { status: 400 });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "مبلغ باید عددی بزرگ‌تر از صفر باشد" }, { status: 400 });
    }
    const mod = typeof module === "string" && VALID_MODULES.has(module) ? module : "print";

    // اعتبارسنجی سفارش (FK guard — درس‌گرفته از P2003)
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, number: true },
    });
    if (!order) {
      return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    }

    // اعتبارسنجی تامین‌کننده / نوع هزینه (FK guard)
    if (supplierId) {
      const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
      if (!sup) {
        return NextResponse.json({ error: "تامین‌کننده یافت نشد" }, { status: 400 });
      }
    }
    if (expenseTypeId) {
      const et = await db.expenseType.findUnique({ where: { id: expenseTypeId }, select: { id: true } });
      if (!et) {
        return NextResponse.json({ error: "نوع هزینه یافت نشد" }, { status: 400 });
      }
    }

    // پیوست‌ها: فقط URLهای داخلی آپلود پذیرفته می‌شوند
    const drafts: AttachmentDraft[] = Array.isArray(attachments) ? attachments : [];
    if (drafts.length > 6) {
      return NextResponse.json({ error: "حداکثر ۶ پیوست برای هر هزینه" }, { status: 400 });
    }
    for (const a of drafts) {
      if (typeof a?.url !== "string" || !a.url.startsWith("/uploads/")) {
        return NextResponse.json(
          { error: "پیوست نامعتبر — فایل را از دکمهٔ آپلود انتخاب کنید" },
          { status: 400 }
        );
      }
      if (typeof a.fileName !== "string" || !a.fileName.trim()) {
        return NextResponse.json({ error: "نام پیوست نامعتبر است" }, { status: 400 });
      }
    }

    const cost = await db.materialCost.create({
      data: {
        orderId,
        supplierId: supplierId || null,
        expenseTypeId: expenseTypeId || null,
        description: description || null,
        amount: numAmount,
        fileUrl1: fileUrl1 || null,
        fileUrl2: fileUrl2 || null,
        module: mod,
        createdBy: user.id,
        ...(drafts.length > 0
          ? {
              attachments: {
                create: drafts.map((a) => ({
                  url: a.url,
                  fileName: a.fileName.trim().slice(0, 200),
                  mimeType: a.mimeType ?? "",
                  size: Number(a.size) || 0,
                })),
              },
            }
          : {}),
      },
      include: { attachments: true },
    });

    // رویداد حساس مالی — فقط مالی/مستر می‌بیند (سensitive=true)
    const actorName = await actorNameOf(user.id);
    await logOrderEvent(db, {
      orderId,
      type: "cost_registered",
      stage: mod,
      actorId: user.id,
      actorName,
      title: `هزینه ${moduleLabel(mod)} ثبت شد`,
      description: `مبلغ: ${numAmount.toLocaleString("en-US")} دینار${drafts.length ? ` — ${drafts.length} پیوست` : ""}`,
      sensitive: true,
    });

    return NextResponse.json({ cost }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد هزینه");
  }
}

function moduleLabel(mod: string): string {
  if (mod === "material") return "متریال";
  if (mod === "warehouse") return "انبار";
  return "چاپ";
}
