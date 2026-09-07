import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isFinanceStaff } from "@/lib/access";
import { logOrderEvent, actorNameOf } from "@/lib/order-events";
import { computeTotals, normalizeItems } from "@/lib/pre-invoice";
import { jsonError } from "@/lib/api-error";
import type { PreInvoiceItem } from "@/lib/pre-invoice";

// ─── Phase 15: هزینهٔ جامع — روی سفارش + آزاد + فاکتوری ──────────
//
// GET  /api/material-costs
//   ?orderId= &module=csv &status= &from= &to= &scope=all|order|free
//   &q= (نام/توضیح/شماره سفارش/مشتری) &categoryId= (دستهٔ آزاد)
//
// POST /api/material-costs
//   { orderId?, title?, supplierId?, expenseTypeId?, description?,
//     amount, module, includeInInvoice?, preInvoiceId?, attachments? }
//
//   • هزینه روی سفارش (orderId): چاپ/متریال/انبار/لجستیک/مالی —
//     pending تا تأیید مالی (هزینهٔ خودِ مالی → مستقیم approved).
//   • هزینهٔ آزاد (orderId=null): فقط مالی؛ دسته = expenseTypeId؛
//     مستقیم approved. («کرایهٔ مغازه»، «حقوق» و…)
//   • includeInInvoice=true (فقط مالی): هزینه مثل یک آیتم با نام خودش
//     در پیش‌فاکتور/فاکتور سفارش می‌نشیند، مبلغ کل سفارش را زیاد می‌کند
//     و در تاریخچهٔ سفارش (برای ادمین داخلی) دیده می‌شود.
//   • هر ردیف: «کی، از کدام ماژول، چه ساعتی» ثبت می‌شود (createdById/Name).

const VALID_MODULES = new Set(["print", "material", "warehouse", "finance", "logistics"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const mod = searchParams.get("module");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const scope = searchParams.get("scope"); // all | order | free
  const q = (searchParams.get("q") || "").trim();
  const categoryId = searchParams.get("categoryId");

  const where: Record<string, unknown> = {};
  if (orderId) where.orderId = orderId;
  if (scope === "order") where.orderId = { not: null };
  if (scope === "free") where.orderId = null;
  if (mod) {
    const mods = mod.split(",").map((m) => m.trim()).filter(Boolean);
    where.module = mods.length === 1 ? mods[0] : { in: mods };
  }
  if (status) where.status = status;
  if (categoryId) where.expenseTypeId = categoryId;
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }
  if (q) {
    const qNum = Number(q.replace(/[^\d]/g, ""));
    const or: Record<string, unknown>[] = [
      { title: { contains: q } },
      { description: { contains: q } },
      { order: { customer: { name: { contains: q } } } },
    ];
    if (Number.isFinite(qNum) && qNum > 0) or.push({ order: { number: qNum } });
    where.OR = or;
  }

  const costs = await db.materialCost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
      expenseType: true,
      attachments: true,
      material: { select: { id: true, name: true, unit: true } },
      createdByUser: { select: { id: true, name: true } },
      order: { include: { customer: true } },
    },
  });
  return NextResponse.json({ costs });
}

