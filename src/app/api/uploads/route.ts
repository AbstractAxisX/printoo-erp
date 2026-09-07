import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/api-error";

// ─── Phase 14: فایل آپلود عمومی (پیوست هزینه‌ها) ────────────────
// POST multipart/form-data: files under key "file" (single or multiple).
// Saves to public/uploads/costs/<uuid>.<ext> → returns public URL.
// Constraints: ≤10MB/file; pdf/images/office/zip types allowed.

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXT = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
  ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip", ".rar",
]);

function safeExt(name: string): string | null {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : null;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
    }
    if (files.length > 6) {
      return NextResponse.json({ error: "حداکثر ۶ فایل در هر بار آپلود" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", "uploads", "costs");
    await mkdir(dir, { recursive: true });

    const results: { url: string; fileName: string; mimeType: string; size: number }[] = [];
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است` },
          { status: 400 }
        );
      }
      const ext = safeExt(file.name);
      if (!ext) {
        return NextResponse.json(
          { error: `فرمت فایل «${file.name}» مجاز نیست (PDF، تصویر، آفیس یا ZIP)` },
          { status: 400 }
        );
      }
      const id = randomUUID();
      const stored = `${id}${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(dir, stored), buf);
      results.push({
        url: `/uploads/costs/${stored}`,
        fileName: file.name,
        mimeType: file.type || ext.replace(".", ""),
        size: file.size,
      });
    }

    return NextResponse.json({ files: results }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در آپلود فایل");
  }
}
