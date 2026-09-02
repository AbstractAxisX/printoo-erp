import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// GET a single QC report by id (with order + customer + items)
// Phase 12: auth gate — قبلاً بدون احراز هویت بود.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const report = await db.qcReport.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      },
      reportedByUser: { select: { id: true, name: true } },
      reviewedByUser: { select: { id: true, name: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  return NextResponse.json({ report });
}

// QC review: approve (with returnStage) or reject
// Phase 12: auth + ماژول QC (یا مدیریت) + انتساب بررسی‌گر (reviewedById).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  if (user.role !== "master" && !user.modules.includes("qc") && !user.modules.includes("admin")) {
    return NextResponse.json(
      { error: "بررسی گزارش کنترل کیفیت مخصوص ماژول کنترل کیفی است" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { action, returnStage } = body; // action: "approve" | "reject"

    const report = await db.qcReport.findUnique({ where: { id }, include: { order: true } });
    if (!report) return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });

    if (action === "approve") {
      // Update QC report
      await db.qcReport.update({
        where: { id },
        data: {
          status: "approved",
          returnStage: returnStage || null,
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      });
      // Move order to the return stage
      const stageStatus: Record<string, string> = {
        design: "pending_design",
        print: "in_printing",
        warehouse: "warehouse_logistics",
      };
      const newStatus = stageStatus[returnStage || ""] ?? report.order.status;
      await db.order.update({
        where: { id: report.orderId },
        data: { status: newStatus },
      });
      // اعلان هدفمند به مسئوِ مرحله‌ای که سفارش به آن برگشت
      try {
        if (newStatus === "pending_design" && report.order.assignedDesignerId) {
          await db.notification.create({
            data: {
              userId: report.order.assignedDesignerId,
              title: "بازگشت سفارش به طراحی",
              message: `سفارش #${report.order.number} پس از تایید کنترل کیفیت به طراحی شما برگشت.`,
              type: "warning",
              link: "designer:orders",
            },
          });
        } else if (newStatus === "in_printing" && report.order.assignedPrinterId) {
          await db.notification.create({
            data: {
              userId: report.order.assignedPrinterId,
              title: "بازگشت سفارش به چاپ",
              message: `سفارش #${report.order.number} پس از تایید کنترل کیفیت به چاپ شما برگشت.`,
              type: "warning",
              link: "print:orders",
            },
          });
        }
      } catch {
        // best-effort
      }
      await db.notification.create({
        data: {
          title: "تایید کنترل کیفیت",
          message: `سفارش #${report.order.number} پس از بررسی کنترل کیفیت به مرحله ${returnStage || "نامشخص"} بازگشت.`,
          type: "success",
        },
      });
      return NextResponse.json({ ok: true, action: "approve" });
    }

    if (action === "reject") {
      await db.qcReport.update({
        where: { id },
        data: { status: "rejected", reviewedAt: new Date(), reviewedById: user.id },
      });
      return NextResponse.json({ ok: true, action: "reject" });
    }

    return NextResponse.json({ error: "action نامعتبر" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
