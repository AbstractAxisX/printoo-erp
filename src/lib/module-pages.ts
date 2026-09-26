import { t } from "@/lib/i18n";
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

// ─── Phase 24: دسترسی ۳لایهٔ هر ماژول (مشاهده / ادیت / حذف) ───────────
export const MODULE_LEVELS = ["view", "edit", "delete"] as const;
export type ModuleLevel = (typeof MODULE_LEVELS)[number];

export const MODULE_LEVEL_META: Record<
  ModuleLevel,
  { label: string; hint: string; rank: number }
> = {
  view: {
    label: t("مشاهده"),
    hint: t("فقط می‌بیند — هیچ ثبت، ویرایش یا حذفی نمی‌تواند انجام دهد"),
    rank: 1,
  },
  edit: {
    label: t("ادیت"),
    hint: t("می‌بیند و ثبت/ویرایش می‌کند — فقط حذف برایش بسته است"),
    rank: 2,
  },
  delete: {
    label: t("حذف"),
    hint: t("دسترسی کامل — مشاهده، ثبت/ویرایش و حذف"),
    rank: 3,
  },
};

export function isModuleLevel(v: unknown): v is ModuleLevel {
  return typeof v === "string" && (MODULE_LEVELS as readonly string[]).includes(v);
}

/** اعتبارسنجی/نرمال‌سازی سطح دسترسی ماژول‌ها از body.
 *  - فقط ماژول‌های داخل mods معتبرند
 *  - مقدار نامعتبر/غایب → "delete" (دیفالت = رفتار قبلی)
 *  خروجی: Record<module, level> */
export function validateModuleLevels(
  mods: string[],
  raw: unknown
): { ok: true; value: Record<string, ModuleLevel> } | { ok: false; error: string } {
  const value: Record<string, ModuleLevel> = {};
  if (raw === null || raw === undefined) return { ok: true, value };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: t("ساختار moduleLevels نامعتبر است") };
  }
  for (const [key, level] of Object.entries(raw as Record<string, unknown>)) {
    if (!mods.includes(key)) {
      return { ok: false, error: t("ماژول {p0} در دسترسی‌های کاربر انتخاب نشده است", { p0: key }) };
    }
    if (level === null || level === undefined || level === "") {
      value[key] = "delete";
      continue;
    }
    if (!isModuleLevel(level)) {
      return {
        ok: false,
        error: t("سطح دسترسی «{p0}» معتبر نیست (مشاهده / ادیت / حذف)", { p0: String(level) }),
      };
    }
    value[key] = level;
  }
  return { ok: true, value };
}

/** serialize برای UserModule.level — همیشه مقدار معتبر. */
export function serializeLevel(level: ModuleLevel | string | null | undefined): ModuleLevel {
  return isModuleLevel(level) ? level : "delete";
}

/** بالاترین سطح از میان ماژول‌های داده‌شده — برای گیت مرکزی proxy.
 *  ماژولِ نداشته = سطح 0 (در محاسبهٔ max بی‌اثر می‌ماند). */
export function maxLevel(
  moduleLevels: Record<string, ModuleLevel> | null | undefined,
  modules: string[]
): ModuleLevel {
  let rank = 0;
  for (const m of modules) {
    const lv = moduleLevels?.[m];
    if (isModuleLevel(lv)) {
      const r = MODULE_LEVEL_META[lv].rank;
      if (r > rank) rank = r;
    }
  }
  if (rank >= 3) return "delete";
  if (rank === 2) return "edit";
  if (rank === 1) return "view";
  return "view"; // هیچ ماژولی نبود → محافظه‌کارانه view
}

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
    return { ok: false, error: t("ساختار modulePages نامعتبر است") };
  }
  for (const [key, pages] of Object.entries(raw as Record<string, unknown>)) {
    if (!mods.includes(key)) {
      return { ok: false, error: t("ماژول {p0} در دسترسی‌های کاربر انتخاب نشده است", { p0: key }) };
    }
    if (pages === null || pages === undefined || pages === "") {
      value[key] = null;
      continue;
    }
    if (!Array.isArray(pages)) {
      return { ok: false, error: t("صفحات ماژول {p0} باید آرایه باشد", { p0: key }) };
    }
    const allowed = PAGES_BY_MODULE[key] ?? [];
    for (const p of pages) {
      if (typeof p !== "string" || !allowed.includes(p)) {
        return { ok: false, error: t("صفحهٔ «{p0}» در ماژول {p1} وجود ندارد", { p0: String(p), p1: key }) };
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
