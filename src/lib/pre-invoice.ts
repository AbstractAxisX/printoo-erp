// Printoo24 ERP — PreInvoice shared helpers (Phase 7 rebuild)
//
// منبع واحد حقیقت برای شکل اقلام، محاسبهٔ مبالغ و چرخهٔ وضعیت
// پیش‌فاکتور — مشترک بین /api/pre-invoices، /api/orders (صدور همزمان
// با ثبت سفارش) و UI (ویزارد + تب مالی).
//
// شکل قلم: { name, quantity, unit, unitPrice, discount, total }
//   total = quantity × unitPrice − discount   (تخفیفِ هر ردیف)
//
// مبالغ:
//   subtotal       = Σ total ردیف‌ها
//   discountAmount = تخفیف سرجمع (روی کل پیش‌فاکتور)
//   taxAmount      = (subtotal − discount) × taxRate٪
//   totalAmount    = subtotal − discount + tax
//   paidAmount     = پیش‌پرداخت دریافتی (≤ totalAmount)
//
// چرخهٔ وضعیت:
//   draft → sent → approved → converted
//                 ↘ rejected
//   (حذف فقط در draft/sent/rejected؛ approved بعد از تبدیل قفل است)

export type PreInvoiceItemInput = {
  name: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discount?: number;
  total?: number;
};

export type PreInvoiceItem = {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
};

export const PRE_INVOICE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "converted",
] as const;
export type PreInvoiceStatus = (typeof PRE_INVOICE_STATUSES)[number];

export function isPreInvoiceStatus(v: unknown): v is PreInvoiceStatus {
  return (
    typeof v === "string" &&
    (PRE_INVOICE_STATUSES as readonly string[]).includes(v)
  );
}

/** انتقال‌های مجاز وضعیت — منبع واحد برای PATCH و UI */
export const STATUS_TRANSITIONS: Record<PreInvoiceStatus, PreInvoiceStatus[]> = {
  draft: ["sent", "rejected"],
  sent: ["approved", "rejected", "draft"],
  approved: ["converted", "sent"],
  rejected: ["sent", "draft"],
  converted: [],
};

export const STATUS_META: Record<
  PreInvoiceStatus,
  { label: string; badge: string }
> = {
  draft: {
    label: "پیش‌نویس",
    badge: "bg-muted text-muted-foreground",
  },
  sent: {
    label: "ارسال‌شده",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  approved: {
    label: "تاییدشده",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  rejected: {
    label: "ردشده",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  converted: {
    label: "تبدیل به فاکتور",
    badge: "bg-primary/15 text-primary",
  },
};

/**
 * نرمال‌سازی اقلام ورودی + محاسبهٔ total هر ردیف.
 * خروجی همیشه آرایه‌ای از اقلام سالم است یا خطای فارسی پرتاب می‌شود.
 */
export function normalizeItems(raw: unknown): PreInvoiceItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("حداقل یک قلم برای پیش‌فاکتور الزامی است");
  }
  return raw.map((r, idx) => {
    const it = r as Partial<PreInvoiceItemInput>;
    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name) throw new Error(`نام قلم ${idx + 1} خالی است`);
    const quantity = Number(it.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw new Error(`تعداد قلم «${name}» نامعتبر است`);
    const unitPrice = Number(it.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      throw new Error(`قیمت واحد قلم «${name}» نامعتبر است`);
    const discount = Math.max(0, Number(it.discount) || 0);
    const total = Math.max(0, quantity * unitPrice - discount);
    return {
      name,
      quantity,
      unit: typeof it.unit === "string" && it.unit ? it.unit : "عدد",
      unitPrice,
      discount,
      total,
    };
  });
}

export type PreInvoiceTotals = {
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
};

/** Phase 10: ساخت اقلام پیش‌فاکتور از خود آیتم‌های واقعی سفارش (سرور) */
export function itemsFromOrderItems(
  items: { product?: { name?: string | null; unit?: string | null } | null; note?: string | null; description?: string | null; quantity: number; pricePerUnit: number }[]
): PreInvoiceItem[] {
  return items.map((it) => {
    const name = (it.product?.name ?? "").trim() || "قلم سفارش";
    return {
      name,
      quantity: Number(it.quantity) || 1,
      unit: (it.product?.unit ?? "عدد") || "عدد",
      unitPrice: Number(it.pricePerUnit) || 0,
      discount: 0,
      total: Math.max(0, (Number(it.quantity) || 1) * (Number(it.pricePerUnit) || 0)),
    };
  });
}

/**
 * Phase 10 — قرارداد «به‌ازای چه» پیش‌فاکتور صادر می‌شود:
 *   • سفارش تفکیکی (مجزا) → هر آیتم سفارشِ خودش است → پیش‌فاکتور تک-آیتمی
 *     (خواستهٔ ۱ کاربر: «اگر سفارش مجزا بود به ازای هر ایتم جدا پیش فاکتور ثبت شه»)
 *   • چند-مشتری + گروهی → سفارش گروهیِ هر مشتری جدا می‌شود و «هر آیتم»
 *     داخلش پیش‌فاکتور خودش را می‌گیرد (خواستهٔ ۲: تفکیک مشتری + per-item)
 *   • گروهیِ تک-مشتری → یک پیش‌فاکتور برای کل گروه (خواستهٔ ۳: زمان‌بندی
 *     طراحی/چاپ «روی کل گروه»).
 */
export function isPerItemInvoice(
  splitMode: string,
  customerCount: number
): boolean {
  return splitMode === "separated" || customerCount > 1;
}

/** محاسبهٔ مبالغ کل از اقلام نرمال‌شده + تخفیف سرجمع + نرخ مالیات */
export function computeTotals(
  items: PreInvoiceItem[],
  discountAmount: number,
  taxRate: number
): PreInvoiceTotals {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const disc = Math.min(Math.max(0, Number(discountAmount) || 0), subtotal);
  const rate = Math.min(Math.max(0, Number(taxRate) || 0), 100);
  const taxAmount = Math.round((subtotal - disc) * (rate / 100));
  return {
    subtotal: Math.round(subtotal),
    discountAmount: Math.round(disc),
    taxRate: rate,
    taxAmount,
    totalAmount: Math.round(subtotal - disc + taxAmount),
  };
}