type AttachmentDraft = { url: string; fileName: string; mimeType?: string; size?: number };

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const finance = isFinanceStaff(user);

  try {
    const body = await req.json();
    const {
      orderId,
      title,
      supplierId,
      expenseTypeId,
      description,
      amount,
      fileUrl1,
      fileUrl2,
      module,
      includeInInvoice,
      preInvoiceId,
      attachments,
      materialId,
      materialQty,
    } = body;

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "مبلغ باید عددی بزرگ‌تر از صفر باشد" }, { status: 400 });
    }
    if (!Number.isFinite(numAmount) || numAmount > 1_000_000_000) {
      return NextResponse.json({ error: "مبلغ واردشده بیش از حد مجاز است" }, { status: 400 });
    }

    const isFree = !orderId;
    const costTitle = typeof title === "string" ? title.trim() : "";
    if (isFree && !costTitle) {
      return NextResponse.json({ error: "نام هزینهٔ آزاد الزامی است" }, { status: 400 });
    }

    // ── گیت‌های نقش ──
    if (isFree && !finance) {
      return NextResponse.json(
        { error: "ثبت هزینهٔ آزاد فقط توسط واحد مالی امکان‌پذیر است" },
        { status: 403 }
      );
    }
    if (includeInInvoice && !finance) {
      return NextResponse.json(
        { error: "ثبت هزینه در فاکتور فقط توسط واحد مالی امکان‌پذیر است" },
        { status: 403 }
      );
    }

    let mod = typeof module === "string" && VALID_MODULES.has(module) ? module : "print";
    if (isFree) mod = "finance";

    // ── اعتبارسنجی FKها ──
    let order: { id: string; number: number; totalAmount: number } | null = null;
    if (!isFree) {
      order = await db.order.findUnique({
        where: { id: orderId },
        select: { id: true, number: true, totalAmount: true },
      });
      if (!order) {
        return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
      }
    }
    if (supplierId) {
      const sup = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
      if (!sup) {
        return NextResponse.json({ error: "تامین‌کننده یافت نشد" }, { status: 400 });
      }
    }
    if (expenseTypeId) {
      const et = await db.expenseType.findUnique({
        where: { id: expenseTypeId },
        select: { id: true },
      });
      if (!et) {
        return NextResponse.json({ error: "نوع/دستهٔ هزینه یافت نشد" }, { status: 400 });
      }
    }

    // Phase 16: پیوند هزینه به مادهٔ اولیه (ورود به انبار با تأیید)
    let linkedMaterial: { id: string; name: string; unit: string } | null = null;
    if (materialId) {
      const mat = typeof materialId === "string"
        ? await db.material.findUnique({ where: { id: materialId }, select: { id: true, name: true, unit: true, isActive: true } })
        : null;
      if (!mat || !mat.isActive) {
        return NextResponse.json({ error: "مادهٔ اولیهٔ انتخابی یافت نشد یا غیرفعال است" }, { status: 400 });
      }
      const qty = Number(materialQty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000_000) {
        return NextResponse.json({ error: "مقدار ورود به انبار باید عددی مثبت باشد" }, { status: 400 });
      }
      linkedMaterial = { id: mat.id, name: mat.name, unit: mat.unit };
    }

    // ── پیوست‌ها ──
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

    // هزینهٔ خودِ مالی → مستقیم تأییدشده (نیازی به تأیید خودش ندارد)
    const status = finance && (isFree || mod === "finance" || includeInInvoice) ? "approved" : "pending";
    const actorName = await actorNameOf(user.id);

    const matStock =
      linkedMaterial && Number(materialQty) > 0
        ? { id: linkedMaterial.id, qty: Number(materialQty) }
        : null;

    const cost = await db.$transaction(async (tx) => {
      // ── هزینهٔ فاکتوری: تزریق به سند(ها) + مبلغ کل سفارش ──
      if (includeInInvoice && order) {
        await injectCostIntoDocs(tx, {
          orderId: order.id,
          preInvoiceId: typeof preInvoiceId === "string" ? preInvoiceId : null,
          costTitle: costTitle || "هزینهٔ اضافی",
          amount: numAmount,
        });
        await tx.order.update({
          where: { id: order.id },
          data: { totalAmount: { increment: numAmount } },
        });
      }

      const created = await tx.materialCost.create({
        data: {
          orderId: isFree ? null : orderId,
          supplierId: supplierId || null,
          expenseTypeId: expenseTypeId || null,
          title: costTitle || null,
          description: description || null,
          amount: numAmount,
          fileUrl1: fileUrl1 || null,
          fileUrl2: fileUrl2 || null,
          status,
          module: mod,
          includeInInvoice: !!includeInInvoice,
          preInvoiceId: includeInInvoice ? (typeof preInvoiceId === "string" ? preInvoiceId : null) : null,
          materialId: linkedMaterial?.id ?? null,
          materialQty: linkedMaterial ? Number(materialQty) : null,
          createdBy: user.id,
          createdById: user.id,
          createdByName: actorName ?? user.name,
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
        include: { attachments: true, expenseType: true, supplier: true },
      });

      // Phase 16: هزینهٔ هم‌اکنون تأییدشده با مادهٔ وصل → ورود فوری به انبار
      if (matStock && status === "approved") {
        await tx.materialStockMove.create({
          data: {
            materialId: matStock.id,
            delta: matStock.qty,
            reason: `خرید — ${costTitle || "هزینهٔ متریال"}`,
            costId: created.id,
            createdById: user.id,
            createdByName: actorName ?? user.name,
          },
        });
        await tx.material.update({
          where: { id: matStock.id },
          data: { quantity: { increment: matStock.qty } },
        });
      }

      return created;
    });

    // ── رویدادهای تاریخچه ──
    if (order) {
      if (includeInInvoice) {
        // هزینهٔ فاکتوری برای ادمین داخلی «غیرحساس» است — در فاکتور
        // سفارش نشسته و باید در تاریخچه دیده شود (خواستهٔ صریح).
        await logOrderEvent(db, {
          orderId: order.id,
          type: "cost_invoiced",
          stage: "finance",
          actorId: user.id,
          actorName,
          title: `هزینهٔ فاکتوری «${costTitle || "هزینهٔ اضافی"}» به سفارش اضافه شد`,
          description: `مبلغ: ${numAmount.toLocaleString("en-US")} دینار — به فاکتور/پیش‌فاکتور سفارش #${order.number} افزوده شد`,
          sensitive: false,
        });
      } else {
        // هزینهٔ عملیاتی (چاپ/متریال/انبار/لجستیک) — حساس، فقط مالی/مستر
        await logOrderEvent(db, {
          orderId: order.id,
          type: "cost_registered",
          stage: mod,
          actorId: user.id,
          actorName,
          title: `هزینه ${moduleLabel(mod)} ثبت شد`,
          description: `مبلغ: ${numAmount.toLocaleString("en-US")} دینار${costTitle ? ` — ${costTitle}` : ""}${drafts.length ? ` — ${drafts.length} پیوست` : ""}`,
          sensitive: true,
        });
      }
    }

    return NextResponse.json({ cost }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ایجاد هزینه");
  }
}

