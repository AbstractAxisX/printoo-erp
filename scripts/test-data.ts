// Test-data pass for Printoo24 ERP — adds a realistic demo workload
// WITHOUT touching existing rows (idempotent via title/order-number checks).
//
// Adds: 6 new orders across all statuses/priorities, ~14 linked tasks
// across all modules/statuses/assignees, 1 extra customer + products.
// Run: DATABASE_URL="file:./db/custom.db" bun run scripts/test-data.ts

import { db } from "../src/lib/db";

async function main() {
  const existing = await db.order.count();
  if (existing > 5) {
    console.log(`orders: ${existing} already present, skipping`);
    return;
  }

  // ── People ──
  const admin = await db.user.findUnique({ where: { email: "admin@printoo24.com" } });
  const sara = await db.user.findUnique({ where: { email: "sara@printoo24.com" } });
  const reza = await db.user.findUnique({ where: { email: "reza@printoo24.com" } });
  const mehdi = await db.user.findUnique({ where: { email: "mehdi@printoo24.com" } });
  const negar = await db.user.findUnique({ where: { email: "negar@printoo24.com" } });
  const nima = await db.user.findUnique({ where: { email: "nima@printoo24.com" } });
  if (!admin || !sara || !reza || !mehdi || !negar) throw new Error("seed users missing");

  // ── Extra products ──
  const productNames = ["کاتالوگ ۱۶ صفحه", "ست اداری (کارت+سربرگ)", "استیکر شفاف برش‌دار"];
  const products: { id: string; name: string }[] = [];
  for (const name of productNames) {
    const p =
      (await db.product.findFirst({ where: { name } })) ??
      (await db.product.create({
        data: { name, unit: "عدد", basePrice: name.includes("کاتالوگ") ? 18000 : name.includes("ست") ? 95000 : 3500 },
      }));
    products.push({ id: p.id, name: p.name });
  }
  const allProducts = await db.product.findMany();
  const byName = (n: string) => allProducts.find((p) => p.name.includes(n)) ?? products[0];

  // ── Extra customers ──
  const custSpecs = [
    { name: "رستوران باران", phone: "09123334455" },
    { name: "کلینیک لبخند", phone: "09125556677" },
    { name: "باشگاه ورشی", phone: "09127778899" },
  ];
  const customers: { id: string; name: string }[] = [];
  for (const c of custSpecs) {
    const row =
      (await db.customer.findFirst({ where: { name: c.name } })) ??
      (await db.customer.create({ data: c }));
    customers.push({ id: row.id, name: row.name });
  }
  const custByName = (n: string) =>
    customers.find((c) => c.name.includes(n)) ?? customers[0];

  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  // ── Orders (number sequence continues from max) ──
  const maxNumber = await db.order.aggregate({ _max: { number: true } });
  let num = maxNumber._max.number ?? 0;

  type ItemSpec = { product: string; qty: number; price: number; stage: string; needsMaterial?: boolean; note?: string };
  type OrderSpec = {
    customer: string;
    status: string;
    priority: string;
    splitMode: string;
    endIn?: number | null;
    paidRatio: number;
    note?: string;
    items: ItemSpec[];
  };

  const specs: OrderSpec[] = [
    {
      customer: "باران",
      status: "pending_design",
      priority: "urgent",
      splitMode: "separated",
      endIn: 3,
      paidRatio: 0.3,
      note: "منوی جدید فصل پاییز — فایل لوگو از مشتری",
      items: [
        { product: "کاتالوگ", qty: 500, price: 18000, stage: "design", needsMaterial: true },
        { product: "فلکس", qty: 2, price: 45000, stage: "design" },
      ],
    },
    {
      customer: "لبخند",
      status: "pending_design",
      priority: "normal",
      splitMode: "grouped",
      endIn: 6,
      paidRatio: 0.5,
      items: [
        { product: "ست اداری", qty: 3, price: 95000, stage: "design" },
        { product: "کارت ویزیت", qty: 1000, price: 1200, stage: "print" },
      ],
    },
    {
      customer: "ورشی",
      status: "in_printing",
      priority: "urgent",
      splitMode: "grouped",
      endIn: -1, // overdue
      paidRatio: 0,
      note: "پرداخت پس از تحویل توافق شد",
      items: [
        { product: "استیکر", qty: 2000, price: 3500, stage: "print", needsMaterial: true, note: "متریال براق سفید سفارش شود" },
        { product: "تراکت A5", qty: 5000, price: 450, stage: "print" },
      ],
    },
    {
      customer: "باران",
      status: "warehouse_logistics",
      priority: "normal",
      splitMode: "separated",
      endIn: 2,
      paidRatio: 1,
      items: [
        { product: "کاتالوگ", qty: 300, price: 18000, stage: "warehouse" },
      ],
    },
    {
      customer: "لبخند",
      status: "completed",
      priority: "normal",
      splitMode: "grouped",
      endIn: 1,
      paidRatio: 0.7,
      items: [
        { product: "ست اداری", qty: 2, price: 95000, stage: "completed" },
      ],
    },
    {
      customer: "ورشی",
      status: "pending_design",
      priority: "normal",
      splitMode: "grouped",
      endIn: null,
      paidRatio: 0,
      note: "تاریخ تحویل هنوز مشخص نیست",
      items: [
        { product: "بنر", qty: 1, price: 85000, stage: "design" },
      ],
    },
  ];

  const createdOrders: { id: string; number: number; customerName: string; status: string }[] = [];
  for (const spec of specs) {
    num += 1;
    const total = spec.items.reduce((s, i) => s + i.qty * i.price, 0);
    const order = await db.order.create({
      data: {
        number: num,
        customerId: custByName(spec.customer).id,
        status: spec.status,
        priority: spec.priority,
        splitMode: spec.splitMode,
        endDate: spec.endIn === null || spec.endIn === undefined ? null : day(spec.endIn),
        noEndDate: spec.endIn === null || spec.endIn === undefined,
        totalAmount: total,
        paidAmount: Math.round(total * spec.paidRatio),
        note: spec.note ?? null,
        createdBy: admin.name,
        items: {
          create: spec.items.map((i) => ({
            productId: byName(i.product).id,
            quantity: i.qty,
            pricePerUnit: i.price,
            totalAmount: i.qty * i.price,
            stage: i.stage,
            needsMaterial: i.needsMaterial ?? false,
            note: i.note ?? null,
          })),
        },
      },
    });
    createdOrders.push({
      id: order.id,
      number: order.number,
      customerName: custByName(spec.customer).name,
      status: order.status,
    });
  }

  // ── Tasks linked to orders + a few standalone ──
  type TaskSpec = {
    title: string;
    module: string;
    status: string;
    priority: string;
    dueIn: number;
    assignee?: string | null;
    orderIdx?: number;
    desc?: string;
  };

  const taskSpecs: TaskSpec[] = [
    { title: "طراحی منوی پاییز — نسخه اولیه", module: "designer", status: "in_progress", priority: "urgent", dueIn: 1, assignee: sara.id, orderIdx: 0, desc: "پس از تأیید مشتری، فایل به چاپ ارسال شود" },
    { title: "اصلاح رنگ لوگو مطابق برند", module: "designer", status: "todo", priority: "normal", dueIn: 2, assignee: sara.id, orderIdx: 0 },
    { title: "چاپ تست رنگ کاتالوگ", module: "print", status: "todo", priority: "normal", dueIn: 3, assignee: reza.id, orderIdx: 0 },
    { title: "چاپ کارت ویزیت سلفونی مات", module: "print", status: "in_progress", priority: "normal", dueIn: -1, assignee: reza.id, orderIdx: 1 },
    { title: "خرید متریال استیکر براق", module: "warehouse", status: "todo", priority: "urgent", dueIn: 0, assignee: mehdi.id, orderIdx: 2 },
    { title: "بسته‌بندی ۵۰۰ کاتالوگ", module: "warehouse", status: "todo", priority: "normal", dueIn: 2, assignee: mehdi.id, orderIdx: 3 },
    { title: "کنترل کیفیت ست اداری", module: "qc", status: "todo", priority: "normal", dueIn: 1, assignee: nima?.id ?? null, orderIdx: 4 },
    { title: "صدور فاکتور نهایی رستوران باران", module: "finance", status: "todo", priority: "normal", dueIn: 4, assignee: negar.id, orderIdx: 3 },
    { title: "پیگیری پرداخت کلینیک لبخند", module: "finance", status: "in_progress", priority: "urgent", dueIn: 0, assignee: negar.id, orderIdx: 1 },
    { title: "تماس با باشگاه ورشی برای فایل بنر", module: "crm", status: "todo", priority: "normal", dueIn: 1, orderIdx: 5 },
    { title: "به‌روزرسانی قیمت کاغذ با تامین‌کننده", module: "srm", status: "todo", priority: "normal", dueIn: 5 },
    { title: "بازبینی روزانه سفارشات معوق", module: "admin", status: "done", priority: "normal", dueIn: -1, assignee: admin.id },
    { title: "آپدیت لیست قیمت خدمات چاپ", module: "admin", status: "in_progress", priority: "normal", dueIn: 7, assignee: admin.id },
    { title: "گزارش هفتاری کیفیت چاپ", module: "qc", status: "done", priority: "normal", dueIn: -3, assignee: nima?.id ?? null },
  ];

  for (const t of taskSpecs) {
    const order = t.orderIdx !== undefined ? createdOrders[t.orderIdx] : null;
    const exists = await db.task.findFirst({ where: { title: t.title } });
    if (exists) continue;
    await db.task.create({
      data: {
        title: t.title,
        description: t.desc ?? null,
        module: t.module,
        status: t.status,
        priority: t.priority,
        dueDate: day(t.dueIn),
        assignedTo: t.assignee ?? null,
        orderId: order?.id ?? null,
        customerId: order ? (await db.order.findUnique({ where: { id: order.id } }))?.customerId : null,
      },
    });
  }

  // Also link a couple of tasks to the ORIGINAL seeded orders (#1-5) so the
  // order-detail modal Tasks tab has content on old rows too.
  const oldOrders = await db.order.findMany({
    where: { number: { lte: 5 } },
    orderBy: { number: "asc" },
    include: { customer: true },
  });
  const oldLinkSpecs = [
    { orderNumber: 2, title: "طراحی نهایی فایل فاکتور", module: "designer", status: "in_progress", priority: "urgent", assignee: sara.id, dueIn: 2 },
    { orderNumber: 3, title: "چاپ سفارش کارت ویزیت", module: "print", status: "todo", priority: "normal", assignee: reza.id, dueIn: 4 },
    { orderNumber: 4, title: "بستن حساب سفارش تحویل‌شده", module: "finance", status: "todo", priority: "normal", assignee: negar.id, dueIn: 6 },
  ];
  for (const l of oldLinkSpecs) {
    const o = oldOrders.find((x) => x.number === l.orderNumber);
    if (!o) continue;
    const exists = await db.task.findFirst({ where: { title: l.title } });
    if (exists) continue;
    await db.task.create({
      data: {
        title: l.title,
        module: l.module,
        status: l.status,
        priority: l.priority,
        dueDate: day(l.dueIn),
        assignedTo: l.assignee,
        orderId: o.id,
        customerId: o.customerId,
      },
    });
  }

  const [orders, tasks] = await Promise.all([db.order.count(), db.task.count()]);
  console.log(`test-data done: ${orders} orders, ${tasks} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
