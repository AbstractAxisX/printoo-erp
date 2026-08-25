// Seed demo data for Printoo24 ERP
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  // ensure user (password hashed — Phase 1.5 baseline security)
  const existing = await db.user.findUnique({ where: { email: "admin@printoo24.com" } });
  let user;
  if (existing) {
    // Auto-migrate legacy plaintext if present.
    if (existing.password && !existing.password.startsWith("$2")) {
      const hashed = await hashPassword(existing.password);
      user = await db.user.update({ where: { id: existing.id }, data: { password: hashed } });
    } else {
      user = existing;
    }
  } else {
    user = await db.user.create({
      data: {
        name: "مدیر سیستم",
        email: "admin@printoo24.com",
        password: await hashPassword("admin123"),
        role: "master",
      },
    });
  }
  console.log("user:", user.email);

  // Phase 4: demo employees — so cross-panel task assignment is exercisable.
  // Roles map 1:1 to ModuleKey so the assignee picker can be module-scoped later.
  const employees = [
    { name: "سارا احمدی", email: "sara@printoo24.com", role: "designer", phone: "09120000001" },
    { name: "رضا کریمی", email: "reza@printoo24.com", role: "print", phone: "09120000002" },
    { name: "مهدی موسوی", email: "mehdi@printoo24.com", role: "warehouse", phone: "09120000003" },
    { name: "نگار رستمی", email: "negar@printoo24.com", role: "finance", phone: "09120000004" },
  ];
  for (const e of employees) {
    const existing = await db.user.findUnique({ where: { email: e.email } });
    if (!existing) {
      await db.user.create({
        data: { ...e, password: await hashPassword("employee123"), status: "active" },
      });
    }
  }

  // customers
  const custNames = [
    { name: "شرکت آفتاب", phone: "09123334455", isFavorite: true },
    { name: "حسین رضایی", phone: "09121112233" },
    { name: "مجموعه برکت", phone: "09125556677", isFavorite: true },
    { name: "فروشگاه نگین", phone: "09128889900" },
    { name: "علی محمدی", phone: "09124445566" },
  ];
  const customers = [];
  for (const c of custNames) {
    const existing = await db.customer.findFirst({ where: { phone: c.phone } });
    customers.push(existing ?? await db.customer.create({ data: c }));
  }

  // suppliers
  const supNames = [
    { name: "چاپخانه بزرگ آرین", phone: "02122334455", contactPerson: "آقای کریمی" },
    { name: "چاپ نوین", phone: "02166778899", contactPerson: "خانم احمدی" },
    { name: "تأمین‌کننده پارس", phone: "02144556677", contactPerson: "آقای صادقی" },
  ];
  for (const s of supNames) {
    const existing = await db.supplier.findFirst({ where: { name: s.name } });
    if (!existing) await db.supplier.create({ data: s });
  }

  // products
  const prodNames = [
    { name: "فلکس بنر", unit: "متر مربع", basePrice: 25000 },
    { name: "استیکر شفاف", unit: "متر مربع", basePrice: 45000 },
    { name: "تیشرت چاپ شده", unit: "عدد", basePrice: 120000 },
    { name: "کاتالوگ", unit: "عدد", basePrice: 18000 },
    { name: "کارت ویزیت", unit: "ست", basePrice: 80000 },
    { name: "پوستر A3", unit: "عدد", basePrice: 15000 },
  ];
  const products = [];
  for (const p of prodNames) {
    const existing = await db.product.findFirst({ where: { name: p.name } });
    products.push(existing ?? await db.product.create({ data: p }));
  }

  // orders (idempotent — only seeded when the table is empty, so re-running
  // the seed for new employees never duplicates demo orders)
  const orderCount = await db.order.count();
  if (orderCount > 0) {
    console.log("orders: already seeded, skipping");
  }
  const now = Date.now();
  const day = 86400000;
  const orderDefs = [
    { cust: 0, items: [{ p: 0, q: 10, price: 25000, stage: "design" }, { p: 1, q: 5, price: 45000, stage: "print" }], status: "pending_design", endDate: new Date(now + 5 * day), priority: "urgent" },
    { cust: 1, items: [{ p: 2, q: 20, price: 120000, stage: "print" }], status: "in_printing", endDate: new Date(now + 2 * day), priority: "normal" },
    { cust: 2, items: [{ p: 3, q: 100, price: 18000, stage: "warehouse" }, { p: 4, q: 2, price: 80000, stage: "completed" }], status: "warehouse_logistics", endDate: new Date(now - 1 * day), priority: "normal" },
    { cust: 3, items: [{ p: 5, q: 50, price: 15000, stage: "completed" }], status: "completed", endDate: new Date(now - 3 * day), priority: "normal" },
    { cust: 4, items: [{ p: 0, q: 3, price: 25000, stage: "archive" }], status: "archived", endDate: null, priority: "normal" },
  ];

  if (orderCount === 0) {
    let num = 0;
    for (const od of orderDefs) {
    const cust = customers[od.cust];
    const total = od.items.reduce((s, i) => s + i.q * i.price, 0);
    num += 1;
    await db.order.create({
      data: {
        number: num,
        customerId: cust.id,
        status: od.status,
        splitMode: "grouped",
        priority: od.priority,
        endDate: od.endDate,
        noEndDate: !od.endDate,
        totalAmount: total,
        paidAmount: 0,
        createdBy: user.name,
        items: {
          create: od.items.map((i) => {
            const prod = products[i.p];
            return {
              productId: prod.id,
              quantity: i.q,
              pricePerUnit: i.price,
              totalAmount: i.q * i.price,
              stage: i.stage,
              needsMaterial: i.stage === "print",
            };
          }),
        },
      },
    });
    }
  }

  // notifications (idempotent — only when table empty)
  const notifCount = await db.notification.count();
  if (notifCount === 0) {
    const notifs = [
      { title: "سفارش جدید ثبت شد", message: "سفارش #1 توسط مدیر سیستم ایجاد شد.", type: "success", link: "admin:orders" },
      { title: "موعد تحویل نزدیک است", message: "سفارش #2 کمتر از ۲ روز تا موعد تحویل.", type: "warning", link: "admin:calendar" },
      { title: "وضعیت سفارش به‌روزرسانی شد", message: "سفارش #3 به مرحله انبار و لجستیک منتقل شد.", type: "info", link: "admin:orders" },
    ];
    for (const n of notifs) {
      await db.notification.create({ data: n });
    }
  }

  console.log("seed done");
}

main().catch(console.error).finally(() => db.$disconnect());
