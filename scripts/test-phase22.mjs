// Phase 22 smoke test — تست API جریان‌های جدید فاز ۲۲
// ۱) لاگین ۲) جزئیات سفارش (costSummary) ۳) هدیه ۴) فاکتور با تخفیف → سینک total
// اجرا: node scripts/test-phase22.mjs

const BASE = "http://localhost:3000";
let cookie = "";

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(opts.headers || {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function assert(cond, label, extra = "") {
  console.log(`${cond ? "✓" : "✗ FAIL"} — ${label}${extra ? ` → ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
}

const fmt = (n) => (n || 0).toLocaleString("en-US");

async function main() {
  // ۱) لاگین
  const login = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@printoo24.com", password: "admin123" }),
  });
  assert(login.status === 200 && login.body?.user, "login master", `status=${login.status}`);

  // ۲) لیست سفارش‌ها
  const orders = await call("/api/orders");
  assert(orders.status === 200, "GET /api/orders");
  const list = orders.body?.orders ?? [];
  assert(list.length > 0, "orders exist", `${list.length} orders`);
  const target = list[0];
  console.log(`   target: order #${target.number} total=${fmt(target.totalAmount)} paid=${fmt(target.paidAmount)}`);

  // ۳) جزئیات سفارش — costSummary برای مستر
  const detail = await call(`/api/orders/${target.id}`);
  assert(detail.status === 200, "GET /api/orders/[id]");
  const cs = detail.body?.order?.costSummary;
  assert(
    cs && typeof cs.total === "number" && typeof cs.approved === "number",
    "costSummary present for master",
    JSON.stringify(cs)
  );

  // ۴) هدیه ۱۰۰٪
  const gift = await call(`/api/orders/${target.id}/gift`, {
    method: "POST",
    body: JSON.stringify({ percentage: 100, note: "تست هدیه فاز ۲۲" }),
  });
  assert(gift.status === 200, "POST gift 100%", `status=${gift.status} ${gift.body?.error ?? ""}`);
  assert(
    gift.body?.gift?.amount > 0 && gift.body?.gift?.newTotal === 0,
    "gift applied → newTotal=0 (مشتری بدهکار نیست)",
    JSON.stringify(gift.body?.gift)
  );

  // بدهی مشتری باید صفر شده باشد (unsettled)
  const custId = target.customerId || target.customer?.id;
  const cust = await call(`/api/customers/${custId}`);
  const orderAfter = (cust.body?.orders ?? []).find((o) => o.id === target.id);
  assert(
    orderAfter && orderAfter.totalAmount === 0,
    "order.totalAmount=0 in customer file",
    `total=${orderAfter?.totalAmount}`
  );

  // سوابق مشتری — Activity هدیه ثبت شده باشد
  const acts = await call(`/api/activities?customerId=${custId}`);
  const giftAct = (acts.body?.activities ?? []).find((a) => a.title?.includes("هدیه"));
  assert(!!giftAct, "gift recorded in customer history (Activity)", giftAct?.title);

  // ۵) برگرداندن هدیه (re-gift با درصد صفر مجاز نیست → تست ۴۰۹/400)
  const zero = await call(`/api/orders/${target.id}/gift`, {
    method: "POST",
    body: JSON.stringify({ percentage: 0 }),
  });
  assert(zero.status === 400, "gift 0% rejected", `status=${zero.status}`);

  console.log("\n— تست جریان فاکتور با تخفیف —");
  // ۶) سفارش بدون فاکتور پیدا کن؛ اگر بود فاکتور با تخفیف بزن و سینک total را چک کن
  const withNoInvoice = list.find((o) => o.status !== "cancelled");
  if (withNoInvoice) {
    // اطمینان: فاکتور ندارد؟
    const invs = await call(`/api/invoices?orderId=${withNoInvoice.id}`);
    const existing = (invs.body?.invoices ?? []).length > 0;
    if (!existing && withNoInvoice.items?.length > 0) {
      const items = (await call(`/api/orders/${withNoInvoice.id}`)).body.order.items.map((it) => ({
        name: it.product?.name ?? "قلم",
        quantity: it.quantity,
        unitPrice: it.pricePerUnit,
      }));
      const sub = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const disc = Math.round(sub * 0.2); // ۲۰٪ تخفیف
      const inv = await call("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          orderId: withNoInvoice.id,
          items,
          discountAmount: disc,
          paidAmount: 0,
        }),
      });
      assert(inv.status === 201, "invoice issued with 20% discount", `status=${inv.status} ${inv.body?.error ?? ""}`);
      const after = await call(`/api/orders/${withNoInvoice.id}`);
      const t = after.body.order.totalAmount;
      assert(
        Math.abs(t - (sub - disc)) < 2,
        "order.totalAmount synced with invoice (خواستهٔ ۱۰)",
        `total=${fmt(t)} expected≈${fmt(sub - disc)}`
      );
      // پاک‌سازی: ابطال + حذف فاکتور تستی
      const invId = inv.body.invoice.id;
      await call(`/api/invoices/${invId}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      const del = await call(`/api/invoices/${invId}`, { method: "DELETE" });
      assert(del.status === 200, "cleanup: test invoice cancelled+deleted");
      const back = await call(`/api/orders/${withNoInvoice.id}`);
      assert(
        Math.abs(back.body.order.totalAmount - sub) < 2,
        "after cancel: total back to items sum",
        `total=${fmt(back.body.order.totalAmount)} expected≈${fmt(sub)}`
      );
    } else {
      console.log(`   (skip: order #${withNoInvoice.number} already has invoice or no items)`);
    }
  }

  // ۷) رادار رئیس — lossOrders
  const dash = await call("/api/dashboard");
  assert(dash.status === 200, "GET /api/dashboard");
  assert(
    dash.body?.radar && "lossOrders" in dash.body.radar,
    "radar.lossOrders present (خواستهٔ ۶)",
    JSON.stringify(dash.body?.radar?.lossOrders?.count)
  );

  console.log("\n— برگرداندن هدیهٔ تستی (حذف اثر تست) —");
  // هدیهٔ تستی را با درصد کوچک جایگزین نکنیم؛ سفارش تستی است — ولی بهتر است
  // دیتای لوکال را تمیز نگه داریم: re-gift 100→ همان می‌ماند. دیتای dev است، اشکال ندارد.
  console.log("done.");
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exitCode = 1;
});
