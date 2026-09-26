#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PHASE 27 — final manual sweep: hand-picked display strings the automated
passes intentionally left (mixed-expression lines, multiline ternaries,
PAY_TYPES labels, badge texts, UNITS display site, timeline titles)."""

import re

def patch(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            print(f"  !! NOT FOUND in {path}: {old[:70]!r}")
            continue
        s = s.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(s)
    print("patched:", path)

# ── 1) payroll.ts — PAY_TYPES labels (aliased: local `t` var exists) ──────
patch("src/lib/payroll.ts", [
    ('import { db, type PrismaClient } from', 'import { t as tr } from "@/lib/i18n";\nimport { db, type PrismaClient } from') if False else
    ('if (t === "daily") return "روزانه";', 'if (t === "daily") return tr("روزانه");'),
    ('if (t === "hourly") return "ساعتی";', 'if (t === "hourly") return tr("ساعتی");'),
    ('if (t === "casual") return "موردی";', 'if (t === "casual") return tr("موردی");'),
    ('  return "ماهانه";', '  return tr("ماهانه");'),
])
# add the aliased import to payroll.ts (it has none)
s = open("src/lib/payroll.ts", encoding="utf-8").read()
if 'from "@/lib/i18n"' not in s:
    m = re.search(r'^import .*$', s, re.M)
    s = s[:m.start()] + 'import { t as tr } from "@/lib/i18n";\n' + s[m.start():]
    open("src/lib/payroll.ts", "w", encoding="utf-8").write(s)
    print("payroll.ts import added")

# ── 2) monitoring.ts — timeline titles (already imports tr) ──────────────
patch("src/lib/monitoring.ts", [
    ('title: log.action === "login" ? "ورود به سیستم" : "خروج از سیستم",',
     'title: log.action === "login" ? tr("ورود به سیستم") : tr("خروج از سیستم"),'),
])

# ── 3) package-badge.ts — QR badge texts (client-side DOM builder) ────────
patch("src/lib/package-badge.ts", [
    ('seqChip.textContent = `بستهٔ #${pkg.seq}`;',
     'seqChip.textContent = t("بستهٔ #{p0}", { p0: pkg.seq });'),
    ('scanHint.textContent = "برای پیگیری اسکن کنید";',
     'scanHint.textContent = t("برای پیگیری اسکن کنید");'),
])
s = open("src/lib/package-badge.ts", encoding="utf-8").read()
if 'from "@/lib/i18n"' not in s:
    m = re.search(r'^import .*$', s, re.M)
    s = s[:m.start()] + 'import { t } from "@/lib/i18n";\n' + s[m.start():]
    open("src/lib/package-badge.ts", "w", encoding="utf-8").write(s)
    print("package-badge.ts import added")

# ── 4) pre-invoice.ts — doc item defaults ─────────────────────────────────
patch("src/lib/pre-invoice.ts", [
    ('const name = (it.product?.name ?? "").trim() || "قلم سفارش";',
     'const name = (it.product?.name ?? "").trim() || t("قلم سفارش");'),
    ('unit: (it.product?.unit ?? "عدد") || "عدد",',
     'unit: t((it.product?.unit ?? "عدد") || "عدد"),'),
])
s = open("src/lib/pre-invoice.ts", encoding="utf-8").read()
if 'from "@/lib/i18n"' not in s:
    m = re.search(r'^import .*$', s, re.M)
    s = s[:m.start()] + 'import { t } from "@/lib/i18n";\n' + s[m.start():]
    open("src/lib/pre-invoice.ts", "w", encoding="utf-8").write(s)
    print("pre-invoice.ts import added")

# ── 5) mixed-expression JSX lines ─────────────────────────────────────────
patch("src/components/modules/print/print-orders.tsx", [
    ('موعد چاپ {formatDate(end)}{dr && dr.status !== "none" ? ` · ${dr.text}` : ""}',
     '{t("موعد چاپ {p0}{p1}", { p0: formatDate(end), p1: dr && dr.status !== "none" ? ` · ${dr.text}` : "" })}'),
    ('filterParts.push("اولویت: فوری");', 'filterParts.push(t("اولویت: فوری"));'),
    ('filterParts.push("اولویت: معمولی");', 'filterParts.push(t("اولویت: معمولی"));'),
])
patch("src/components/modules/designer/designer-orders.tsx", [
    ('موعد طراحی {formatDate(end)}{dr && dr.status !== "none" ? ` · ${dr.text}` : ""}',
     '{t("موعد طراحی {p0}{p1}", { p0: formatDate(end), p1: dr && dr.status !== "none" ? ` · ${dr.text}` : "" })}'),
])
patch("src/components/modules/warehouse/logistics-orders.tsx", [
    ('بعد از ثبت: کل پرداخت‌شده ={" "}',
     '{t("بعد از ثبت: کل پرداخت‌شده =")}{" "}'),
    ('{status !== "all" && activeFilter ? ` در «${activeFilter.label}»` : ""}',
     '{status !== "all" && activeFilter ? t(" در «{p0}»", { p0: activeFilter.label }) : ""}'),
])
patch("src/components/modules/print/print-order-detail.tsx", [
    ('<Icon name="check" size={9} /> چاپ شد:{" "}',
     '<Icon name="check" size={9} /> {t("چاپ شد:")}{" "}'),
])
patch("src/components/shared/bulk-settle-dialog.tsx", [
    ('<b>{formatMoney(result.totalApplied, result.currency)}</b> از{" "}',
     '<b>{formatMoney(result.totalApplied, result.currency)}</b> {t("از")}{" "}'),
])

# ── 6) finance-order-modal — multiline ternary template ───────────────────
patch("src/components/modules/finance/finance-order-modal.tsx", [
    ("""`ثبت شد — ${
          res.diff >= 0
            ? `دریافتی جدید: ${formatCurrency(res.diff)}`
            : `اصلاح: ${formatCurrency(Math.abs(res.diff))}`
        }`""",
     """t("ثبت شد — {p0}", {
          p0:
            res.diff >= 0
              ? t("دریافتی جدید: {p0}", { p0: formatCurrency(res.diff) })
              : t("اصلاح: {p0}", { p0: formatCurrency(Math.abs(res.diff)) }),
        })"""),
])

# ── 7) finance-costs — {expr} مورد lines ──────────────────────────────────
fc = open("src/components/modules/finance/finance-costs.tsx", encoding="utf-8").read()
for status in ("pending", "approved", "rejected"):
    old = '{allCosts.filter((c) => c.status === "%s").length.toLocaleString("en-US")} مورد' % status
    new = '{t("{p0} مورد", { p0: allCosts.filter((c) => c.status === "%s").length.toLocaleString("en-US") })}' % status
    if old in fc:
        fc = fc.replace(old, new, 1)
        print(f"finance-costs {status} wrapped")
open("src/components/modules/finance/finance-costs.tsx", "w", encoding="utf-8").write(fc)
if 'from "@/lib/i18n"' not in fc:
    fc = open("src/components/modules/finance/finance-costs.tsx", encoding="utf-8").read()
    m = re.search(r'^import .*$', fc, re.M)
    fc = fc[:m.start()] + 'import { t } from "@/lib/i18n";\n' + fc[m.start():]
    open("src/components/modules/finance/finance-costs.tsx", "w", encoding="utf-8").write(fc)
    print("finance-costs import added")

# ── 8) payroll-analytics — chart bits ─────────────────────────────────────
patch("src/components/modules/finance/payroll-analytics-page.tsx", [
    ('return m ? `${label} • ${fa(m.entriesCount)} ورودی` : label;',
     'return m ? t("{p0} • {p1} ورودی", { p0: label, p1: fa(m.entriesCount) }) : label;'),
    ('<Bar dataKey="paidSum" name="جمع پرداختی"',
     '<Bar dataKey="paidSum" name={t("جمع پرداختی")}'),
])

# ── 9) module-monitoring — legend line ────────────────────────────────────
mm = open("src/components/modules/sysadmin/module-monitoring-page.tsx", encoding="utf-8").read()
old = "میله‌های قرمز = دارای آیتم تاخیری"
if old in mm:
    mm = mm.replace(f"> {old} <", ">{t(\"%s\")}<" % old, 1)
    if old in mm:  # maybe bare line
        mm = mm.replace(f"\n{old}\n", f'\n{{t("{old}")}}\n', 1)
    open("src/components/modules/sysadmin/module-monitoring-page.tsx", "w", encoding="utf-8").write(mm)
    print("module-monitoring legend wrapped")

# ── 10) order-wizard — mixed lines ────────────────────────────────────────
patch("src/components/modules/admin/orders/order-wizard.tsx", [
    ('<th className="text-right font-medium px-3 py-2">آیتم{customers.length > 1 ? ` (${activeCustomer?.name ?? ""})` : ""}</th>',
     '<th className="text-right font-medium px-3 py-2">{t("آیتم{p0}", { p0: customers.length > 1 ? ` (${activeCustomer?.name ?? ""})` : "" })}</th>'),
    ('طراح: {designerUsers?.find((u) => u.id === it.designAssignee)?.name ?? "—"}',
     '{t("طراح: {p0}", { p0: designerUsers?.find((u) => u.id === it.designAssignee)?.name ?? "—" })}'),
    ('چاپ: {printerUsers?.find((u) => u.id === it.printAssignee)?.name ?? "—"}',
     '{t("چاپ: {p0}", { p0: printerUsers?.find((u) => u.id === it.printAssignee)?.name ?? "—" })}'),
    ('مجموع کل {items.length > 1 ? t("({p0} قلم)", { p0: fmtNum(items.length) }) : ""}:',
     '{t("مجموع کل{p0}:", { p0: items.length > 1 ? t("({p0} قلم)", { p0: fmtNum(items.length) }) : "" })}'),
])

# ── 11) UNITS display site ────────────────────────────────────────────────
inv = open("src/components/modules/warehouse/inventory-page.tsx", encoding="utf-8").read()
old = """                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}"""
new = """                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(u)}
                        </SelectItem>
                      ))}"""
if old in inv:
    inv = inv.replace(old, new, 1)
    open("src/components/modules/warehouse/inventory-page.tsx", "w", encoding="utf-8").write(inv)
    print("UNITS display wrapped")
else:
    print("!! UNITS pattern not found")

print("DONE")
