// Printoo24 ERP — Phase 18: دسترسی صفحه‌محور (سِرور-safe)
//
// منبع اعتبارسنجی «صفحات موجود هر ماژول» برای API کاربران — آینهٔ ساختاریِ
// NAV در lib/nav.ts (فقط شناسهٔ صفحات، بدون آیکون/برچسب تا در routeهای
// سرور import سبکی داشته باشد). اگر صفحه‌ای به NAV اضافه شد، همینجا هم
// اضافه شود (آزمون سازگاری در QC فاز انجام می‌شود).
//
// قرارداد UserModule.pages: JSON آرایهٔ شناسهٔ صفحات مجازِ همان ماژول؛
//   null  = همهٔ صفحات (سازگاری کامل با داده‌های قبلی)
//   []    → نامعتبر (به null نرمال می‌شود = همه)

export const PAGES_BY_MODULE: Record<string, string[]> = {
  admin: [
    "dashboard", "open-orders", "tasks", "calendar",
    "orders", "orders-new", "archive",
    "customers", "suppliers", "products", "expense-types", "locations",
  ],
  designer: ["dashboard", "orders", "calendar", "tasks"],
  print: ["orders", "tasks", "calendar"],
  warehouse: ["dashboard", "tasks", "calendar", "orders", "packages", "inventory"],
  finance: [
    "dashboard", "costs", "orders",
    "revenues", "unsettled",
    "payroll", "payroll-analytics",
  ],
  qc: ["dashboard", "reports", "calendar"],
  crm: ["dashboard", "pipeline", "customers", "deals", "activities"],
  srm: ["dashboard", "suppliers", "costs", "categories", "services", "compare"],
};

export type ModulePagesMap = Record<string, string[] | null>;

/** اعتبارسنجی/نرمال‌سازی ورودی modulePages از body.
 *  - فقط ماژول‌هایِ داخل mods معتبرند (کلید دیگر → خطا)
 *  - صفحهٔ ناموجود در آن ماژول → خطا (پیام فارسی)
 *  - آرایهٔ خالی/غیرآرایه → null (همهٔ صفحات)
 *  خروجی: { ok: true, value } نرمال‌شده برای ذخیره‌سازی، یا { ok:false, error } */
export function validateModulePages(
  mods: string[],
  raw: unknown
): { ok: true; value: ModulePagesMap } | { ok: false; error: string } {
  const value: ModulePagesMap = {};
  if (raw === null || raw === undefined) return { ok: true, value };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "ساختار modulePages نامعتبر است" };
  }
  for (const [key, pages] of Object.entries(raw as Record<string, unknown>)) {
    if (!mods.includes(key)) {
      return { ok: false, error: `ماژول ${key} در دسترسی‌های کاربر انتخاب نشده است` };
    }
    if (pages === null || pages === undefined || pages === "") {
      value[key] = null;
      continue;
    }
    if (!Array.isArray(pages)) {
      return { ok: false, error: `صفحات ماژول ${key} باید آرایه باشد` };
    }
    const allowed = PAGES_BY_MODULE[key] ?? [];
    for (const p of pages) {
      if (typeof p !== "string" || !allowed.includes(p)) {
        return { ok: false, error: `صفحهٔ «${String(p)}» در ماژول ${key} وجود ندارد` };
      }
    }
    value[key] = pages.length === 0 ? null : (pages as string[]);
  }
  return { ok: true, value };
}

/** serialize برای UserModule.pages — null → رشتهٔ null (SQL NULL). */
export function serializePages(pages: string[] | null): string | null {
  if (!pages || pages.length === 0) return null;
  return JSON.stringify(Array.from(new Set(pages)));
}
