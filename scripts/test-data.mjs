// Printoo24 ERP — Demo data (فاز ۹ — بازنویسی کامل)
//
// دیتای دموی حجیم و واقعی برای «همهٔ» ماژول‌ها با ساختار جدید گردش کار
// (سفارش گروهی گیت‌دار + تفکیک‌شده):
//   • ۳۱ سفارش در همهٔ وضعیت‌ها (گروهی چندآیتمی با پیشرفت جزئی، تک‌آیتمی،
//     معوق، فوری، بدون موعد) — آیتم‌ها با مهر designCompletedAt/printCompletedAt
//   • ۱۵ پیش‌فاکتور (draft/sent/approved/rejected/converted) + ۷ فاکتور نهایی
//     (issued/paid/cancelled — manual + pre_invoice) با مالیات/تخفیف/سررسید
//   • ۴۸+ تسک در ۸ ماژول با مسئول، معوق/آینده
//   • QC، هزینه‌های متریال، پرداخت‌ها، هزینه‌ها، نوتیف‌ها، معاملات CRM،
//     فعالیت‌ها، یادداشت‌های تقویم، تامین‌کنندگان + خدمات + لیست قیمت
//
// اجرا (node یا bun — بدون نیاز به tsx):
//   npm run db:demo        (یا: node scripts/test-data.mjs)
//
// رفتار: دیتای تراکنشی قبلی (سفارش/سند/تسک/…) پاک و از نو ساخته می‌شود؛
// کاربران و داده‌های پایه (مشتری/محصول/تامین‌کننده) idempotent هستند.
// شمارنده‌ها در پایان با max واقعی همگام می‌شوند.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

// ─── .env (DATABASE_URL) — سازگار با node و bun، بدون وابستگی ─────
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
      if (m) process.env.DATABASE_URL = m[1].trim();
    }
  } catch {
    /* .env نیست — prisma از پیش‌فرض استفاده می‌کند */
  }
}

