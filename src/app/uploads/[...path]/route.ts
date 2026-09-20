import { NextRequest, NextResponse } from "next/server";
import { stat, readFile } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/auth";
import { safeUploadPath } from "@/lib/uploads-dir";
import { jsonError } from "@/lib/api-error";

// ─── Phase 19: سرو فایل پیوست‌ها — GET /uploads/[...path] ──────────
//
// URLهای عمومی /uploads/costs/<uuid>.<ext> (ذخیره‌شده در CostAttachment)
// از دایرکتوری ماندگار (lib/uploads-dir) سرو می‌شوند — نه از public که
// با بیلد standalone بازسازی می‌شود.
//
//   • requireUser → پیوست‌ها فقط برای کاربران واردشده (عمومی نیست)
//   • گارد path traversal (safeUploadPath) — فقط داخل ریشهٔ uploads
//   • Content-Type از پسوند + Content-Disposition inline (مرورگر PDF/
//     تصویر را باز می‌کند؛ دانلود با attribute download از UI می‌آید)
//   • fallback: اگر فایل در ریشهٔ ماندگار نبود، public/uploads هم چک
//     می‌شود (فایل‌های قدیمی قبل از این فاز) — سازگاری کامل با دادهٔ
//     موجود.
//
// نکتهٔ Next: فایل‌های هم‌موجود در public/ توسط سرو استاتیک خودِ Next
// سرو می‌شوند (اولویت با static) — این route فقط بقیهٔ URLها را می‌گیرد.

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const { path: segments } = await params;
    const rel = (segments ?? []).join("/");
    if (!rel || rel.includes("..")) {
      return NextResponse.json({ error: "مسیر نامعتبر" }, { status: 400 });
    }

    // 1) ریشهٔ ماندگار
    const full = safeUploadPath(rel);
    if (full) {
      try {
        const st = await stat(full);
        if (st.isFile()) {
          const buf = await readFile(full);
          return fileResponse(buf, rel);
        }
      } catch {
        // نبود — fallback پایین
      }
    }

    // 2) fallback: public/uploads (فایل‌های قبل از Phase 19)
    const legacy = path.join(process.cwd(), "public", "uploads", ...segments);
    try {
      const st = await stat(legacy);
      if (st.isFile()) {
        const buf = await readFile(legacy);
        return fileResponse(buf, rel);
      }
    } catch {
      // نبود
    }

    return NextResponse.json(
      { error: "فایل یافت نشد — پیوست حذف یا در بیلد قبلی از دست رفته است" },
      { status: 404 }
    );
  } catch (e) {
    return jsonError(e, "خطا در خواندن فایل");
  }
}

function fileResponse(buf: Buffer, rel: string): NextResponse {
  const ext = path.extname(rel).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  // inline برای مشاهده در مرورگر؛ اسم دانلود = نام فایل روی دیسک
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.length),
      "Content-Disposition": `inline; filename="${path.basename(rel)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
