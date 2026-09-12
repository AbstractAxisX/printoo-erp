import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireManager, validateAssigneeForModule } from "@/lib/access";
import { jsonError } from "@/lib/api-error";
import { logOrderEvent } from "@/lib/order-events";

// ─── PUT /api/orders/[id]/assignee — تغییر مجری سفارش (Phase 18) ────
//
// خواستهٔ کارفرما: «ادمین راحت کارمند سفارش را در هر بخش عوض کند؛ سفارش
// از پنل کارمند فعلی برداشته شود و به پنل کارمند جدید برود.»
//
// Body: { designerId?: string | null, printerId?: string | null }
//   - فقط کلیدهای ارسال‌شده تغییر می‌کنند (اختیاری هر کدام).
//   - مقدار "" یا null = بدون مجری (استخر عمومی).
//
// ریشهٔ باگِ QC‌شده: PUT عمومی سفارش، assignedDesignerId سطح-سفارش را عوض
// می‌کرد ولی designAssigneeId آیتم‌ها دست‌نخورده می‌ماند → فیلتر برد
// (clause 1: designAssigneeId = userId) همچنان سفارش را به مجریِ قدیمی
// نشان می‌داد و مجری تازه اصلاً نمی‌دید. این endpoint «آبشار» می‌کند:
//
//   designerId → order.assignedDesignerId + designAssigneeId همهٔ آیتم‌های
//                stage="design" (کارِ طراحیِ جاری — آیتم‌های تکمیل‌شده/انبار
//                تاریخ‌اند و دست نمی‌خورند)
//   printerId  → order.assignedPrinterId + printAssigneeId آیتم‌های
//                stage ∈ {design, print} (طرح چاپِ آیتم در مرحله طراحی هم
//                از الان مشخص است)
//
// اثرها: اعلان «واگذار شد» به مجری جدید + «از شما گرفته شد» به مجری
// قبلی + رویداد reassigned در تاریخچه سفارش. (PUT عمومی همین قرارداد
// را دارد اما فقط وقتی آیتم‌ها صریحاً بیایند — اینجا صریح و تضمینی است.)

