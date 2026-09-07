import { db } from "@/lib/db";

// ─── Phase 14: ثبت رویدادهای سفارش (audit گردش کار) ─────────────
// هر اقدام ماژولی روی سفارش با «مرحله + تاریخ + عامل» ثبت می‌شود تا
// در تب تاریخچهٔ مودال ادمین داخلی نمایش داده شود.
// رویدادهای مالی (sensitive) برای ادمین داخلی مخفی می‌مانند.

type OrderEventType =
  | "created"
  | "design_completed"
  | "sent_to_print"
  | "material_confirmed"
  | "print_completed"
  | "sent_to_warehouse"
  | "qc_reported"
  | "qc_reviewed"
  | "qc_returned"
  | "status_changed"
  | "reassigned"
  | "cost_registered"
  // ─── Phase 15: مالی ──
  | "cost_invoiced" // هزینه در فاکتور نشست — برای ادمین داخلی «غیرحساس» است (خواستهٔ صریح)
  | "cost_approved"
  | "cost_rejected"
  | "payment_recorded"; // درآمد ثبت شد — حساس (ادمین داخلی نمی‌بیند)

export type LogOrderEventInput = {
  orderId: string;
  type: OrderEventType;
  stage?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  title: string;
  description?: string | null;
  sensitive?: boolean;
};

type Client = Pick<typeof db, "orderEvent"> | { orderEvent: { create: (args: unknown) => Promise<unknown> } };

/** Best-effort audit logging — هرگز عملیات اصلی را نمی‌شکند. */
export async function logOrderEvent(
  tx: typeof db | Client,
  input: LogOrderEventInput
): Promise<void> {
  try {
    await (tx as { orderEvent: { create: (args: unknown) => Promise<unknown> } }).orderEvent.create({
      data: {
        orderId: input.orderId,
        type: input.type,
        stage: input.stage ?? null,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        title: input.title,
        description: input.description ?? null,
        sensitive: input.sensitive ?? false,
      },
    });
  } catch (e) {
    console.error("[order-event] log failed:", e);
  }
}

/** اسم عامل را از DB می‌گیرد (برای اسنپ‌شات actorName). */
export async function actorNameOf(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    return u?.name ?? null;
  } catch {
    return null;
  }
}
