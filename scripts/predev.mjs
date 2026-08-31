// Printoo24 ERP — predev self-heal script (Phase 7)
//
// اجرای خودکار قبل از هر `npm run dev` / `bun run dev`:
//   1. prisma generate — کلاینت Prisma با schema آخر ساخته می‌شود
//   2. prisma db push  — دیتابیس با schema همگام می‌شود
//   3. اگر کلاینتِ تولیدشده نسبت به دفعهٔ قبل تغییر کرده باشد،
//      کش Turbopack (.next) پاک می‌شود.
//
// چرا قدم ۳ حیاتی است؟ ریشهٔ ۵۰۰های «Unknown field assignedUser»:
// Turbopack چانک‌های کامپایل‌شده را در .next کش می‌کند؛ بعد از
// pull جدید + prisma generate، کلاینتِ نو در node_modules است ولی
// چانک‌های قدیمی هنوز کلاینتِ پیشین را import می‌کنند → خطای اعتبارسنجی
// Prisma در زمان اجرا. پاک‌سازی کش فقط «وقتی کلاینت عوض شده» انجام
// می‌شود تا ری‌استارتهای معمولی سرد نشوند.
//
// اگر db push به‌خاطر ردیف‌های قدیمیِ شکل قبلی PreInvoice شکست بخورد،
// ردیف‌های legacy حذف و push دوباره اجرا می‌شود (دادهٔ تستی فاز قبل —
// به‌صورت صریح توسط کاربر منسوخ اعلام شده بود).

import { execSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const PRISMA_DIR = "node_modules/.prisma/client";
const STAMP = `${PRISMA_DIR}/.stamp-hash`;

function clientHash() {
  try {
    const parts = ["schema.prisma", "index.js", "client.js"].map(
      (f) => fs.readFileSync(`${PRISMA_DIR}/${f}`).toString()
    );
    return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
  } catch {
    return "missing";
  }
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

try {
  run("prisma generate");

  try {
    run("prisma db push --accept-data-loss");
  } catch {
    console.log(
      "\n[predev] db push شکست خورد — ردیف‌های legacy (PreInvoice/Invoice) حذف و تلاش دوباره..."
    );
    try {
      // فاز ۹: مدل Invoice بازسازی شد (ستون‌های required جدید) — ردیف‌های
      // شکل قدیم باید حذف شوند تا ALTER TABLE ممکن شود. PreInvoice هم از
      // فاز ۷ همین وضعیت را دارد. اسکریپت دیتای دمو بعداً همه را بازمی‌سازد.
      for (const table of ["PreInvoice", "Invoice"]) {
        try {
          execSync("prisma db execute --schema prisma/schema.prisma --stdin", {
            stdio: "inherit",
            input: `DELETE FROM "${table}";`,
          });
        } catch {
          // جدول ممکن است هنوز وجود نداشته باشد — بی‌خطر
        }
      }
      run("prisma db push --accept-data-loss");
    } catch (e) {
      console.error(
        "\n[predev] خطا در همگام‌سازی دیتابیس. دستی اجرا کنید:\n" +
          "  bunx prisma db push --accept-data-loss\n"
      );
      process.exit(1);
    }
  }

  // ─── کش Turbopack هنگام تغییر کلاینت Prisma ─────────────────────
  const stamp = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8") : null;
  const hash = clientHash();

  if (hash !== stamp) {
    if (fs.existsSync(".next")) {
      console.log(
        "[predev] کلاینت Prisma تغییر کرده — کش .next پاک می‌شود (یک‌بار)"
      );
      fs.rmSync(".next", { recursive: true, force: true });
    }
    fs.writeFileSync(STAMP, hash);
  }
} catch (e) {
  console.error("[predev] شکست:", e.message);
  process.exit(1);
}