// ── تزریق هزینه به پیش‌فاکتور (سند هدف یا اولین سند) + فاکتور نهایی ──
async function injectCostIntoDocs(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  args: { orderId: string; preInvoiceId: string | null; costTitle: string; amount: number }
) {
  const costItem: PreInvoiceItem & { isCost?: boolean } = {
    name: args.costTitle,
    quantity: 1,
    unit: "عدد",
    unitPrice: args.amount,
    discount: 0,
    total: args.amount,
    isCost: true,
  };

  // سند هدف: صریح، وگرنه اولین پیش‌فاکتور (شمارهٔ کوچک‌تر)
  const pi = args.preInvoiceId
    ? await tx.preInvoice.findUnique({ where: { id: args.preInvoiceId } })
    : await tx.preInvoice.findFirst({
        where: { orderId: args.orderId },
        orderBy: { number: "asc" },
      });
  if (args.preInvoiceId && (!pi || pi.orderId !== args.orderId)) {
    throw new Error("INVALID_TARGET_PI");
  }

  if (pi) {
    const items = normalizeItems([...JSON.parse(pi.items), costItem]);
    const totals = computeTotals(items, pi.discountAmount, pi.taxRate);
    await tx.preInvoice.update({
      where: { id: pi.id },
      data: {
        items: JSON.stringify(items),
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
      },
    });
  }

  // فاکتور نهایی (اگر صادر شده و باطل نیست) — همیشه هم‌عدد با سفارش
  const inv = await tx.invoice.findUnique({ where: { orderId: args.orderId } });
  if (inv && inv.status !== "cancelled") {
    const items = normalizeItems([...JSON.parse(inv.items), costItem]);
    const totals = computeTotals(items, inv.discountAmount, inv.taxRate);
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        items: JSON.stringify(items),
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
      },
    });
  }
}

function moduleLabel(mod: string): string {
  if (mod === "material") return "متریال";
  if (mod === "warehouse") return "انبار";
  if (mod === "logistics") return "لجستیک";
  if (mod === "finance") return "مالی";
  return "چاپ";
}
