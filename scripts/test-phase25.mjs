// Printoo24 ERP — Phase 25 test: چندارزی (IQD/USD/IRT) + حقوق شناور
// Run: node scripts/test-phase25.mjs
//
//  1) /api/fx — نرخ زنده (auto از er-api یا fallback) + IQD_IRT مشتق
//  2) /api/fx POST — نرخ دستی (مالی/مستر) → source=manual حاکم
//  3) هزینه با ارز USD → ذخیره + فیلتر ارزی + جمع تفکیکی sums
//  4) سفارش با ارز IRT → order.currency + پیش‌فاکتور خودکار همان ارز
//  5) پرداخت سفارش IRT → RevenueLog با currency=IRT
//  6) خلاصه مالی → sums (costs/revenue/unsettled per-currency + iqdEq)
//  7) حقوق شناور: payType=daily (نرخ×روز) / hourly (ساعت×نرخ) / casual
//     + ارز ورودی + سقف مساعدهٔ هم‌ارز
//  8) مساعده با ارز USD → currency ذخیره + هزینهٔ هم‌ارز
//  9) مشتریان → unsettledPer + unsettledMixed (additive)
// 10) پاک‌سازی کامل دیتای تستی

import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();

let pass = 0;
let fail = 0;
function ok(cond, name) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}`);
  }
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, data, setCookie };
}

function cookieOf(setCookie) {
  if (!setCookie) return null;
  const m = /printoo24_session=[^;]+/.exec(setCookie);
  return m ? m[0] : null;
}

const MASTER = { email: "admin@printoo24.com", password: "admin123" };

// ─── Setup ──────────────────────────────────────────────────────────────

async function main() {
  console.log("── Phase 25: چندارزی + حقوق شناور ──\n");

  // ── 0) لاگین مستر ──
  const login = await api("/api/auth/login", { method: "POST", body: MASTER });
  const cookie = cookieOf(login.setCookie);
  ok(login.status === 200 && !!cookie, "لاگین مستر");

  // ═══ 1) GET /api/fx — نرخ زنده ═══
  console.log("\n■ 1) نرخ لحظه‌ای ارز");
  const fx = await api("/api/fx", { cookie });
  ok(fx.status === 200, "GET /api/fx → 200");
  ok(
    fx.data?.rates && Number(fx.data.rates.USD_IQD) > 100 && Number(fx.data.rates.USD_IRT) > 1000,
    `نرخ‌ها معتبر (1USD=${fx.data?.rates?.USD_IQD} IQD / ${fx.data?.rates?.USD_IRT} IRT)`
  );
  ok(
    ["auto", "manual", "fallback"].includes(fx.data?.sources?.USD_IQD),
    `منبع نرخ: ${fx.data?.sources?.USD_IQD}`
  );
  ok(fx.data?.canEdit === true, "مستر canEdit=true");
  const autoIqd = Number(fx.data.rates.USD_IQD);

  // ═══ 2) POST /api/fx — نرخ دستی ═══
  console.log("\n■ 2) ثبت نرخ دستی (مالی/مستر)");
  const manual = await api("/api/fx", {
    method: "POST",
    cookie,
    body: { USD_IQD: autoIqd + 7, USD_IRT: Number(fx.data.rates.USD_IRT) },
  });
  ok(manual.status === 200 && manual.data?.ok === true, "POST نرخ دستی → 200");
  ok(
    Number(manual.data?.rates?.USD_IQD) === autoIqd + 7,
    `نرخ دستی حاکم شد (${autoIqd + 7} IQD)`
  );
  // برگشت به نرخ خودکار با فچ مجدد؟ — نرخ manual تا فچ بعدی معتبر است؛ کافی است.
  const fx2 = await api("/api/fx", { cookie });
  ok(Number(fx2.data.rates.USD_IQD) === autoIqd + 7, "نرخ manual در GET بعدی هم معتبر");

  // ── دیتای تستی ──
  const customer = await db.customer.create({
    data: {
      name: "P25 تست چندارزی",
      phone: "092500025",
      address: "تست",
    },
  });
  const product = await db.product.create({
    data: { name: "P25 محصول تست", basePrice: 0, unit: "عدد" },
  });

  // ═══ 3) هزینه با ارز دلار ═══
  console.log("\n■ 3) هزینه با ارز USD");
  const costUsd = await api("/api/material-costs", {
    method: "POST",
    cookie,
    body: {
      title: "P25 هزینه دلاری",
      amount: 25,
      currency: "USD",
      module: "finance",
      description: "تست فاز ۲۵",
    },
  });
  ok(costUsd.status === 201, "ثبت هزینهٔ آزاد دلاری → 201");
  ok(
    costUsd.data?.cost?.currency === "USD" && costUsd.data?.cost?.amount === 25,
    "هزینه با ارز USD ذخیره شد (25 USD)"
  );
  const costUsdId = costUsd.data?.cost?.id;

  const costIqd = await api("/api/material-costs", {
    method: "POST",
    cookie,
    body: {
      title: "P25 هزینه دیناری",
      amount: 100000,
      currency: "IQD",
      module: "finance",
    },
  });
  const costIqdId = costIqd.data?.cost?.id;
  ok(costIqd.status === 201, "ثبت هزینهٔ دیناری → 201");

  // فیلتر ارزی
  const onlyUsd = await api("/api/material-costs?currency=USD", { cookie });
  ok(
    onlyUsd.status === 200 &&
      (onlyUsd.data?.costs ?? []).every((c) => c.currency === "USD") &&
      (onlyUsd.data?.costs ?? []).some((c) => c.id === costUsdId),
    "فیلتر ?currency=USD فقط هزینه‌های دلاری"
  );
  ok(
    onlyUsd.data?.sums?.per && Number(onlyUsd.data.sums.per.USD) >= 25,
    `جمع تفکیکی USD: ${onlyUsd.data?.sums?.per?.USD}`
  );
  ok(
    Number(onlyUsd.data?.sums?.iqdEquivalent) >= 25 * (autoIqd + 7),
    `معادل دیناری: ${onlyUsd.data?.sums?.iqdEquivalent} IQD`
  );

  // ارز نامعتبر → IQD
  const costBad = await api("/api/material-costs", {
    method: "POST",
    cookie,
    body: { title: "P25 ارز خراب", amount: 5, currency: "EUR", module: "finance" },
  });
  ok(costBad.data?.cost?.currency === "IQD", "ارز نامعتبر → دیفالت IQD (ایمن)");
  const costBadId = costBad.data?.cost?.id;

  // ═══ 4) سفارش با ارز تومان ═══
  console.log("\n■ 4) سفارش با ارز IRT (تومان)");
  const orderRes = await api("/api/orders", {
    method: "POST",
    cookie,
    body: {
      customers: [customer.id],
      itemsByCustomer: {
        [customer.id]: [
          {
            productId: product.id,
            quantity: 3,
            pricePerUnit: 50000,
            totalAmount: 150000,
            stage: "design",
          },
        ],
      },
      splitMode: "grouped",
      priority: "normal",
      currency: "IRT",
      preInvoice: { paidAmount: 50000 },
    },
  });
  ok(orderRes.status === 201, "ساخت سفارش تومانی → 201");
  const order = orderRes.data?.created?.[0];
  const orderId = order?.id;
  const orderNumber = order?.number;
  const dbOrder = orderId ? await db.order.findUnique({ where: { id: orderId } }) : null;
  ok(dbOrder?.currency === "IRT", `order.currency=IRT (#${orderNumber})`);
  ok(dbOrder?.totalAmount === 150000 && dbOrder?.paidAmount === 50000, "مبالغ سالم (150,000 تومان / 50,000 پرداخت)");
  const pi = orderId
    ? await db.preInvoice.findFirst({ where: { orderId } })
    : null;
  ok(pi?.currency === "IRT", "پیش‌فاکتور خودکار همان ارز سفارش (IRT)");
  ok(pi?.totalAmount === 150000 && pi?.paidAmount === 50000, "پیش‌فاکتور مبالغ سالم");

  // ═══ 5) پرداخت تومانی → RevenueLog ═══
  const payRes = await api(`/api/orders/${orderId}/payments`, {
    method: "POST",
    cookie,
    body: { amount: 25000, method: "cash", note: "P25 تست" },
  });
  ok(payRes.status === 201, "ثبت دریافتی تومانی → 201");
  const revLog = await db.revenueLog.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  ok(revLog?.currency === "IRT", `RevenueLog.currency=IRT (مبلغ ${revLog?.amount})`);

  // ═══ 6) خلاصه مالی چندارزی ═══
  console.log("\n■ 6) خلاصهٔ مالی — جمع تفکیکی + معادل");
  const summary = await api("/api/finance/summary", { cookie });
  ok(summary.status === 200, "GET /api/finance/summary → 200");
  const sums = summary.data?.sums;
  ok(!!sums, "فیلد sums موجود");
  ok(
    Number(sums?.costs?.per?.USD) >= 25 && Number(sums?.costs?.per?.IQD) >= 100000,
    `هزینه‌ها تفکیک شدند (USD=${sums?.costs?.per?.USD}, IQD=${sums?.costs?.per?.IQD})`
  );
  ok(
    Number(sums?.revenue?.per?.IRT) >= 25000,
    `دریافتی تومانی تفکیک شد (IRT=${sums?.revenue?.per?.IRT})`
  );
  ok(
    Number(sums?.unsettled?.per?.IRT) >= 75000,
    `بستانکار تومانی (IRT=${sums?.unsettled?.per?.IRT})`
  );
  ok(
    Number(sums?.netProfitIqd) === Number(summary.data?.netProfit),
    "netProfit مسطح = netProfitIqd (سازگار UI قدیمی)"
  );

  // ═══ 7) حقوق شناور ═══
  console.log("\n■ 7) حقوق شناور — ماهانه/روزانه/ساعتی/موردی + ارز");
  // کارمند تستی
  const emp = await db.user.create({
    data: {
      name: "P25 کارمند تست",
      email: `p25emp-${Date.now()}@test.local`,
      password: "x",
      role: "designer",
      status: "active",
    },
  });
  // دورهٔ جاری را ensure کن (POST /api/payroll)
  await api("/api/payroll", { method: "POST", cookie });
  const period = await db.payrollPeriod.findFirst({
    where: { key: new Date().toISOString().slice(0, 7) },
  });
  ok(!!period, "دورهٔ جاری تضمین شد");

  // ورودی این کارمند را ensure خودکار ساخته — همان را می‌گیریم
  let entry = await db.payrollEntry.findFirst({
    where: { periodId: period.id, userId: emp.id },
  });
  if (!entry) {
    entry = await db.payrollEntry.create({
      data: { periodId: period.id, userId: emp.id },
    });
  }
  ok(!!entry, "ورودی حقوق کارمند تستی آماده");
  const putDaily = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: { payType: "daily", currency: "IRT", baseSalary: 50000, daysWorked: 12 },
  });
  ok(putDaily.status === 200, "PUT ورودی روزانه → 200");
  ok(
    putDaily.data?.netPay === 600000,
    `روزانه: 50,000 × 12 = ${putDaily.data?.netPay?.toLocaleString("en-US")} تومان ✓`
  );

  // ساعتی: 8 ساعت × 2,000 = 16,000
  const putHourly = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: { payType: "hourly", currency: "IQD", overtimeHours: 8, overtimeRate: 2000, baseSalary: 0 },
  });
  ok(
    putHourly.data?.netPay === 16000,
    `ساعتی: 8 × 2,000 = ${putHourly.data?.netPay?.toLocaleString("en-US")} دینار ✓`
  );

  // موردی (عشقی): مبلغ آزاد 300,000
  const putCasual = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: { payType: "casual", currency: "IRT", baseSalary: 300000 },
  });
  ok(putCasual.data?.netPay === 300000, `موردی: 300,000 تومان ✓`);

  // ماهانه: پایه 700,000 + اضافه‌کاری 2×10,000 − کمکرد 50,000 = 670,000
  const putMonthly = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: {
      payType: "monthly",
      currency: "IRT",
      baseSalary: 700000,
      overtimeHours: 2,
      overtimeRate: 10000,
      deduction: 50000,
    },
  });
  ok(putMonthly.data?.netPay === 670000, `ماهانه: 700,000 + 20,000 − 50,000 = 670,000 ✓`);

  // GET payroll — فیلدهای جدید سریالایز
  const payrollGet = await api("/api/payroll", { cookie });
  const entryApi = (payrollGet.data?.current?.entries ?? []).find((e) => e.id === entry.id);
  ok(
    entryApi?.payType === "monthly" && entryApi?.currency === "IRT",
    "GET /api/payroll → payType + currency سریالایز شد"
  );
  ok(
    !!payrollGet.data?.current?.currencyTotals?.net?.per,
    `currencyTotals موجود (IRT=${payrollGet.data?.current?.currencyTotals?.net?.per?.IRT})`
  );

  // سقف مساعدهٔ هم‌ارز: مساعدهٔ USD نمی‌تواند از ورودی IRT کسر شود
  const advUsd = await api("/api/payroll/advances", {
    method: "POST",
    cookie,
    body: { userId: emp.id, amount: 100, currency: "USD", note: "P25 مساعده دلاری" },
  });
  ok(advUsd.status === 201, "ثبت مساعدهٔ دلاری → 201");
  const advRow = await db.payrollAdvance.findFirst({
    where: { userId: emp.id },
    orderBy: { createdAt: "desc" },
  });
  ok(advRow?.currency === "USD" && advRow?.amount === 100, "مساعده USD ذخیره شد");
  const advCost = advRow?.costId
    ? await db.materialCost.findUnique({ where: { id: advRow.costId } })
    : null;
  ok(advCost?.currency === "USD", "سند هزینهٔ مساعده هم USD");

  // کسر بیشتر از سقف هم‌ارز → 400
  const overDeduct = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: { payType: "monthly", currency: "IRT", baseSalary: 700000, advanceDeducted: 500000 },
  });
  ok(
    overDeduct.status === 400,
    `کسر مساعدهٔ IRT بدون مانده → 400 (${overDeduct.data?.error?.slice(0, 40)}…)`
  );

  // قرارداد فقط از monthly
  const withContract = await api(`/api/payroll/entries/${entry.id}`, {
    method: "PUT",
    cookie,
    body: { payType: "daily", currency: "IQD", baseSalary: 25000, daysWorked: 10, updateContract: true },
  });
  const empAfter = await db.user.findUnique({ where: { id: emp.id } });
  ok(
    withContract.status === 200 && (empAfter?.baseSalary ?? 0) === 0,
    "updateContract با payType=daily قرارداد (User.baseSalary) را خراب نمی‌کند"
  );

  // ═══ 9) مشتریان — unsettledPer ═══
  console.log("\n■ 9) ماندهٔ مشتری چندارزی");
  const custList = await api("/api/customers", { cookie });
  const custRow = (custList.data?.customers ?? []).find((c) => c.id === customer.id);
  ok(!!custRow, "مشتری تستی در لیست");
  ok(
    custRow?.unsettledPer?.IRT >= 75000,
    `unsettledPer.IRT = ${custRow?.unsettledPer?.IRT?.toLocaleString("en-US")} (بستانکار تومانی)`
  );
  ok(
    typeof custRow?.unsettledMixed === "boolean",
    `unsettledMixed = ${custRow?.unsettledMixed}`
  );
  // ۷۵,۰۰۰ تومان ≈ ۶۶۰ دینار (نرخ ~150k تومان/دلار) — تبدیل واقعی، نه ۱:۱
  const iqdEqVal = Number(custRow?.unsettled);
  ok(
    iqdEqVal > 300 && iqdEqVal < 2000,
    `معادل دیناری unsettled = ${iqdEqVal.toLocaleString("en-US")} IQD (تبدیل واقعی IRT→IQD)`
  );

  // ═══ 10) پاک‌سازی ═══
  console.log("\n■ 10) پاک‌سازی دیتای تستی");
  try {
    await db.payrollAdvance.deleteMany({ where: { userId: emp.id } });
    await db.materialCost.deleteMany({
      where: { OR: [{ id: costUsdId }, { id: costIqdId }, { id: costBadId }, { id: advCost?.id }] },
    });
    await db.payrollEntry.deleteMany({ where: { userId: emp.id } });
    await db.user.delete({ where: { id: emp.id } });
    // روابط بدون-cascade (Payment/Task/Invoice/PreInvoice) → دستی؛ بقیه cascade
    await db.payment.deleteMany({ where: { orderId } });
    await db.task.deleteMany({ where: { orderId } });
    await db.invoice.deleteMany({ where: { orderId } });
    await db.preInvoice.deleteMany({ where: { orderId } });
    await db.revenueLog.deleteMany({ where: { orderId } });
    await db.orderEvent.deleteMany({ where: { orderId } });
    await db.orderItem.deleteMany({ where: { orderId } });
    await db.order.delete({ where: { id: orderId } });
    await db.product.delete({ where: { id: product.id } });
    await db.customer.delete({ where: { id: customer.id } });
    // سفارش‌های تستی جامانده از اجراهای شکستهٔ قبلی
    const leftovers = await db.order.findMany({
      where: { customer: { is: { name: { startsWith: "P25" } } } },
      select: { id: true },
    });
    for (const lo of leftovers) {
      const lid = lo.id;
      await db.payment.deleteMany({ where: { orderId: lid } });
      await db.task.deleteMany({ where: { orderId: lid } });
      await db.invoice.deleteMany({ where: { orderId: lid } });
      await db.preInvoice.deleteMany({ where: { orderId: lid } });
      await db.revenueLog.deleteMany({ where: { orderId: lid } });
      await db.orderEvent.deleteMany({ where: { orderId: lid } });
      await db.orderItem.deleteMany({ where: { orderId: lid } });
      await db.order.delete({ where: { id: lid } }).catch(() => {});
    }
    // نرخ دستی پاک — تاریخچه بماند بی‌ضرر؛ ردیف‌های manual سیید نیستند
    ok(true, "پاک‌سازی کامل (سفارش/هزینه/حقوق/مساعده/کارمند/مشتری/محصول)");
  } catch (e) {
    ok(false, `پاک‌سازی: ${e.message}`);
  }

  // ─── Summary ───
  console.log(`\n═══ نتیجه: ${pass} ✅ / ${fail} ❌ ═══`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await db.$disconnect();
  process.exit(1);
});
