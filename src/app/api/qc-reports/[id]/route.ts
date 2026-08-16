import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET a single QC report by id (with order + customer + items)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    },
  });
  if (!report) return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  return NextResponse.json({ report });
}

// QC review: approve (with returnStage) or reject
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        data: { status: "approved", returnStage: returnStage || null, reviewedAt: new Date() },
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
      await db.notification.create({
        data: {
          title: "تایید کنترل کیفیت",
          message: `سفارش پس از بررسی کنترل کیفیت به مرحله ${returnStage || "نامشخص"} بازگشت.`,
          type: "success",
        },
      });
      return NextResponse.json({ ok: true, action: "approve" });
    }

    if (action === "reject") {
      await db.qcReport.update({
        where: { id },
        data: { status: "rejected", reviewedAt: new Date() },
      });
      return NextResponse.json({ ok: true, action: "reject" });
    }

    return NextResponse.json({ error: "action نامعتبر" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "خطا" }, { status: 500 });
  }
}
