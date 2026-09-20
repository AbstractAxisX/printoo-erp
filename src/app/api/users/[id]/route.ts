import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, safeParsePages } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isModuleKey } from "@/lib/access";
import { serializePages, validateModulePages, validateModuleLevels, serializeLevel } from "@/lib/module-pages";

// PUT /api/users/[id] — update a user (master only).
//
// Body (all optional, only provided fields are applied):
//   { name?, phone?, status?, password?, modules?: string[], modulePages? }
//
// Phase 12 — modules:
//   - آرایهٔ جدید «جایگزین» کامل ست قبلی می‌شود (حذف + ایجاد در تراکنش).
//   - حداقل یک ماژول برای کاربر غیر-master الزامی است.
//   - role ستونِ اول بازآینه می‌شود (compat).
//   - توجه: حذف ماژول، تخصیص‌های بازِ قبلی را نمی‌بندد؛ سفارش‌های تخصیصی
//     به استخر عمومی برنمی‌گردند تا کارگزینی وسط راه گم نشود.
//   - status: "active" | "inactive" — deactivating REMOVES the user from
//     assignee pickers everywhere without destroying their history.
//   - A master cannot deactivate THEMSELVES (lockout guard).
//
// Phase 18 — modulePages (Record<module, page[]|null>):
//   - فقط همراه modules (یا مستقل برای به‌روزرسانی صفحات بدون تغییر ماژول‌ها).
//   - جایگزینی کامل ستِ صفحات همان ماژول‌ها؛ ماژول بدون کلید → null (همه).
//
// Phase 24 — moduleLevels (Record<module, "view"|"edit"|"delete">):
//   - سطح ۳لایهٔ هر ماژول — همراه modules یا مستقل؛ اعمال فوری (proxy).
//
// Response: { user } — public shape + modules + modulePages + moduleLevels (no password).

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
  status: true,
  createdAt: true,
  modules: { select: { module: true, pages: true, level: true } },
} as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireUser();
  if (session instanceof NextResponse) return session;

  if (session.role !== "master") {
    return NextResponse.json(
      { error: "فقط مدیر ارشد می‌تواند کاربران را ویرایش کند" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, phone, status, password, modules, role, modulePages, moduleLevels } = body ?? {};

    const target = await db.user.findUnique({
      where: { id },
      include: { modules: { select: { module: true, pages: true, level: true } } },
    });
    if (!target) {
      return NextResponse.json(
        { error: "کاربر یافت نشد" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "نام نمی‌تواند خالی باشد" }, { status: 400 });
      }
      data.name = name.trim();
    }

    // ─── Phase 12: ماژول‌ها (جایگزینی کامل — فقط برای غیر-master) ──
    let newModules: string[] | null = null;
    // Phase 18: صفحات مجاز (جایگزینی/به‌روزرسانی)
    let newModulePages: Record<string, string[] | null> | null = null;
    // Phase 24: سطح ۳لایهٔ ماژول‌ها (جایگزینی/به‌روزرسانی)
    let newModuleLevels: Record<string, string> | null = null;
    if (Array.isArray(modules)) {
      if (target.role === "master") {
        return NextResponse.json(
          { error: "مدیر ارشد دسترسی ضمنی به همهٔ ماژول‌ها دارد — ماژول تکی ندارد" },
          { status: 400 }
        );
      }
      const mods = modules.map((m: unknown) => String(m)).filter(Boolean);
      if (mods.length === 0) {
        return NextResponse.json(
          { error: "حداقل یک ماژول (سطح دسترسی) باید فعال بماند" },
          { status: 400 }
        );
      }
      const bad = mods.find((m) => !isModuleKey(m));
      if (bad) {
        return NextResponse.json(
          { error: `ماژول نامعتبر: ${bad}` },
          { status: 400 }
        );
      }
      newModules = Array.from(new Set(mods));
      data.role = newModules[0]; // آینهٔ ماژول اول (compat نمایش)
    } else if (typeof role === "string" && role && target.role !== "master") {
      // سازگاری قدیمی: role تکی → تک-ماژول (اگر modules نیامده)
      if (!isModuleKey(role)) {
        return NextResponse.json(
          { error: `نقش/ماژول نامعتبر: ${role}` },
          { status: 400 }
        );
      }
      newModules = [role];
      data.role = role;
    }

    // ─── Phase 18: صفحات مجاز هر ماژول ───────────────────────
    // modulePages می‌تواند همراه modules بیاید (ایجاد کامل ست جدید) یا
    // مستقل (فقط به‌روزرسانی صفحات ماژول‌های موجود). اعتبارسنجی روی ست
    // نهایی ماژول‌ها انجام می‌شود.
    const finalModules =
      newModules ?? target.modules.map((m) => m.module).filter((m) => target.role !== "master");
    const hasModulePages =
      modulePages !== undefined && modulePages !== null && typeof modulePages === "object";
    if (hasModulePages) {
      if (target.role === "master") {
        return NextResponse.json(
          { error: "مدیر ارشد دسترسی ضمنی به همهٔ صفحات دارد — محدودیت صفحه‌ای ندارد" },
          { status: 400 }
        );
      }
      const pagesCheck = validateModulePages(finalModules, modulePages);
      if (!pagesCheck.ok) {
        return NextResponse.json({ error: pagesCheck.error }, { status: 400 });
      }
      newModulePages = pagesCheck.value;
    }

    // ─── Phase 24: سطح ۳لایهٔ هر ماژول ───────────────────────
    const hasModuleLevels =
      moduleLevels !== undefined && moduleLevels !== null && typeof moduleLevels === "object";
    if (hasModuleLevels) {
      if (target.role === "master") {
        return NextResponse.json(
          { error: "مدیر ارشد دسترسی کامل دارد — سطح محدود نمی‌گیرد" },
          { status: 400 }
        );
      }
      const levelsCheck = validateModuleLevels(finalModules, moduleLevels);
      if (!levelsCheck.ok) {
        return NextResponse.json({ error: levelsCheck.error }, { status: 400 });
      }
      newModuleLevels = levelsCheck.value;
    }

    if (phone !== undefined) {
      data.phone = phone ? String(phone).trim() : null;
    }

    if (status !== undefined) {
      if (status !== "active" && status !== "inactive") {
        return NextResponse.json(
          { error: `وضعیت نامعتبر: ${status}` },
          { status: 400 }
        );
      }
      if (target.id === session.id && status === "inactive") {
        return NextResponse.json(
          { error: "نمی‌توانید حساب خودتان را غیرفعال کنید" },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (password !== undefined && password !== null && password !== "") {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "رمز عبور باید حداقل 6 کاراکتر باشد" },
          { status: 400 }
        );
      }
      data.password = await hashPassword(password);
    }

    if (
      Object.keys(data).length === 0 &&
      newModules === null &&
      newModulePages === null &&
      newModuleLevels === null
    ) {
      return NextResponse.json(
        { error: "هیچ فیلدی برای به‌روزرسانی ارسال نشده است" },
        { status: 400 }
      );
    }

    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: PUBLIC_SELECT,
      });
      if (newModules) {
        const current = target.modules.map((m) => m.module);
        const toDelete = current.filter((m) => !newModules!.includes(m));
        const toCreate = newModules.filter((m) => !current.includes(m));
        for (const m of toDelete) {
          await tx.userModule.delete({
            where: { userId_module: { userId: id, module: m } },
          });
        }
        if (toCreate.length) {
          await tx.userModule.createMany({
            data: toCreate.map((m) => ({
              userId: id,
              module: m,
              // Phase 18: صفحات ماژول تازه (کلید نداشته باشد = همه)
              pages: serializePages(newModulePages?.[m] ?? null),
              // Phase 24: سطح ماژول تازه (کلید نداشته باشد = delete کامل)
              level: serializeLevel(newModuleLevels?.[m] ?? "delete"),
            })),
          });
        }
        // Phase 18 (fix): صفحات ماژول‌های «مانده» هم با همین PUT نوشته شوند —
        // قبلاً فقط ماژول‌های تازه‌ایجاد صفحات می‌گرفتند و کلید همراه modules
        // برای ماژول‌های موجود بی‌اثر می‌ماند (ریشهٔ «محدودیت ذخیره نشد»).
        if (newModulePages) {
          for (const [m, pages] of Object.entries(newModulePages)) {
            if (toCreate.includes(m)) continue; // بالا نوشته شد
            await tx.userModule.updateMany({
              where: { userId: id, module: m },
              data: { pages: serializePages(pages) },
            });
          }
        }
        // Phase 24: سطح ماژول‌های «مانده» هم همین‌جا نوشته شود
        if (newModuleLevels) {
          for (const [m, level] of Object.entries(newModuleLevels)) {
            if (toCreate.includes(m)) continue; // بالا نوشته شد
            await tx.userModule.updateMany({
              where: { userId: id, module: m },
              data: { level: serializeLevel(level) },
            });
          }
        }
      }
      // Phase 18: به‌روزرسانی صفحات ماژول‌ها بدون تغییر خود ماژول‌ها
      if (newModulePages && !newModules) {
        for (const [m, pages] of Object.entries(newModulePages)) {
          await tx.userModule.updateMany({
            where: { userId: id, module: m },
            data: { pages: serializePages(pages) },
          });
        }
      }
      // Phase 24: به‌روزرسانی سطح ماژول‌ها بدون تغییر خود ماژول‌ها
      if (newModuleLevels && !newModules) {
        for (const [m, level] of Object.entries(newModuleLevels)) {
          await tx.userModule.updateMany({
            where: { userId: id, module: m },
            data: { level: serializeLevel(level) },
          });
        }
      }
      return tx.user.findUnique({ where: { id }, select: PUBLIC_SELECT });
    });

    return NextResponse.json({
      user: {
        ...user,
        modules: user?.role === "master" ? [] : (user?.modules ?? []).map((m) => m.module),
        modulePages:
          user?.role === "master"
            ? {}
            : Object.fromEntries(
                (user?.modules ?? []).map((m) => [
                  m.module,
                  m.pages ? safeParsePages(m.pages) : null,
                ])
              ),
        moduleLevels:
          user?.role === "master"
            ? {}
            : Object.fromEntries(
                (user?.modules ?? []).map((m) => [
                  m.module,
                  serializeLevel(m.level),
                ])
              ),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "خطا در به‌روزرسانی کاربر" },
      { status: 500 }
    );
  }
}
