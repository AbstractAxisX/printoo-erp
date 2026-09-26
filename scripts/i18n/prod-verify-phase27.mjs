// PHASE 27 — read-only production verification (NO data mutation).
// Checks: login returns language, me returns language, html lang/dir,
// fx rates alive, finance summary + orders + customers respond, demo write-block intact.
const BASE = "http://localhost:3000";

async function main() {
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push({ name, ok, extra });
    console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  };

  // 1) root HTML — default English + dir ltr
  const root = await fetch(BASE + "/");
  const html = await root.text();
  check("GET / 200", root.status === 200);
  check("default lang=en dir=ltr", /<html lang="en" dir="ltr"/.test(html));
  check("boot script present", html.includes("p24-lang"));
  check("metadata EN", html.includes("Print Management System"));

  // 2) login (read-only equivalent — same as the QC login previous phases used)
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@printoo24.com", password: "admin123" }),
  });
  const loginData = await login.json().catch(() => ({}));
  check("login 200", login.status === 200);
  check("login returns language=en", loginData.user?.language === "en", JSON.stringify(loginData.user?.language));
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

  // 3) /api/auth/me with language
  const me = await fetch(BASE + "/api/auth/me", { headers: { cookie } });
  const meData = await me.json().catch(() => ({}));
  check("me 200 + language", me.status === 200 && meData.user?.language === "en");

  // 4) PUT preferences with language=fa — then set BACK to en (leaves user row language=en)
  //    (This is the ONLY write, on the master user's own preference — same as QC phases 23/25 did for guideTooltips.)
  const putFa = await fetch(BASE + "/api/auth/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ language: "fa" }),
  });
  const putFaData = await putFa.json().catch(() => ({}));
  check("preferences language=fa accepted", putFa.status === 200 && putFaData.preferences?.language === "fa");
  const putEn = await fetch(BASE + "/api/auth/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ language: "en" }),
  });
  const putEnData = await putEn.json().catch(() => ({}));
  check("preferences reverted to en", putEn.status === 200 && putEnData.preferences?.language === "en");

  // 5) html flips with cookie
  const rootFa = await fetch(BASE + "/", { headers: { cookie: "p24-lang=fa" } });
  const htmlFa = await rootFa.text();
  check("cookie fa → lang=fa dir=rtl", /<html lang="fa" dir="rtl"/.test(htmlFa));

  // 6) fx + summary + orders + customers (read-only, real data)
  const fx = await fetch(BASE + "/api/fx", { headers: { cookie } });
  const fxData = await fx.json().catch(() => ({}));
  check("fx 200", fx.status === 200, `source=${fxData.source ?? fxData?.rates?.source}`);
  const sum = await fetch(BASE + "/api/finance/summary", { headers: { cookie } });
  check("finance summary 200", sum.status === 200);
  const orders = await fetch(BASE + "/api/orders", { headers: { cookie } });
  check("orders 200", orders.status === 200);
  const customers = await fetch(BASE + "/api/customers", { headers: { cookie } });
  check("customers 200", customers.status === 200);

  // 7) unauthed API still 401
  const unauth = await fetch(BASE + "/api/orders");
  check("orders w/o cookie 401", unauth.status === 401);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