type Body = {
  designerId?: string | null;
  printerId?: string | null;
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireManager();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  try {
    const body = (await req.json()) as Body;
    const hasDesigner = Object.prototype.hasOwnProperty.call(body, "designerId");
    const hasPrinter = Object.prototype.hasOwnProperty.call(body, "printerId");
    if (!hasDesigner && !hasPrinter) {
      return NextResponse.json(
        { error: "designerId یا printerId را ارسال کنید" },
        { status: 400 }
      );
    }

    // ── اعتبارسنجی مجری‌ها (موجود + فعال + دارندهٔ ماژول مربوطه) ──
    let newDesigner: string | null | undefined;
    let newPrinter: string | null | undefined;
    if (hasDesigner) {
      const check = await validateAssigneeForModule(body.designerId, "designer");
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      newDesigner = body.designerId || null;
    }
    if (hasPrinter) {
      const check = await validateAssigneeForModule(body.printerId, "print");
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      newPrinter = body.printerId || null;
    }

    // ── snapshot قبل از تغییر (برای اعلان‌ها + شمارش جابجایی) ──
    const before = await db.order.findUnique({
      where: { id },
      select: {
        number: true,
        customer: { select: { name: true } },
        assignedDesignerId: true,
        assignedPrinterId: true,
        items: {
          select: {
            id: true,
            stage: true,
            designAssigneeId: true,
            printAssigneeId: true,
            designCompletedBy: true,
            printCompletedBy: true,
          },
        },
      },
    });
    if (!before) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    // مجری مؤثر هر آیتم (مثل منطق اعلان PUT) — قبل از آبشار
    const effBefore = (stage: "design" | "print") => {
      const m = new Map<string, string | null>();
      for (const it of before.items) {
        if (stage === "design" && it.stage === "design") {
          m.set(it.id, it.designAssigneeId ?? before.assignedDesignerId ?? null);
        }
        if (stage === "print" && (it.stage === "print" || it.stage === "design")) {
          m.set(it.id, it.printAssigneeId ?? before.assignedPrinterId ?? null);
        }
      }
      return m;
    };
    const designBefore = effBefore("design");
    const printBefore = effBefore("print");

    // جابجایی واقعی؟ (مجری مؤثر فعلی سفارش ≠ مجری جدید)
    const currentDesignOwner = before.assignedDesignerId;
    const currentPrintOwner = before.assignedPrinterId;
    if (
      hasDesigner &&
      (newDesigner ?? null) === (currentDesignOwner ?? null) &&
      !before.items.some(
        (i) => i.stage === "design" && (i.designAssigneeId ?? null) !== (newDesigner ?? null)
      )
    ) {
      // هیچ تغییری در طراحی نیست — ولی همچنان اجرا می‌شود تا idempotent باشد
    }

    // ── اجرا (تراکنش): سطح سفارش + آبشار آیتم‌های جاری ──
    const moved = await db.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (newDesigner !== undefined) data.assignedDesignerId = newDesigner;
      if (newPrinter !== undefined) data.assignedPrinterId = newPrinter;
      await tx.order.update({ where: { id }, data });

      let designItems = 0;
      let printItems = 0;
      if (newDesigner !== undefined) {
        const r = await tx.orderItem.updateMany({
          where: { orderId: id, stage: "design" },
          data: { designAssigneeId: newDesigner },
        });
        designItems = r.count;
      }
      if (newPrinter !== undefined) {
        const r = await tx.orderItem.updateMany({
          where: { orderId: id, stage: { in: ["design", "print"] } },
          data: { printAssigneeId: newPrinter },
        });
        printItems = r.count;
      }
      return { designItems, printItems };
    });

    // ── snapshot بعد + اعلان‌ها + رویداد (best-effort) ──
    try {
      const after = await db.order.findUnique({
        where: { id },
        select: {
          assignedDesignerId: true,
          assignedPrinterId: true,
          items: {
            select: { id: true, stage: true, designAssigneeId: true, printAssigneeId: true },
          },
        },
      });
      if (after) {
        const effAfter = (stage: "design" | "print") => {
          const m = new Map<string, string | null>();
          for (const it of after.items) {
            if (stage === "design" && it.stage === "design") {
              m.set(it.id, it.designAssigneeId ?? after.assignedDesignerId ?? null);
            }
            if (stage === "print" && (it.stage === "print" || it.stage === "design")) {
              m.set(it.id, it.printAssigneeId ?? after.assignedPrinterId ?? null);
            }
          }
          return m;
        };
        const designAfter = effAfter("design");
        const printAfter = effAfter("print");

        const removed = new Map<string, string>(); // userId → stage
        const added = new Map<string, string>();
        for (const [itemId, oldU] of designBefore) {
          const newU = designAfter.get(itemId) ?? null;
          if (oldU && newU !== oldU) {
            removed.set(oldU, removed.get(oldU) ?? "design");
            if (newU) added.set(newU, added.get(newU) ?? "design");
          } else if (!oldU && newU) {
            added.set(newU, added.get(newU) ?? "design");
          }
        }
        for (const [itemId, oldU] of printBefore) {
          const newU = printAfter.get(itemId) ?? null;
          if (oldU && newU !== oldU) {
            removed.set(oldU, removed.get(oldU) ?? "print");
            if (newU) added.set(newU, added.get(newU) ?? "print");
          } else if (!oldU && newU) {
            added.set(newU, added.get(newU) ?? "print");
          }
        }

        const num = before.number;
        const custName = before.customer?.name;
        const notifs: {
          userId: string;
          title: string;
          message: string;
          type: string;
          link: string;
        }[] = [];
        for (const [uid, stage] of added) {
          notifs.push({
            userId: uid,
            title: "سفارش به شما واگذار شد",
            message: `مسئولیت ${stage === "design" ? "طراحی" : "چاپ"} سفارش #${num}${
              custName ? ` (${custName})` : ""
            } به شما واگذار شد — از پنل شما قابل اقدام است.`,
            type: "info",
            link: stage === "design" ? "designer:orders" : "print:orders",
          });
        }
        for (const [uid, stage] of removed) {
          if (added.has(uid)) continue; // جایگزینی در همان ماژول — نوتیف واگذاری کافی است
          notifs.push({
            userId: uid,
            title: "تخصیص سفارش از شما گرفته شد",
            message: `سفارش #${num}${
              custName ? ` (${custName})` : ""
            } دیگر به شما تخصیص ندارد — از پنل شما برداشته شد.`,
            type: "warning",
            link: stage === "design" ? "designer:orders" : "print:orders",
          });
        }
        if (notifs.length) await db.notification.createMany({ data: notifs });

        if (removed.size > 0 || added.size > 0) {
          const stageWord = (st: string | undefined) =>
            st === "design" ? "طراحی" : st === "print" ? "چاپ" : "—";
          const parts: string[] = [];
          for (const [, st] of removed) parts.push(`برداشتن از ${stageWord(st)}`);
          for (const [, st] of added) parts.push(`واگذاری ${stageWord(st)}`);
          const names = await db.user.findMany({
            where: { id: { in: [...removed.keys(), ...added.keys()] } },
            select: { id: true, name: true },
          });
          const nameOf = (uid: string) => names.find((n) => n.id === uid)?.name ?? uid;
          const detail: string[] = [];
          for (const [uid, st] of removed) detail.push(`${stageWord(st)} از ${nameOf(uid)}`);
          for (const [uid, st] of added) detail.push(`${stageWord(st)} به ${nameOf(uid)}`);
          await logOrderEvent(db, {
            orderId: id,
            type: "reassigned",
            stage: null,
            actorId: user.id,
            actorName: user.name,
            title: "تغییر مجری سفارش",
            description: `${parts.join("، ")} — ${detail.join("، ")}`,
          });
        }
      }
    } catch {
      // اعلان/رویداد best-effort — تغییر تخصیص هرگز به‌خاطرش نمی‌شکند
    }

    return NextResponse.json({
      ok: true,
      moved: {
        designItems: moved.designItems,
        printItems: moved.printItems,
      },
    });
  } catch (e) {
    return jsonError(e, "خطا در تغییر مجری سفارش");
  }
}
