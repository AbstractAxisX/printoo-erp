import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/access";
import { jsonError } from "@/lib/api-error";

// ─── Phase 16: GET/POST /api/materials ──────────────────────────
// GET  → مواد اولیهٔ انبار + کم‌موجودی‌ها
// POST → مادهٔ جدید { name, unit, minQuantity?, note? }

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const materials = await db.material.findMany({
      where: { isActive: true },
      orderBy: [{ quantity: "asc" }, { name: "asc" }],
      include: {
        moves: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, delta: true, reason: true },
        },
      },
    });
    return NextResponse.json({
      materials: materials.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        quantity: m.quantity,
        minQuantity: m.minQuantity,
        note: m.note,
        low: m.quantity < m.minQuantity,
        lastMove: m.moves[0] ?? null,
      })),
    });
  } catch (e) {
    return jsonError(e, "خطا در دریافت موجودی");
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const gate = await requireModuleAccess("warehouse");
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "عدد";
    const minQuantity = Number(body.minQuantity ?? 0);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!name) return jsonError(new Error("v"), "نام ماده الزامی است", 400);
    if (name.length > 80) return jsonError(new Error("v"), "نام ماده خیلی طولانی است", 400);
    if (!Number.isFinite(minQuantity) || minQuantity < 0) {
      return jsonError(new Error("v"), "حداقل موجودی نامعتبر است", 400);
    }
    const exists = await db.material.findFirst({ where: { name } });
    if (exists) return jsonError(new Error("dup"), "ماده‌ای با این نام موجود است", 409);

    const mat = await db.material.create({
      data: { name, unit, minQuantity, note: note || null },
    });
    return NextResponse.json({ material: mat, message: "مادهٔ اولیه ثبت شد" }, { status: 201 });
  } catch (e) {
    return jsonError(e, "خطا در ثبت مادهٔ اولیه");
  }
}