const db = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const localDayKey = (n) => {
  const d = day(n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const pick = (arr, i) => arr[i % arr.length];

async function main() {
  console.log("→ پاک‌سازی دیتای تراکنشی قبلی…");
  await db.task.deleteMany();
  await db.payment.deleteMany();
  await db.expense.deleteMany();
  await db.qcReport.deleteMany();
  await db.materialCost.deleteMany();
  await db.notification.deleteMany();
  await db.activity.deleteMany();
  await db.deal.deleteMany();
  await db.dayNote.deleteMany();
  await db.invoice.deleteMany();
  await db.preInvoice.deleteMany();
  await db.order.deleteMany();
  // شمارنده‌ها هم از نو
  await db.counter.deleteMany();

  // ═══════════════ 1) کاربران (idempotent) ═══════════════
  console.log("→ کاربران…");
  const usersSpec = [
    { name: "مدیر سیستم", email: "admin@printoo24.com", role: "master", phone: "07700000001", pw: "admin123" },
    { name: "سارا احمدی", email: "sara@printoo24.com", role: "designer", phone: "07700000002", pw: "employee123" },
    { name: "مهدی رحیمی", email: "mehdi@printoo24.com", role: "designer", phone: "07700000003", pw: "employee123" },
    { name: "رضا کریمی", email: "reza@printoo24.com", role: "print", phone: "07700000004", pw: "employee123" },
    { name: "علی نعمتی", email: "ali@printoo24.com", role: "print", phone: "07700000005", pw: "employee123" },
    { name: "حسین موسوی", email: "hossein@printoo24.com", role: "warehouse", phone: "07700000006", pw: "employee123" },
    { name: "نگار رستمی", email: "negar@printoo24.com", role: "finance", phone: "07700000007", pw: "employee123" },
    { name: "نیما قاسمی", email: "nima@printoo24.com", role: "qc", phone: "07700000008", pw: "employee123" },
    { name: "مریم کاظمی", email: "maryam@printoo24.com", role: "crm", phone: "07700000009", pw: "employee123" },
    { name: "امیر صالحی", email: "amir@printoo24.com", role: "srm", phone: "07700000010", pw: "employee123" },
  ];
  const users = {};
  for (const u of usersSpec) {
    const { name, email, role, phone, pw } = u;
    users[email.split("@")[0]] = await db.user.upsert({
      where: { email },
      update: { name, role, status: "active" },
      create: { name, email, role, phone, password: await hash(pw, 10) },
    });
  }
  const admin = users["admin"], sara = users["sara"], mehdiD = users["mehdi"],
    reza = users["reza"], ali = users["ali"], hossein = users["hossein"],
    negar = users["negar"], nima = users["nima"], maryam = users["maryam"],
    amir = users["amir"];

  // ═══════════════ 2) مشتریان (idempotent) ═══════════════
  console.log("→ مشتریان…");
  const custSpecs = [
    ["رستوران باران", "07701110001", true, 0, "مشتری همیشگی — منو فصلی هر فصل"],
    ["کلینیک لبخند", "07701110002", true, 250000, "قرارداد ست اداری سالانه"],
    ["باشگاه ورشی", "07701110003", false, 0, ""],
    ["شرکت آفتاب", "07701110004", true, 0, "از مشتریان اول"],
    ["حسین رضایی", "07701110005", false, 80000, "کارت ویزیت دوره‌ای"],
    ["مجموعه برکت", "07701110006", false, 0, ""],
    ["کافه ترنج", "07701110007", true, 0, "استیکر و لیوان دوره‌ای"],
    ["آموزشگاه پارس", "07701110008", false, 420000, "بدهی شهریه بروشور"],
    ["داروخانه سبز", "07701110009", false, 0, ""],
    ["فروشگاه مدار", "07701110010", true, 0, "بنر و فلکس ماهانه"],
    ["دفتر وکالت دادگر", "07701110011", false, 150000, ""],
    ["آژانس مسیر سبز", "07701110012", false, 0, "کاتالوگ توریسم"],
    ["بیمارستان مهر", "07701110013", true, 0, "فرم‌ها و بروشور تخصصی"],
    ["رایان‌گستر", "07701110014", false, 300000, "پرداخت‌ها قسطی توافق شده"],
    ["نانو پک", "07701110015", false, 0, "بسته‌بندی صنعتی"],
    ["گالری رنگین‌کمان", "07701110016", false, 0, ""],
    ["مدارس نور", "07701110017", true, 0, "قرارداد سالانه چاپ"],
    ["ساختمانی آرمان", "07701110018", false, 60000, ""],
  ];
  const C = {}; // name → id
  for (const [name, phone, isFavorite, balanceDue, note] of custSpecs) {
    const existing = await db.customer.findFirst({ where: { phone } });
    const row = existing
      ? await db.customer.update({ where: { id: existing.id }, data: { name, isFavorite, balanceDue, note: note || null } })
      : await db.customer.create({ data: { name, phone, isFavorite, balanceDue, note: note || null } });
    C[name] = row.id;
  }
  const cNames = Object.keys(C);

  // ═══════════════ 3) محصولات (idempotent) ═══════════════
  console.log("→ محصولات…");
  const prodSpecs = [
    ["کارت ویزیت سلفونی مات", "عدد", 1500],
    ["کارت ویزیت سلفونی براق", "عدد", 1500],
    ["تراکت A4 یک‌رو", "عدد", 450],
    ["تراکت A5 دو‌رو", "عدد", 600],
    ["بنر vinil 340g", "متر مربع", 12000],
    ["فلکس برش‌دار", "متر مربع", 15000],
    ["استیکر شفاف برش‌دار", "عدد", 3500],
    ["استیکر براق سفید", "عدد", 3200],
    ["کاتالوگ ۱۶ صفحه", "عدد", 18000],
    ["کاتالوگ ۳۲ صفحه", "عدد", 32000],
    ["ست اداری (کارت+سربرگ+پاکت)", "ست", 95000],
    ["سربرگ A4 یک‌رو رنگی", "بسته ۱۰۰", 55000],
    ["منو رستورانی لمینت", "عدد", 8500],
    ["پوستر A3 گلاسه", "عدد", 5000],
    ["لیوان کاغذی چاپ‌دار", "کارتن", 220000],
    ["پاکت نامه لمینت", "بسته ۵۰", 60000],
    ["فرم ثبت‌نام A4", "عدد", 550],
  ];
  const P = {};
  for (const [name, unit, basePrice] of prodSpecs) {
    const existing = await db.product.findFirst({ where: { name } });
    const row = existing
      ? await db.product.update({ where: { id: existing.id }, data: { unit, basePrice } })
      : await db.product.create({ data: { name, unit, basePrice } });
    P[name] = row.id;
  }
  const pNames = Object.keys(P);

  // ═══════════════ 4) SRM: دسته‌ها/زیردسته‌ها/تامین‌کنندگان/خدمات/قیمت ══
  console.log("→ تامین‌کنندگان و خدمات…");
  const catSpecs = [
    ["چاپ و تبلیغات", "print", ["چاپ افست", "چاپ دیجیتال", "لمینت و سلفون"]],
    ["کاغذ و مقوا", "package", ["کاغذ گلاسه", "مقوای گرای‌بک", "vinil و فلکس"]],
    ["خدمات پشتیبانی", "tools", ["حمل و نقل", "نصب و اجرا"]],
    ["بسته‌بندی", "box", ["جعبه‌سازی", "شرینک پک"]],
  ];
  const subC = {};
  for (const [name, icon, subs] of catSpecs) {
    const cat = await db.supplierCategory.upsert({
      where: { name },
      update: { icon },
      create: { name, icon },
    });
    for (const s of subs) {
      const existing = await db.supplierSubcategory.findFirst({ where: { name } });
      const row = existing
        ? await db.supplierSubcategory.update({ where: { id: existing.id }, data: { categoryId: cat.id } })
        : await db.supplierSubcategory.create({ data: { name, categoryId: cat.id } });
      subC[s] = row.id;
    }
  }

  const supSpecs = [
    ["چاپخانه نیکان", "07702220001", "مهندس توکلی", subC["چاپ افست"]],
    ["مجموعه دیجیتال پرینت", "07702220002", "آقای شریفی", subC["چاپ دیجیتال"]],
    ["لمینت گستر پارس", "07702220003", "خانم سعیدی", subC["لمینت و سلفون"]],
    ["کاغذ برتر خراسان", "07702220004", "آقای فرهادی", subC["کاغذ گلاسه"]],
    ["مقوای آریا", "07702220005", "آقای کاظمی", subC["مقوای گرای‌بک"]],
    ["vinil مرکزی", "07702220006", "مهندس رستمی", subC["vinil و فلکس"]],
    ["حمل‌ونقل سریع‌السیر", "07702220007", "آقای رحیمی", subC["حمل و نقل"]],
    ["نصب بنر تهران", "07702220008", "آقای صادقی", subC["نصب و اجرا"]],
    ["جعبه‌سازی امید", "07702220009", "خانم موسوی", subC["جعبه‌سازی"]],
  ];
  const S = {};
  for (const [name, phone, contactPerson, subcategoryId] of supSpecs) {
    const existing = await db.supplier.findFirst({ where: { name } });
    const row = existing
      ? await db.supplier.update({ where: { id: existing.id }, data: { phone, contactPerson, subcategoryId } })
      : await db.supplier.create({ data: { name, phone, contactPerson, subcategoryId } });
    S[name] = row.id;
  }

  const svcSpecs = [
    ["چاپخانه نیکان", "چاپ افست ۴ رنگ", subC["چاپ افست"], "تیراژ", 250, 1000],
    ["چاپخانه نیکان", "چاپ افست تک‌رنگ", subC["چاپ افست"], "تیراژ", 120, 500],
    ["مجموعه دیجیتال پرینت", "چاپ دیجیتال A3", subC["چاپ دیجیتال"], "برگ", 900, 50],
    ["مجموعه دیجیتال پرینت", "چاپ دیجیتال SRA3", subC["چاپ دیجیتال"], "برگ", 1400, 100],
    ["لمینت گستر پارس", "سلفون مات دو‌طرفه", subC["لمینت و سلفون"], "متر مربع", 3200, 10],
    ["لمینت گستر پارس", "لمینت براق A3", subC["لمینت و سلفون"], "برگ", 1100, 100],
    ["کاغذ برتر خراسان", "کاغذ گلاسه ۱۳۵ گرم", subC["کاغذ گلاسه"], "بسته ۵۰۰ برگ", 145000, 4],
    ["کاغذ برتر خراسان", "کاغذ گلاسه ۱۷۰ گرم", subC["کاغذ گلاسه"], "بسته ۵۰۰ برگ", 178000, 4],
    ["مقوای آریا", "مقوا ۳۰۰ گرم", subC["مقوای گرای‌بک"], "ورق", 6200, 100],
    ["vinil مرکزی", "vinil براق ۳۴۰g", subC["vinil و فلکس"], "متر طول", 9800, 10],
    ["vinil مرکزی", "فلکس پشت‌چسب", subC["vinil و فلکس"], "متر مربع", 13500, 5],
    ["حمل‌ونقل سریع‌السیر", "حمل داخل شهر", subC["حمل و نقل"], "سرویس", 45000, 1],
    ["نصب بنر تهران", "نصب بنر در جایگاه", subC["نصب و اجرا"], "متر مربع", 8000, 2],
    ["جعبه‌سازی امید", "جعبه مقوایی سفید", subC["جعبه‌سازی"], "عدد", 1800, 500],
  ];
  const svcIds = [];
  for (const [sup, name, subId, unit, price, minQ] of svcSpecs) {
    const existing = await db.supplierService.findFirst({ where: { name, supplierId: S[sup] } });
    const svc = existing ?? (await db.supplierService.create({
      data: { name, supplierId: S[sup], subcategoryId: subId, unit },
    }));
    svcIds.push(svc.id);
    // لیست قیمت فعال + یک نسخهٔ منقضی
    const hasActive = await db.priceList.findFirst({ where: { serviceId: svc.id, validTo: null } });
    if (!hasActive) {
      await db.priceList.create({
        data: { serviceId: svc.id, price, minQuantity: minQ, validFrom: day(-90) },
      });
      await db.priceList.create({
        data: {
          serviceId: svc.id,
          price: Math.round(price * 0.92),
          minQuantity: minQ,
          validFrom: day(-200),
          validTo: day(-95),
          note: "قیمت فصل گذشته",
        },
      });
    }
  }

  // ═══════════════ 5) انواع هزینه ═══════════════
  const expTypeSpecs = [
    ["خرید کاغذ و متریال", false], ["هزینه چاپ خارجی", true],
    ["حمل و نقل", false], ["نیازهای اداری", false],
    ["تعمیر و نگهداری دستگاه", false], ["هزینه نصب", false],
    ["سایر", false],
  ];
  const ET = {};
  for (const [name, isDefault] of expTypeSpecs) {
    const row = await db.expenseType.upsert({
      where: { name },
      update: { isDefault },
      create: { name, isDefault },
    });
    ET[name] = row.id;
  }

  // ═══════════════ 6) سفارش‌ها — ۳۱ سفارش با گردش کار واقعی ═════════
  console.log("→ سفارش‌ها…");
  let orderNum = 0;
  const created = []; // {id, number, customerName, status, paid}
  const mkItem = (prod, qty, stage, opts = {}) => ({
    productId: P[prod],
    quantity: qty,
    pricePerUnit: prodSpecs.find((p) => p[0] === prod)?.[2] ?? 1000,
    totalAmount: qty * (prodSpecs.find((p) => p[0] === prod)?.[2] ?? 1000),
    stage,
    needsMaterial: opts.mat ?? false,
    materialConfirmed: opts.matConfirmed ?? false,
    note: opts.note ?? null,
    description: opts.desc ?? null,
    designStartDate: opts.designStart ?? null,
    designEndDate: opts.designEnd ?? null,
    printStartDate: opts.printStart ?? null,
    printEndDate: opts.printEnd ?? null,
    designCompletedAt: opts.designDone ?? null,
    printCompletedAt: opts.printDone ?? null,
  });

  /**
   * spec = { customer, status, priority, splitMode, endIn, note, designerNote,
   *          items: [mkItem(...)], paid }
   * paid در پایان از اسناد مالی محاسبه و sync می‌شود.
   */
  async function mkOrder(spec) {
    orderNum += 1;
    const total = spec.items.reduce((s, i) => s + i.totalAmount, 0);
    const order = await db.order.create({
      data: {
        number: orderNum,
        customerId: C[spec.customer],
        status: spec.status,
        splitMode: spec.splitMode,
        priority: spec.priority ?? "normal",
        endDate: spec.endIn === undefined || spec.endIn === null ? null : day(spec.endIn),
        noEndDate: spec.endIn === null,
        totalAmount: total,
        paidAmount: 0,
        note: spec.note ?? null,
        designerNote: spec.designerNote ?? null,
        createdBy: "مدیر سیستم",
        createdAt: day(spec.createdIn ?? -20),
        items: { create: spec.items },
      },
    });
    created.push({
      id: order.id, number: orderNum, customerName: spec.customer,
      status: spec.status, total,
    });
    return order;
  }

  const dS = day(-7), dE = day(3), pS = day(-2), pE = day(5);

  // ── pending_design (۹ سفارش) — گیت طراحی فعال ──
  await mkOrder({ customer: "رستوران باران", status: "pending_design", splitMode: "grouped", priority: "urgent", endIn: 4, createdIn: -6,
    note: "منوی جدید فصل — فایل لوگو از مشتری دریافت شد",
    items: [mkItem("منو رستورانی لمینت", 400, "design", { mat: true, designStart: dS, designEnd: day(1), note: "طراحی دو‌ستونه با تصاویر غذا" }),
      mkItem("بنر vinil 340g", 2, "design", { designStart: dS, designEnd: day(1), desc: "بنر ورودی ۳×۱.۵ متر" }),
      mkItem("تراکت A5 دو‌رو", 2000, "print", { desc: "تبلیغ منوی جدید — چاپ مستقیم" }) ] });
  await mkOrder({ customer: "کلینیک لبخند", status: "pending_design", splitMode: "grouped", priority: "normal", endIn: 8, createdIn: -5,
    items: [mkItem("ست اداری (کارت+سربرگ+پاکت)", 3, "design", { designStart: dS, designEnd: dE }),
      mkItem("کارت ویزیت سلفونی مات", 1000, "design", { mat: true, designStart: dS, designEnd: dE }) ] });
  await mkOrder({ customer: "شرکت آفتاب", status: "pending_design", splitMode: "separated", priority: "urgent", endIn: 2, createdIn: -3,
    note: "فوری برای نمایشگاه",
    items: [mkItem("پوستر A3 گلاسه", 300, "design", { designStart: day(-2), designEnd: day(-1), note: "موعد طراحی گذشته است" }) ] });
  await mkOrder({ customer: "آموزشگاه پارس", status: "pending_design", splitMode: "grouped", priority: "normal", endIn: 10, createdIn: -8,
    items: [mkItem("کاتالوگ ۱۶ صفحه", 500, "design", { designStart: day(-10), designEnd: day(4) }),
      mkItem("کارت ویزیت سلفونی براق", 2000, "print", { desc: "طراحی آماده دارد" }),
      mkItem("کاتالوگ ۱۶ صفحه", 500, "print", { designDone: day(-2), desc: "جلد طراحی شد — داخل آماده" }) ] });
  await mkOrder({ customer: "باشگاه ورشی", status: "pending_design", splitMode: "grouped", priority: "normal", endIn: null, createdIn: -2,
    note: "تاریخ تحویل هنوز مشخص نیست",
    items: [mkItem("فلکس برش‌دار", 5, "design", { desc: "تابلو ورودی باشگاه" }) ] });
  await mkOrder({ customer: "بیمارستان مهر", status: "pending_design", splitMode: "grouped", priority: "urgent", endIn: 6, createdIn: -4,
    items: [mkItem("فرم ثبت‌نام A4", 3000, "design", { designStart: day(-3), designEnd: day(0), note: "فرم سه‌لایه با شماره سریال" }),
      mkItem("پاکت نامه لمینت", 100, "design", {}),
      mkItem("تراکت A4 یک‌رو", 5000, "print", {}),
      mkItem("پوستر A3 گلاسه", 50, "print", { designDone: day(-1) }),
      mkItem("کارت ویزیت سلفونی مات", 500, "print", { designDone: day(-1) }) ] });
  await mkOrder({ customer: "داروخانه سبز", status: "pending_design", splitMode: "separated", priority: "normal", endIn: 12, createdIn: -1,
    items: [mkItem("استیکر براق سفید", 300, "design", { desc: "برچسب دارو با بارکد" }) ] });
  await mkOrder({ customer: "کافه ترنج", status: "pending_design", splitMode: "grouped", priority: "normal", endIn: 9, createdIn: -9,
    designerNote: "رنگ سازمانی کافه (سبز فیروزه‌ای) در همهٔ اقلام رعایت شود",
    items: [mkItem("لیوان کاغذی چاپ‌دار", 20, "design", { mat: true, designStart: day(-5), designEnd: day(2) }),
      mkItem("استیکر شفاف برش‌دار", 1000, "design", { designStart: day(-5), designEnd: day(2) }),
      mkItem("بنر vinil 340g", 1, "print", {}) ] });
  await mkOrder({ customer: "دفتر وکالت دادگر", status: "pending_design", splitMode: "grouped", priority: "normal", endIn: 14, createdIn: -7,
    items: [mkItem("سربرگ A4 یک‌رو رنگی", 40, "design", {}),
      mkItem("پاکت نامه لمینت", 30, "design", {}) ] });

  // ── in_printing (۷ سفارش) — طراحی همه تکمیل، چاپ در جریان ──
  await mkOrder({ customer: "رستوران باران", status: "in_printing", splitMode: "grouped", priority: "urgent", endIn: -1, createdIn: -12,
    note: "پرداخت پس از تحویل توافق شد",
    items: [mkItem("بنر vinil 340g", 3, "print", { mat: true, matConfirmed: true, designDone: day(-6), printStart: pS, printEnd: day(-1), note: "متریال براق سفید سفارش شد" }),
      mkItem("تراکت A5 دو‌رو", 5000, "print", { designDone: day(-6), printStart: pS, printEnd: pE }),
      mkItem("منو رستورانی لمینت", 150, "warehouse", { designDone: day(-7), printDone: day(-1), desc: "چاپ اول انجام شد" }) ] });
  await mkOrder({ customer: "مجموعه برکت", status: "in_printing", splitMode: "separated", priority: "urgent", endIn: 2, createdIn: -10,
    items: [mkItem("کاتالوگ ۳۲ صفحه", 200, "print", { designDone: day(-5), printStart: day(-2), printEnd: day(2) }) ] });
  await mkOrder({ customer: "فروشگاه مدار", status: "in_printing", splitMode: "grouped", priority: "normal", endIn: 5, createdIn: -11,
    items: [mkItem("فلکس برش‌دار", 8, "print", { mat: true, matConfirmed: true, designDone: day(-8), printStart: pS, printEnd: day(3) }),
      mkItem("بنر vinil 340g", 4, "print", { designDone: day(-8), printStart: pS, printEnd: day(3) }),
      mkItem("استیکر شفاف برش‌دار", 2000, "print", { designDone: day(-8) }),
      mkItem("پوستر A3 گلاسه", 100, "warehouse", { designDone: day(-9), printDone: day(-1) }) ] });
  await mkOrder({ customer: "رایان‌گستر", status: "in_printing", splitMode: "grouped", priority: "normal", endIn: 7, createdIn: -9,
    items: [mkItem("ست اداری (کارت+سربرگ+پاکت)", 6, "print", { designDone: day(-6), printStart: day(-1), printEnd: day(4) }),
      mkItem("کارت ویزیت سلفونی مات", 3000, "print", { mat: true, designDone: day(-6), note: "متریال هنوز تایید نشده" }),
      mkItem("سربرگ A4 یک‌رو رنگی", 20, "print", { designDone: day(-6) }) ] });
  await mkOrder({ customer: "گالری رنگین‌کمان", status: "in_printing", splitMode: "grouped", priority: "normal", endIn: null, createdIn: -8,
    items: [mkItem("پوستر A3 گلاسه", 200, "print", { designDone: day(-4) }),
      mkItem("کاتالوگ ۱۶ صفحه", 100, "print", { designDone: day(-4), printStart: day(-1), printEnd: day(2) }) ] });
  await mkOrder({ customer: "آژانس مسیر سبز", status: "in_printing", splitMode: "grouped", priority: "urgent", endIn: 3, createdIn: -14,
    designerNote: "رنگ‌ها باید با برندبوک مشتری تطبیق داده شود — نسخهٔ چاپ تست الزامی است",
    items: [mkItem("کاتالوگ ۳۲ صفحه", 400, "print", { designDone: day(-8), printStart: day(-4), printEnd: day(1), note: "چاپ تست رنگ انجام شد" }),
      mkItem("کاتالوگ ۱۶ صفحه", 300, "print", { designDone: day(-8) }) ] });
  await mkOrder({ customer: "حسین رضایی", status: "in_printing", splitMode: "separated", priority: "normal", endIn: 4, createdIn: -6,
    items: [mkItem("کارت ویزیت سلفونی براق", 1000, "print", { designDone: day(-3), printStart: day(-1), printEnd: day(3) }) ] });

  // ── warehouse_logistics (۶ سفارش) — چاپ کامل، در انبار ──
  await mkOrder({ customer: "شرکت آفتاب", status: "warehouse_logistics", splitMode: "grouped", priority: "normal", endIn: 2, createdIn: -15,
    items: [mkItem("تراکت A4 یک‌رو", 10000, "warehouse", { designDone: day(-12), printDone: day(-4) }),
      mkItem("پوستر A3 گلاسه", 150, "warehouse", { designDone: day(-12), printDone: day(-3) }),
      mkItem("بنر vinil 340g", 2, "warehouse", { designDone: day(-13), printDone: day(-2) }) ] });
  await mkOrder({ customer: "مدارس نور", status: "warehouse_logistics", splitMode: "separated", priority: "urgent", endIn: 0, createdIn: -13,
    note: "برای مراسم افتتاحیه لازم است",
    items: [mkItem("بنر vinil 340g", 6, "warehouse", { designDone: day(-10), printDone: day(-1) }) ] });
  await mkOrder({ customer: "کافه ترنج", status: "warehouse_logistics", splitMode: "grouped", priority: "normal", endIn: 3, createdIn: -16,
    items: [mkItem("استیکر شفاف برش‌دار", 5000, "warehouse", { designDone: day(-11), printDone: day(-2) }),
      mkItem("لیوان کاغذی چاپ‌دار", 15, "warehouse", { mat: true, matConfirmed: true, designDone: day(-11), printDone: day(-1) }) ] });
  await mkOrder({ customer: "ساختمانی آرمان", status: "warehouse_logistics", splitMode: "grouped", priority: "normal", endIn: -2, createdIn: -18,
    note: "تحویل معوق — پیگیری لجستیک",
    items: [mkItem("بنر vinil 340g", 10, "warehouse", { designDone: day(-14), printDone: day(-5) }),
      mkItem("فلکس برش‌دار", 6, "warehouse", { designDone: day(-14), printDone: day(-5) }) ] });
  await mkOrder({ customer: "بیمارستان مهر", status: "warehouse_logistics", splitMode: "grouped", priority: "urgent", endIn: 1, createdIn: -20,
    items: [mkItem("فرم ثبت‌نام A4", 8000, "warehouse", { designDone: day(-16), printDone: day(-6) }),
      mkItem("پاکت نامه لمینت", 200, "warehouse", { designDone: day(-16), printDone: day(-5) }),
      mkItem("کارت ویزیت سلفونی مات", 1000, "warehouse", { designDone: day(-16), printDone: day(-4) }) ] });
  await mkOrder({ customer: "داروخانه سبز", status: "warehouse_logistics", splitMode: "separated", priority: "normal", endIn: 5, createdIn: -12,
    items: [mkItem("استیکر براق سفید", 2000, "warehouse", { designDone: day(-9), printDone: day(-1) }) ] });

  // ── completed (۶) ──
  const done = (prod, qty, extra = {}) => mkItem(prod, qty, "completed", { designDone: day(-25), printDone: day(-18), ...extra });
  await mkOrder({ customer: "کلینیک لبخند", status: "completed", splitMode: "grouped", priority: "normal", endIn: -3, createdIn: -40,
    items: [done("ست اداری (کارت+سربرگ+پاکت)", 5), done("کارت ویزیت سلفونی مات", 2000, { mat: true, matConfirmed: true }) ] });
  await mkOrder({ customer: "مجموعه برکت", status: "completed", splitMode: "separated", priority: "normal", endIn: -5, createdIn: -35,
    items: [done("کاتالوگ ۱۶ صفحه", 300, { printStart: day(-30), printEnd: day(-22) }) ] });
  await mkOrder({ customer: "فروشگاه مدار", status: "completed", splitMode: "grouped", priority: "urgent", endIn: -1, createdIn: -30,
    items: [done("بنر vinil 340g", 12), done("فلکس برش‌دار", 8), done("استیکر شفاف برش‌دار", 3000) ] });
  await mkOrder({ customer: "رایان‌گستر", status: "completed", splitMode: "grouped", priority: "normal", endIn: -8, createdIn: -45,
    note: "قرارداد سالانه — قسط دوم پرداخت شد",
    items: [done("کاتالوگ ۳۲ صفحه", 600), done("سربرگ A4 یک‌رو رنگی", 50) ] });
  await mkOrder({ customer: "آموزشگاه پارس", status: "completed", splitMode: "separated", priority: "normal", endIn: -10, createdIn: -50,
    items: [done("تراکت A4 یک‌رو", 20000) ] });
  await mkOrder({ customer: "گالری رنگین‌کمان", status: "completed", splitMode: "grouped", priority: "normal", endIn: -12, createdIn: -55,
    items: [done("پوستر A3 گلاسه", 400), done("کاتالوگ ۱۶ صفحه", 200) ] });

  // ── archived (۲) + cancelled (۱) ──
  await mkOrder({ customer: "شرکت آفتاب", status: "archived", splitMode: "grouped", priority: "normal", endIn: -30, createdIn: -80,
    note: "آرشیو سفارش سال گذشته",
    items: [mkItem("تراکت A5 دو‌رو", 10000, "archive", { designDone: day(-90), printDone: day(-80) }) ] });
  await mkOrder({ customer: "باشگاه ورشی", status: "archived", splitMode: "separated", priority: "normal", endIn: -25, createdIn: -70,
    items: [mkItem("بنر vinil 340g", 4, "archive", { designDone: day(-75), printDone: day(-68) }) ] });
  await mkOrder({ customer: "حسین رضایی", status: "cancelled", splitMode: "separated", priority: "normal", endIn: null, createdIn: -15,
    note: "مشتری منصرف شد — سفارش لغو",
    items: [mkItem("کارت ویزیت سلفونی مات", 500, "design", {})] });

  // ═══════════════ 7) پیش‌فاکتورها (۱۵) ═══════════════
  console.log("→ پیش‌فاکتورها…");
  let piNum = 0;
  const mkPI = async (orderIdx, spec) => {
    const o = created[orderIdx];
    piNum += 1;
    const items = (spec.items ?? []).map((it) => ({
      name: it.name,
      quantity: it.qty,
      unit: it.unit ?? "عدد",
      unitPrice: it.price,
      discount: it.discount ?? 0,
      total: it.qty * it.price - (it.discount ?? 0),
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const disc = spec.discountAmount ?? 0;
    const rate = spec.taxRate ?? 0;
    const tax = Math.round((subtotal - disc) * (rate / 100));
    const total = subtotal - disc + tax;
    const paid = Math.min(spec.paid ?? 0, total);
    const validDays = spec.validDays ?? 15;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);
    const pi = await db.preInvoice.create({
      data: {
        number: piNum,
        orderId: o.id,
        customerId: C[o.customerName],
        status: spec.status,
        issueDate: day(spec.issuedIn ?? -5),
        validUntil,
        items: JSON.stringify(items),
        subtotal, discountAmount: disc, taxRate: rate, taxAmount: tax,
        totalAmount: total, paidAmount: paid,
        notes: spec.notes ?? null,
        terms: spec.terms ?? "پرداخت ۵۰٪ پیش‌پرداخت، ۵۰٪ هنگام تحویل",
      },
    });
    o.paidFromPI = (o.paidFromPI ?? 0) + (spec.status !== "converted" ? paid : 0);
    return pi;
  };

  await mkPI(0, { status: "sent", items: [{ name: "منوی رستورانی لمینت", qty: 400, price: 8500 }, { name: "بنر ورودی ۳×۱.۵", qty: 2, price: 54000 }], paid: 100000, notes: "پیش‌پرداخت نقدی دریافت شد" });
  await mkPI(1, { status: "approved", items: [{ name: "ست اداری", qty: 3, price: 95000 }, { name: "کارت ویزیت مات", qty: 1000, price: 1500, discount: 50000 }], paid: 150000 });
  await mkPI(2, { status: "draft", items: [{ name: "پوستر A3 گلاسه", qty: 300, price: 5000 }], paid: 0 });
  await mkPI(3, { status: "sent", items: [{ name: "کاتالوگ ۱۶ صفحه", qty: 500, price: 18000, discount: 200000 }, { name: "کارت ویزیت براق", qty: 2000, price: 1500 }], paid: 0 });
  await mkPI(4, { status: "draft", items: [{ name: "فلکس برش‌دار", qty: 5, price: 15000 }], paid: 0 });
  await mkPI(5, { status: "sent", items: [{ name: "فرم ثبت‌نام سه‌لایه", qty: 3000, price: 550 }, { name: "پاکت نامه لمینت", qty: 100, price: 1200 }, { name: "تراکت A4", qty: 5000, price: 450 }], paid: 200000, notes: "چکامک بیمارستان" });
  await mkPI(9, { status: "approved", items: [{ name: "بنر vinil ۳۴۰g", qty: 3, price: 36000, discount: 30000 }, { name: "تراکت A5 دو‌رو", qty: 5000, price: 600 }], paid: 300000, taxRate: 5 });
  await mkPI(11, { status: "rejected", items: [{ name: "کاتالوگ ۳۲ صفحه", qty: 200, price: 32000 }], paid: 0, notes: "قیمت برای مشتری بالا بود — بازنگری شود" });
  await mkPI(15, { status: "approved", items: [{ name: "ست اداری", qty: 6, price: 95000 }, { name: "کارت ویزیت مات", qty: 3000, price: 1500 }], paid: 400000 });
  await mkPI(19, { status: "sent", items: [{ name: "تراکت A4 یک‌رو", qty: 10000, price: 450 }, { name: "پوستر A3", qty: 150, price: 5000 }], paid: 150000 });
  await mkPI(21, { status: "approved", items: [{ name: "بنر vinil ۶عدد", qty: 6, price: 54000 }], paid: 0 });
  await mkPI(23, { status: "converted", items: [{ name: "ست اداری کامل", qty: 5, price: 95000 }, { name: "کارت ویزیت مات", qty: 2000, price: 1500 }], paid: 200000, taxRate: 5 });
  await mkPI(25, { status: "converted", items: [{ name: "کاتالوگ ۱۶ صفحه", qty: 300, price: 18000 }], paid: 270000 });
  await mkPI(26, { status: "draft", items: [{ name: "بنر و فلکس تبلیغاتی", qty: 20, price: 13500 }], paid: 0 });
  await mkPI(29, { status: "sent", items: [{ name: "پوستر نمایشگاهی", qty: 400, price: 5000, discount: 100000 }], paid: 500000 });

  // ═══════════════ 8) فاکتورهای نهایی (۷) ═══════════════
  console.log("→ فاکتورهای نهایی…");
  let invNum = 0;
  const mkInv = async (orderIdx, spec) => {
    const o = created[orderIdx];
    invNum += 1;
    const items = (spec.items ?? []).map((it) => ({
      name: it.name, quantity: it.qty, unit: it.unit ?? "عدد",
      unitPrice: it.price, discount: it.discount ?? 0,
      total: it.qty * it.price - (it.discount ?? 0),
    }));
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const disc = spec.discountAmount ?? 0;
    const rate = spec.taxRate ?? 0;
    const tax = Math.round((subtotal - disc) * (rate / 100));
    const total = subtotal - disc + tax;
    const paid = Math.min(spec.paid ?? 0, total);
    const due = new Date();
    due.setDate(due.getDate() + (spec.dueDays ?? 30));
    const inv = await db.invoice.create({
      data: {
        number: invNum, orderId: o.id, customerId: C[o.customerName],
        status: spec.status, issueDate: day(spec.issuedIn ?? -6), dueDate: due,
        items: JSON.stringify(items), subtotal, discountAmount: disc,
        taxRate: rate, taxAmount: tax, totalAmount: total, paidAmount: paid,
        notes: spec.notes ?? null,
        terms: spec.terms ?? "پرداخت تا سررسید — جریمهٔ دیرکرد ۰.۵٪ روزانه",
        source: spec.source ?? "manual",
      },
    });
    o.paidFromInv = (o.paidFromInv ?? 0) + paid;
    return inv;
  };

  const inv23 = created[23], inv25 = created[25]; // completed → از PI تبدیل‌شده
  await mkInv(16, { status: "issued", items: [{ name: "تراکت A4 یک‌رو", qty: 10000, price: 450 }, { name: "پوستر A3 گلاسه", qty: 150, price: 5000 }, { name: "بنر vinil", qty: 2, price: 36000 }], paid: 1000000, dueDays: 20 });
  await mkInv(18, { status: "paid", items: [{ name: "استیکر شفاف برش‌دار", qty: 5000, price: 3500, discount: 250000 }, { name: "لیوان کاغذی چاپ‌دار", qty: 15, price: 220000 }], paid: 0 /* filled below */, taxRate: 5, notes: "تسویهٔ کامل نقدی" });
  await mkInv(20, { status: "issued", items: [{ name: "بنر vinil", qty: 10, price: 36000 }, { name: "فلکس برش‌دار", qty: 6, price: 15000 }], paid: 0, dueDays: 10 });
  await mkInv(21, { status: "issued", items: [{ name: "فرم ثبت‌نام سه‌لایه", qty: 8000, price: 550 }, { name: "پاکت نامه لمینت", qty: 200, price: 1200 }, { name: "کارت ویزیت مات", qty: 1000, price: 1500 }], paid: 2000000, taxRate: 5 });
  // فاکتورهای تبدیل‌شده از PI (paid همان PI)
  await mkInv(23, { status: "paid", source: "pre_invoice", items: [{ name: "ست اداری کامل", qty: 5, price: 95000 }, { name: "کارت ویزیت مات", qty: 2000, price: 1500 }], paid: 200000, taxRate: 5, notes: "تبدیل از پیش‌فاکتور تاییدشده" });
  await mkInv(25, { status: "issued", source: "pre_invoice", items: [{ name: "کاتالوگ ۱۶ صفحه", qty: 300, price: 18000 }], paid: 270000, dueDays: 45 });
  await mkInv(26, { status: "cancelled", items: [{ name: "بنر و فلکس", qty: 20, price: 13500 }], paid: 0, notes: "سفارش در انبار اصلاح شد — فاکتور باطل" });
  // ترمیم فاکتور paid کامل (#2)
  await db.invoice.update({ where: { number: 2 }, data: { paidAmount: 4187500 } });
  const inv2 = await db.invoice.findUnique({ where: { number: 2 } });
  created[18].paidFromInv = (created[18].paidFromInv ?? 0) + (inv2.paidAmount - 500000);

  // ── sync order.paidAmount از اسناد ──
  for (const o of created) {
    await db.order.update({
      where: { id: o.id },
      data: { paidAmount: (o.paidFromPI ?? 0) + (o.paidFromInv ?? 0) },
    });
  }

  // شمارنده‌ها
  await db.counter.createMany({
    data: [
      { id: "order", next: orderNum + 1 },
      { id: "preInvoice", next: piNum + 1 },
      { id: "invoice", next: invNum + 1 },
    ],
  });

  // ═══════════════ 9) تسک‌ها (۴۸) ═══════════════
  console.log("→ تسک‌ها…");
  const T = (title, module, status, priority, dueIn, assignee, orderIdx, desc) => ({
    title, module, status, priority, dueDate: day(dueIn),
    assignedTo: assignee?.id ?? null,
    orderId: orderIdx !== undefined ? created[orderIdx].id : null,
    customerId: orderIdx !== undefined ? C[created[orderIdx].customerName] : null,
    description: desc ?? null,
  });
  const tasksSpec = [
    // طراح
    T("طراحی منوی فصلی پاییز — نسخهٔ اول", "designer", "in_progress", "urgent", 1, sara, 0, "پس از تایید مشتری فایل به چاپ ارسال شود"),
    T("طراحی بنر ورودی رستوران باران", "designer", "todo", "normal", 1, sara, 0),
    T("طراحی ست اداری کلینیک لبخند", "designer", "in_progress", "normal", 3, sara, 1),
    T("اصلاح رنگ لوگو مطابق برند", "designer", "todo", "normal", 2, sara, 2),
    T("طراحی جلد کاتالوگ آموزشگاه پارس", "designer", "done", "normal", -2, mehdiD, 3, "تایید مشتری دریافت شد"),
    T("طراحی فرم سه‌لایه بیمارستان", "designer", "in_progress", "urgent", 0, sara, 5, "شماره سریال منحصر‌به‌فرد هر فرم"),
    T("طراحی برچسب دارو با بارکد", "designer", "todo", "normal", 4, mehdiD, 7),
    T("طراحی لیوان و استیکر کافه ترنج", "designer", "todo", "normal", 2, sara, 8, "سبز فیروزه‌ای برند"),
    T("بازبینی فایل‌های آمادهٔ چاپ", "designer", "done", "normal", -1, mehdiD, undefined, "کنترل کیفیت فایل قبل از چاپ"),
    T("طراحی سربرگ وکالت", "designer", "todo", "low", 6, mehdiD, 9),
    // چاپ
    T("چاپ تست رنگ کاتالوگ", "print", "todo", "normal", 2, reza, 3),
    T("چاپ منو لمینت — نسخهٔ نهایی", "print", "in_progress", "urgent", 1, reza, 0),
    T("چاپ بنر و فلکس فروشگاه مدار", "print", "in_progress", "normal", 3, reza, 11),
    T("تایید متریال سلفونی ریان‌گستر", "print", "todo", "urgent", 0, reza, 12, "کاغذ مات ۳۰۰ گرم"),
    T("چاپ کاتالوگ ۳۲ صفحه آژانس", "print", "in_progress", "urgent", 1, ali, 14, "تطبیق رنگ با برندبوک الزامی"),
    T("چاپ کارت ویزیت حسین رضایی", "print", "todo", "normal", 3, ali, 15),
    T("چاپ پوستر گالری", "print", "done", "normal", -2, reza, 13),
    T("کالیبره‌کردن دستگاه چاپ افست", "print", "done", "normal", -4, reza, undefined, "نگهداری دوره‌ای"),
    T("آماده‌سازی تیراژ تراکت شرکت آفتاب", "print", "in_progress", "normal", 2, ali, 16),
    // انبار
    T("خرید متریال بنر براق", "warehouse", "todo", "urgent", 0, hossein, 9),
    T("بسته‌بندی ۴۰۰ منوی رستوران", "warehouse", "todo", "normal", 2, hossein, 0),
    T("ارسال بنر مدارس نور به محل", "warehouse", "in_progress", "urgent", 0, hossein, 18),
    T("پیگیری تحویل معوق ساختمانی آرمان", "warehouse", "in_progress", "urgent", -1, hossein, 20),
    T("شمارش انبار ماهانه", "warehouse", "todo", "normal", 5, hossein, undefined),
    T("تحویل سفارش بیمارستان مهر", "warehouse", "todo", "urgent", 1, hossein, 21),
    T("مرتب‌سازی قفسهٔ کاغذ گلاسه", "warehouse", "done", "normal", -3, hossein, undefined),
    T("برچسب‌گذاری استیکرهای داروخانه", "warehouse", "todo", "normal", 4, hossein, 22),
    // مالی
    T("صدور فاکتور نهایی رستوران باران", "finance", "todo", "normal", 3, negar, 0),
    T("پیگیری پرداخت کلینیک لبخند", "finance", "in_progress", "urgent", 0, negar, 1),
    T("ثبت تسویهٔ کامل کافه ترنج", "finance", "done", "normal", -2, negar, 18),
    T("پیگیری چک بیمارستان مهر", "finance", "in_progress", "normal", 1, negar, 21),
    T("صدور پیش‌فاکتور اصلاح‌شده مجموعه برکت", "finance", "todo", "normal", 2, negar, 11),
    T("گزارش مالی هفتگی", "finance", "todo", "normal", 4, negar, undefined, "جمع‌بندی دریافتی/بدهی"),
    // QC
    T("کنترل کیفیت ست اداری لبخند", "qc", "in_progress", "normal", 1, nima, 1),
    T("بررسی گزارش رنگ بنر مدار", "qc", "todo", "urgent", 0, nima, 11),
    T("کنترل فرم‌های چاپ‌شده بیمارستان", "qc", "todo", "normal", 2, nima, 21),
    T("بررسی شکایت رنگ فلکس آرمان", "qc", "in_progress", "urgent", -1, nima, 20),
    T("گزارش هفتاری کیفیت چاپ", "qc", "done", "normal", -3, nima, undefined),
    // CRM
    T("تماس با باشگاه ورشی برای فایل بنر", "crm", "todo", "normal", 1, maryam, 4),
    T("پیگیری تایید پیش‌فاکتور آموزشگاه پارس", "crm", "in_progress", "normal", 0, maryam, 3),
    T("تماس تشکری از مشتری بیمارستان مهر", "crm", "todo", "normal", 2, maryam, 21),
    T("پیگیری منصرف‌شدن حسین رضایی", "crm", "done", "normal", -2, maryam, 30),
    T("معرفی خدمات بسته‌بندی به نانو پک", "crm", "todo", "normal", 5, maryam, undefined),
    // SRM
    T("به‌روزرسانی قیمت کاغذ با کاغذ برتر", "srm", "todo", "normal", 5, amir, undefined),
    T("سفارش vinil براق از vinil مرکزی", "srm", "in_progress", "urgent", 0, amir, 9),
    T("ارزیابی کیفیت لمینت گستر پارس", "srm", "todo", "normal", 3, amir, undefined),
    // ادمین
    T("بازبینی روزانهٔ سفارشات معوق", "admin", "done", "normal", -1, admin, undefined),
    T("آپدیت لیست قیمت خدمات چاپ", "admin", "in_progress", "normal", 7, admin, undefined),
    T("تنظیم گزارش مدیریتی ماه", "admin", "todo", "normal", 6, admin, undefined),
    T("مرتب‌سازی دسته‌بندی تامین‌کنندگان", "admin", "todo", "low", 10, admin, undefined),
  ];
  for (const t of tasksSpec) await db.task.create({ data: t });

  // ═══════════════ 10) گزارش‌های QC (۹) ═══════════════
  console.log("→ کنترل کیفیت…");
  const qcSpecs = [
    [0, "designer", "رنگ منوی غذایی با نمونهٔ تاییدشده فاصله دارد", "pending", null, null],
    [1, "designer", "فونت کارت ویزیت در سلفون مات وضوح کافی ندارد", "reviewing", null, null],
    [3, "designer", "جلد کاتالوگ تایید شد — فایل نهایی آماده", "approved", "design", null],
    [7, "designer", "بارکد برچسب دارو اسکن نمی‌شود — تراک باید اصلاح شود", "rejected", "design", null],
    [9, "print", "چماقی‌شدن لبه‌های فلکس در برش", "pending", null, null],
    [11, "print", "رنگ بنر با پروفایل_ICC مطابقت ندارد", "reviewing", null, null],
    [16, "print", "تراکت A4 — کیفیت چاپ تایید شد", "approved", null, null],
    [20, "print", "فلکس ساختمانی آرمان — رنگ‌های پریده", "rejected", "print", null],
    [21, "print", "فرم‌های سه‌لایه — تراز چاپ عالی", "approved", null, null],
  ];
  for (const [oi, fromModule, description, status, returnStage] of qcSpecs) {
    await db.qcReport.create({
      data: {
        orderId: created[oi].id, fromModule, description, status,
        returnStage: returnStage ?? null,
        reportedBy: fromModule === "designer" ? "طراح" : "چاپ",
        reviewedBy: status === "approved" || status === "rejected" ? "نیما قاسمی" : null,
        reviewedAt: status === "approved" || status === "rejected" ? day(-1) : null,
      },
    });
  }

  // ═══════════════ 11) هزینه‌های متریال (۱۳) ═══════════════
  console.log("→ هزینه‌های متریال…");
  const costSpecs = [
    [0, "خرید کاغذ گلاسه ۱۳۵ برای منو", 850000, "چاپخانه نیکان", "خرید کاغذ و متریال", "approved", "print"],
    [0, "لمینت مات منو", 320000, "لمینت گستر پارس", "هزینه چاپ خارجی", "approved", "print"],
    [1, "سلفون کارت ویزیت", 180000, "لمینت گستر پارس", "هزینه چاپ خارجی", "pending", "print"],
    [5, "کاغذ فرم سه‌لایه", 1200000, "کاغذ برتر خراسان", "خرید کاغذ و متریال", "approved", "print"],
    [9, "vinil براق ۱۵ متر", 147000, "vinil مرکزی", "خرید کاغذ و متریال", "pending", "print"],
    [11, "متریال فلکس و بنر مدار", 260000, "vinil مرکزی", "خرید کاغذ و متریال", "approved", "print"],
    [12, "کاغذ سلفونی ریان‌گستر", 195000, "کاغذ برتر خراسان", "خرید کاغذ و متریال", "rejected", "print", "قیمت بالاتر از استعلام"],
    [14, "چاپ تست رنگ آژانس", 90000, "مجموعه دیجیتال پرینت", "هزینه چاپ خارجی", "approved", "print"],
    [16, "چاپ افست تیراژ تراکت", 2200000, "چاپخانه نیکان", "هزینه چاپ خارجی", "approved", "print"],
    [17, "نصب بنر مدارس نور", 130000, "نصب بنر تهران", "هزینه نصب", "pending", "warehouse"],
    [18, "حمل کافه ترنج", 45000, "حمل‌ونقل سریع‌السیر", "حمل و نقل", "approved", "warehouse"],
    [20, "حمل مجدد سفارش معوق آرمان", 90000, "حمل‌ونقل سریع‌السیر", "حمل و نقل", "pending", "warehouse"],
    [21, "جعبه‌های بسته‌بندی بیمارستان", 540000, "جعبه‌سازی امید", "خرید کاغذ و متریال", "approved", "warehouse"],
  ];
  for (const [oi, description, amount, sup, et, status, module, note] of costSpecs) {
    await db.materialCost.create({
      data: {
        orderId: created[oi].id, description, amount,
        supplierId: S[sup], expenseTypeId: ET[et], status, module,
        createdBy: "چاپ/انبار", createdAt: day(-4),
      },
    });
  }

  // ═══════════════ 12) پرداخت‌ها (۱۸) ═══════════════
  console.log("→ پرداخت‌ها…");
  const paySpecs = [
    ["رستوران باران", 0, 100000, "validated", "cash", "پیش‌پرداخت منو"],
    ["کلینیک لبخند", 1, 150000, "validated", "transfer", "پیش‌پرداخت ست اداری"],
    ["بیمارستان مهر", 5, 200000, "validated", "cheque", "چک شماره ۱۲۳۴"],
    ["رستوران باران", 9, 300000, "awaiting", "transfer", "پیش‌پرداخت فصل جدید"],
    ["رایان‌گستر", 15, 400000, "validated", "cash", "قسط اول قرارداد"],
    ["شرکت آفتاب", 19, 150000, "validated", "transfer", ""],
    ["شرکت آفتاب", 16, 1000000, "validated", "cheque", "فاکتور #۱ — قسط"],
    ["کافه ترنج", 18, 4187500, "validated", "cash", "تسویهٔ کامل فاکتور #۲"],
    ["بیمارستان مهر", 21, 2000000, "awaiting", "transfer", "فاکتور #۴ — در انتظار تایید بانک"],
    ["کلینیک لبخند", 23, 200000, "validated", "cash", "فاکتور #۵ — تسویه کامل"],
    ["مجموعه برکت", 25, 270000, "validated", "transfer", "فاکتور #۶"],
    ["آموزشگاه پارس", 3, 0, "awaiting", "cash", "پیش‌پرداخت در انتظار واریز"],
    ["مجموعه برکت", 24, 120000, "validated", "cash", "پیش‌پرداخت کاتالوگ قبلی"],
    ["فروشگاه مدار", 26, 350000, "awaiting", "cheque", "چک در انتظار سررسید"],
    ["رایان‌گستر", 27, 250000, "validated", "transfer", "بدهی قدیمی — بخش اول"],
    ["مدارس نور", 17, 0, "awaiting", "cash", "پس از تحویل بنر"],
    ["آژانس مسیر سبز", 14, 500000, "validated", "cash", "پیش‌پرداخت کاتالوگ توریسم"],
    ["داروخانه سبز", 22, 150000, "validated", "cash", "پیش‌پرداخت استیکر"],
  ];
  for (const [cust, oi, amount, status, method, note] of paySpecs) {
    if (amount <= 0) continue;
    await db.payment.create({
      data: {
        customerId: C[cust],
        orderId: oi !== null ? created[oi]?.id ?? null : null,
        amount, status, method, note: note || null, date: day(-5),
      },
    });
  }

  // ═══════════════ 13) هزینه‌های عمومی (۱۵) ═══════════════
  const expSpecs = [
    ["اجارهٔ کارگاه — مهر", 3500000, "اجاره", -20],
    ["حقوق تیم طراحی", 4200000, "حقوق", -18],
    ["شارژ تونر دستگاه چاپ", 780000, "مصرفی چاپ", -15],
    ["شارژ ماهانه برق", 950000, "انرژی", -12],
    ["شارژ آب و گاز", 210000, "انرژی", -12],
    ["سرویس دوره‌ای دستگاه افست", 1400000, "نگهداری", -10],
    ["خرید قفسهٔ انبار", 650000, "تجهیزات", -8],
    ["تبلیغات اینستاگرام", 400000, "بازاریابی", -6],
    ["چاپ کارت تبلیغاتی داخلی", 150000, "بازاریابی", -5],
    ["اینترنت اختصاصی", 300000, "خدمات", -4],
    ["تمیزکاری", 120000, "خدمات", -3],
    ["تعویض تیغ برش", 95000, "مصرفی چاپ", -2],
    ["ناهار تیم (جلسهٔ ماهانه)", 250000, "رفاه", -1],
    ["خرید میز کار طراح", 850000, "تجهیزات", -1],
    ["آب‌میوه و پذیرایی مشتری", 60000, "رفاه", 0],
  ];
  for (const [title, amount, category, inDay] of expSpecs) {
    await db.expense.create({ data: { title, amount, category, date: day(inDay) } });
  }

  // ═══════════════ 14) نوتیفیکیشن‌ها (۱۴) ═══════════════
  const notifSpecs = [
    ["سفارش فوری ثبت شد", "سفارش #۳ شرکت آفتاب با اولویت فوری ثبت شد", "warning", "admin:orders"],
    ["طراحی سفارش کامل شد", "سفارش #۱۰ رستوران باران به مرحلهٔ چاپ رفت", "success", "print:orders"],
    ["متریال نیاز است", "۲ آیتم سفارش #۶ نیازمند تایید متریال هستند", "warning", "print:orders"],
    ["موعد طراحی گذشته", "سفارش #۳ — موعد طراحی دیروز بود", "error", "designer:orders"],
    ["پیش‌فاکتور ارسال شد", "پیش‌فاکتور #۱ برای رستوران باران ارسال شد", "info", "admin:orders"],
    ["فاکتور صادر شد", "فاکتور #۱ برای شرکت آفتاب صادر شد", "success", "admin:orders"],
    ["گزارش کنترل کیفیت", "گزارش رنگ فلکس آرمان به QC ارسال شد", "warning", "qc:dashboard"],
    ["تسک معوق", "۴ تسک امروز سررسید دارند", "warning", "admin:tasks"],
    ["پرداخت دریافت شد", "تسویهٔ کامل کافه ترنج (۴٬۱۸۷٬۵۰۰ IQD)", "success", "finance:payments"],
    ["سفارش تحویل شد", "سفارش #۲۴ مدارس نور تحویل داده شد", "success", "admin:orders"],
    ["پیش‌فاکتور رد شد", "پیش‌فاکتور #۸ مجموعه برکت رد شد — بازنگری قیمت", "error", "admin:orders"],
    ["سفارش جدید وب", "سفارش #۸ داروخانه سبز ثبت شد", "info", "admin:orders"],
    ["هزینه در انتظار تایید", "۳ هزینهٔ متریال در انتظار تایید مالی", "warning", "finance:costs"],
    ["همگام‌سازی انبار", "شمارش انبار ماهانه فردا", "info", "warehouse:dashboard"],
  ];
  for (const [title, message, type, link] of notifSpecs) {
    await db.notification.create({ data: { title, message, type, link, createdAt: day(-1) } });
  }

  // ═══════════════ 15) معاملات CRM (۱۲) ═══════════════
  console.log("→ CRM…");
  const dealSpecs = [
    ["قرارداد منوی فصلی باران", "رستوران باران", 4200000, "negotiation", 70, "walk-in", -10, 5],
    ["ست اداری سالانه لبخند", "کلینیک لبخند", 9500000, "won", 100, "referral", -30, -2],
    ["بروشور آموزشی پارس", "آموزشگاه پارس", 6800000, "proposal", 55, "phone", -7, 8],
    ["کاتالوگ توریسم مسیر سبز", "آژانس مسیر سبز", 12500000, "negotiation", 65, "online", -14, 12],
    ["بسته‌بندی نانو پک", "نانو پک", 8000000, "qualified", 40, "phone", -5, 20],
    ["بنر و فلکس مدار — قرارداد ماهانه", "فروشگاه مدار", 5200000, "won", 100, "walk-in", -45, -8],
    ["فرم‌های تخصصی بیمارستان مهر", "بیمارستان مهر", 15000000, "proposal", 60, "referral", -12, 15],
    ["قرارداد مدارس نور", "مدارس نور", 7500000, "negotiation", 75, "phone", -9, 10],
    ["هویت بصری گالری رنگین‌کمان", "گالری رنگین‌کمان", 3000000, "lead", 20, "online", -2, 30],
    ["کاتالوگ رایان‌گستر ۱۴۰۵", "رایان‌گستر", 9800000, "won", 100, "referral", -60, -12],
    ["استیکر داروخانه سبز", "داروخانه سبز", 1200000, "lost", 0, "walk-in", -20, -15],
    ["بروشور بیمارستان — فاز ۲", "بیمارستان مهر", 5500000, "lead", 25, "phone", -1, 25],
  ];
  for (const [title, cust, value, stage, probability, source, createdIn, closeIn] of dealSpecs) {
    await db.deal.create({
      data: {
        title, customerId: C[cust], value, stage, probability,
        source, expectedCloseDate: day(closeIn), createdAt: day(createdIn),
        assignedTo: maryam.id,
        description: stage === "won" ? "قرارداد نهایی شد" : null,
      },
    });
  }

  // ═══════════════ 16) فعالیت‌های CRM (۲۰) ═══════════════
  const actSpecs = [
    ["call", "تماس پیگیری پیش‌فاکتور", "رستوران باران", 0, -1, "مشتری قیمت را تایید کرد — ارسال نسخه نهایی"],
    ["meeting", "جلسهٔ ست اداری", "کلینیک لبخند", 1, -4, "رنگ سازمانی و کاغذ تعیین شد"],
    ["email", "ارسال پیش‌نویس کاتالوگ", "آموزشگاه پارس", 2, -2, ""],
    ["call", "پیگیری منصرف‌شدن", "حسین رضایی", null, -3, "قیمت بالاتر از انتظار بود"],
    ["visit", "بازدید محل نصب بنر", "مدارس نور", null, -5, "اندازه‌گیری جایگاه‌ها"],
    ["meeting", "جلسهٔ قرارداد بسته‌بندی", "نانو پک", 4, -6, "نمونه‌ها ارائه شد"],
    ["call", "تماس تشکری", "کافه ترنج", null, -1, "از کیفیت لیوان‌ها راضی بودند"],
    ["email", "ارسال پیش‌فاکتور اصلاحی", "مجموعه برکت", null, -2, ""],
    ["note", "یادداشت بدهی", "آموزشگاه پارس", null, -8, "بدهی ۴۲۰ هزار تومان از فصل قبل"],
    ["call", "پیگیری چک بیمارستان", "بیمارستان مهر", null, -1, "چک فردا سررسید می‌شود"],
    ["visit", "بازدید نمایشگاه چاپ", null, null, -10, "سرکشت تامین‌کنندگان جدید"],
    ["meeting", "جلسهٔ معرفی خدمات", "ساختمانی آرمان", null, -12, "پیشنهاد بنر پروژه‌های جدید"],
    ["email", "خبرنامه فصلی", null, null, -7, "ارسال به ۲۲۰ مخاطب"],
    ["call", "تماس فروش سلفون", "داروخانه سبز", null, -4, "استیکر برچسب دارو"],
    ["note", "مشتری VIP", "شرکت آفتاب", null, -15, "همیشه اولویت تولید"],
    ["call", "پیگیری معامله گالری", "گالری رنگین‌کمان", 8, -2, "منتظر تصمیم مدیر گالری"],
    ["meeting", "جلسهٔ قرارداد کاتالوگ", "آژانس مسیر سبز", 3, -5, "تیراژ و کاغذ نهایی شد"],
    ["call", "تماس پیگیری پرداخت", "رایان‌گستر", null, -3, "قسط بعدی هفتهٔ آینده"],
    ["note", "منبع معرفی: مریم", "بیمارستان مهر", null, -13, "معرفی توسط کلینیک لبخند"],
    ["email", "ارسال نمونه‌کار چاپ", "آموزشگاه پارس", null, -9, ""],
  ];
  for (const [type, title, cust, dealIdx, inDay, desc] of actSpecs) {
    await db.activity.create({
      data: {
        type, title, description: desc || null,
        customerId: cust ? C[cust] : null,
        date: day(inDay),
        dealId: dealIdx !== null && dealIdx !== undefined ? (await db.deal.findFirst({ where: { title: { contains: "قرارداد" } }, skip: dealIdx }))?.id ?? null : null,
      },
    });
  }

  // ═══════════════ 17) یادداشت‌های تقویم (۱۲) ═══════════════
  const noteColors = ["default", "rose", "amber", "emerald", "blue"];
  const dayNoteSpecs = [
    [-8, "جلسهٔ برنامه‌ریزی تولید هفته", "default"],
    [-5, "تحویل بنر مدارس نور", "emerald"],
    [-2, "سررسید چک بیمارستان مهر", "rose"],
    [-1, "بازبینی متریال انبار", "amber"],
    [0, "امروز: ۴ تسک سررسید + شمارش انبار", "rose"],
    [1, "ارسال سفارش باران به چاپ", "default"],
    [2, "جلسهٔ کیفیت با تیم چاپ", "blue"],
    [4, "گزارش مالی هفتگی", "emerald"],
    [6, "سررسید پیش‌فاکتور #۳", "amber"],
    [8, "نمایشگاه چاپ بغداد — بازدید", "blue"],
    [10, "برنامهٔ نگهداری دستگاه افست", "default"],
    [12, "بازنگری لیست قیمت خدمات", "amber"],
  ];
  for (const [inDay, content, color] of dayNoteSpecs) {
    await db.dayNote.create({
      data: { date: localDayKey(inDay), content, color },
    });
  }

  // ═══════════════ گزارش نهایی ═══════════════
  const [orders, tasks, pis, invs, customers, products, suppliers, services, priceLists] =
    await Promise.all([
      db.order.count(), db.task.count(), db.preInvoice.count(),
      db.invoice.count(), db.customer.count(), db.product.count(),
      db.supplier.count(), db.supplierService.count(), db.priceList.count(),
    ]);
  console.log(
    `✓ دیتای دمو ساخته شد: ${orders} سفارش · ${pis} پیش‌فاکتور · ${invs} فاکتور · ` +
    `${tasks} تسک · ${customers} مشتری · ${products} محصول · ${suppliers} تامین‌کننده · ` +
    `${services} خدمت · ${priceLists} لیست قیمت`
  );
  console.log("  ورود ادمین: admin@printoo24.com / admin123 — کارمندان: sara|reza|… @printoo24.com / employee123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
