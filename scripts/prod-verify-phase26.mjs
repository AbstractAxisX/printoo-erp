// Printoo24 ERP — Phase 26 prod verification (READ-ONLY — هیچ mutation)
// node scripts/prod-verify-phase26.mjs [base]
const BASE = process.env.BASE_URL || "http://187.124.27.96:3000";
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}`)); };

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie: res.headers.get("set-cookie") };
}
const cookieOf = (sc) => { const m = /printoo24_session=[^;]+/.exec(sc || ""); return m?.[0] ?? null; };

async function main() {
  console.log(`── Phase 26 prod verify @ ${BASE} ──\n`);

  // 1) لاگین مستر
  const login = await api("/api/auth/login", { method: "POST", body: { email: "admin@printoo24.com", password: "admin123" } });
  const cookie = cookieOf(login.setCookie);
  ok(login.status === 200 && !!cookie, "لاگین مستر");

  // 2) bulk-settle بدون لاگین → 401
  const noAuth = await api("/api/finance/bulk-settle", { method: "POST", body: {} });
  ok(noAuth.status === 401, `بدون کوکی → 401 (گرفت: ${noAuth.status})`);

  // 3) ورودی نامعتبر → 400 (بدون mutation)
  const badBody = await api("/api/finance/bulk-settle", { method: "POST", cookie, body: {} });
  ok(badBody.status === 400 && /مشتری/.test(badBody.data?.error ?? ""), `بدون customerId → 400 فارسی`);
  const badCur = await api("/api/finance/bulk-settle", { method: "POST", cookie, body: { customerId: "x", currency: "EUR", amount: 1 } });
  ok(badCur.status === 400, `ارز نامعتبر → 400`);
  const badAmt = await api("/api/finance/bulk-settle", { method: "POST", cookie, body: { customerId: "x", currency: "IQD", amount: -1 } });
  ok(badAmt.status === 400, `مبلغ منفی → 400`);
  const noCust = await api("/api/finance/bulk-settle", { method: "POST", cookie, body: { customerId: "nonexistent-xyz", currency: "IQD", amount: 100 } });
  ok(noCust.status === 404, `مشتری ناموجود → 404`);

  // 4) مشتری واقعی بدون بدهی IQD → 409 (خواندن زنده، بدون mutation)
  const custs = await api("/api/customers", { cookie });
  ok(custs.status === 200 && Array.isArray(custs.data?.customers), "GET /api/customers");
  const noDebtCust = (custs.data.customers ?? []).find((c) => (c.unsettled ?? 0) <= 0.0001);
  if (noDebtCust) {
    const r409 = await api("/api/finance/bulk-settle", { method: "POST", cookie, body: { customerId: noDebtCust.id, currency: "IQD", amount: 1000 } });
    ok(r409.status === 409, `مشتری بدون بدهی → 409 (گرفت: ${r409.status} ${r409.data?.error ?? ""})`);
  } else {
    console.log("  ⏭ همهٔ مشتری‌ها بدهی دارند — چک 409 رد شد (بدون گزینهٔ امن)");
  }

  // 5) صفحات کلیدی زنده‌اند
  for (const [p, name] of [["/api/fx", "GET /api/fx"], ["/api/finance/summary", "GET /api/finance/summary"], ["/api/orders?excludeArchived=false", "GET /api/orders"], ["/api/auth/heartbeat", "POST heartbeat"]]) {
    const r = await api(p, p.includes("heartbeat") ? { method: "POST", cookie } : { cookie });
    ok(r.status === 200, `${name} → 200 (گرفت: ${r.status})`);
  }

  // 6) نرخ ارز هنوز بازار است (رگرسیون فاز ۲۵.۱)
  const fx = await api("/api/fx", { cookie });
  ok(
    Number(fx.data?.rates?.USD_IQD) > 1400 && Number(fx.data?.rates?.USD_IQD) < 2000,
    `نرخ بازار USD_IQD معقول (${fx.data?.rates?.USD_IQD})`
  );

  console.log(`\n═══ ${pass} ✅ / ${fail} ❌ ═══`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
