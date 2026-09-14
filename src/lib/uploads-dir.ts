import path from "path";

// ─── Phase 19: دایرکتوری ماندگار پیوست‌ها ───────────────────────────
//
// باگ: پیوست‌ها در `.next/standalone/public/uploads` می‌نوشتند که با هر
// بیلد production پاک می‌شود → لینک دانلود در پنل مالی ۴۰۴ می‌شد
// («کروم خطا میداد، هیچ فایلی نمی‌آمد»).
//
// اولویت resolution:
//   ۱) UPLOADS_DIR محیط (systemd: /opt/printoo24-admin/uploads)
//   ۲) production با cwd داخل .next/standalone → دو سطح بالاتر (ریشهٔ
//      پروژه) + /uploads — خارج از پوشهٔ build، مانا در ری‌بیلد
//   ۳) dev → public/uploads (سندباکس — سرو استاتیک خود Next)

export function uploadsRoot(): string {
  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) {
    return path.resolve(process.env.UPLOADS_DIR.trim());
  }
  const cwd = process.cwd();
  if (process.env.NODE_ENV === "production") {
    // standalone: /opt/app/.next/standalone → /opt/app/uploads
    const rel = path.relative(cwd, path.join(cwd, "..", ".."));
    if (/^(\.\.[\\/])*$/.test(rel) === false && cwd.includes(".next")) {
      return path.resolve(cwd, "..", "..", "uploads");
    }
    // بیلد non-standalone: رییشهٔ پروژه خودش مانا نیست → uploads در رییشه
    return path.resolve(cwd, "uploads");
  }
  return path.resolve(cwd, "public", "uploads");
}

/** مسیر امن داخل ریشهٔ پیوست‌ها — مسیر پیمایش (..) را می‌بندد. */
export function safeUploadPath(urlPath: string): string | null {
  const clean = urlPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(uploadsRoot(), clean);
  const root = uploadsRoot();
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (clean.includes("..")) return null;
  return full;
}
