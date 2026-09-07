"use client";

// ─── Phase 16: داشبورد انبار و لجستیک ─────────────────────────────
// الگوی داشبورد چاپ/مالی: ۶ کارت KPI کلیک‌شون (کلیک → صفحهٔ بسته‌ها با
// همان فیلتر وضعیت — boardFilter)، کارت مواد کم‌موجود (با نوار پیشرفت)
// و اقدام‌های سریع روزمرهٔ انبار.
// داده: GET /api/warehouse/stats (هر ۳۰ ثانیه).

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

// ─── Types ─────────────────────────────────────────────────────────────

type Stats = {
  pendingPackItems: number;
  packagesPacking: number;
  packagesReady: number;
  packagesSent: number;
  deliveredToday: number;
  codMonth: number;
  inWarehouseOrders: number;
  lowStock: {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    minQuantity: number;
  }[];
};

const fa = (n: number) => n.toLocaleString("fa-IR");

// ─── KPI card (سبک داشبورد مالی — کلیک‌شون) ──────────────────────────

type KpiColor = "amber" | "rose" | "emerald" | "violet" | "teal";

const KPI_COLORS: Record<KpiColor, { bg: string; text: string; ring: string; hoverRing: string }> = {
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20", hoverRing: "hover:ring-amber-500/50" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20", hoverRing: "hover:ring-rose-500/50" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20", hoverRing: "hover:ring-emerald-500/50" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20", hoverRing: "hover:ring-violet-500/50" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20", hoverRing: "hover:ring-teal-500/50" },
};

type KpiDef = {
  key: string;
  icon: IconName;
  label: string;
  value: number;
  hint: string;
  color: KpiColor;
  isAmount?: boolean;
  onClick?: () => void;
};

function KpiCard({ def }: { def: KpiDef }) {
  const c = KPI_COLORS[def.color];
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={def.onClick}
      onKeyDown={(e) => {
        if (def.onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          def.onClick();
        }
      }}
      className={cn(
        "p-4 ring-1 transition group",
        c.ring,
        def.onClick &&
          cn("cursor-pointer hover:shadow-md hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2", c.hoverRing)
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("size-10 rounded-xl grid place-items-center shrink-0", c.bg, c.text)}>
          <Icon name={def.icon} size={19} />
        </div>
        {def.onClick && (
          <Icon
            name="arrowLeft"
            size={15}
            className="text-muted-foreground/40 group-hover:text-foreground group-hover:-translate-x-0.5 transition"
          />
        )}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-2.5" dir={def.isAmount ? "ltr" : undefined}>
        {def.isAmount ? formatCurrency(def.value) : fa(def.value)}
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{def.label}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t">{def.hint}</div>
    </Card>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────

export function WarehouseDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["warehouse", "stats"],
    queryFn: () => api<Stats>("/api/warehouse/stats"),
    refetchInterval: 30_000,
  });

  const s: Partial<Stats> = data ?? {};
  const lowStock = s.lowStock ?? [];

  // کلیک روی کارت → صفحهٔ بسته‌ها با همان فیلتر وضعیت
  const goPackages = (status: string) => {
    setBoardFilter("warehouse", status);
    navigate("warehouse", "packages");
  };

  const kpis: KpiDef[] = [
    {
      key: "pending",
      icon: "packageReceive",
      label: "منتظر بسته‌بندی",
      value: s.pendingPackItems ?? 0,
      hint: `${fa(s.inWarehouseOrders ?? 0)} سفارش در مرحلهٔ انبار`,
      color: "amber",
      onClick: () => goPackages("all"),
    },
    {
      key: "packing",
      icon: "package",
      label: "در حال بسته‌بندی",
      value: s.packagesPacking ?? 0,
      hint: "بسته‌های باز و در جریان",
      color: "amber",
      onClick: () => goPackages("packing"),
    },
    {
      key: "ready",
      icon: "packageAdd",
      label: "آمادهٔ ارسال",
      value: s.packagesReady ?? 0,
      hint: "بج خورده و آمادهٔ پیک",
      color: "teal",
      onClick: () => goPackages("ready"),
    },
    {
      key: "sent",
      icon: "truckDelivery",
      label: "در راه",
      value: s.packagesSent ?? 0,
      hint: "تحویل به پیک — در مسیر",
      color: "violet",
      onClick: () => goPackages("sent"),
    },
    {
      key: "delivered",
      icon: "packageDelivered",
      label: "تحویل امروز",
      value: s.deliveredToday ?? 0,
      hint: "بسته‌های تحویل‌شدهٔ امروز",
      color: "emerald",
      onClick: () => goPackages("delivered"),
    },
    {
      key: "cod",
      icon: "money",
      label: "درآمد لجستیک ماه",
      value: s.codMonth ?? 0,
      isAmount: true,
      hint: "پول در محل — ثبت‌شدهٔ این ماه",
      color: "rose",
      onClick: () => navigate("warehouse", "orders"),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="داشبورد انبار و لجستیک"
        description="دریافت کالا از چاپ → بسته‌بندی و بج QR → ارسال → تحویل — روی کارت‌ها کلیک کنید تا فیلترشده ببینید"
        icon="warehouse"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setBoardFilter("warehouse", null);
                navigate("warehouse", "packages");
              }}
            >
              <Icon name="packageAdd" size={14} />
              بسته جدید
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("warehouse", "orders")}
            >
              <Icon name="truck" size={14} />
              سفارشات تحویل
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["warehouse"] })}
              title="به‌روزرسانی"
            >
              <Icon name="refresh" size={14} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.key} def={k} />
        ))}
      </div>

      {/* مواد کم‌موجود */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Icon name="alertTriangle" size={18} className="text-rose-500" />
            <h3 className="font-semibold text-sm">مواد کم‌موجود</h3>
            <span className="text-[11px] text-muted-foreground">
              ({fa(lowStock.length)} مورد)
            </span>
          </div>
          <button
            onClick={() => navigate("warehouse", "inventory")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            موجودی و مواد <Icon name="arrowLeft" size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Icon name="loading" size={16} className="animate-spin" />
            در حال بارگذاری...
          </div>
        ) : lowStock.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="مواد کم‌موجود نیست"
            description="موجودی همهٔ مواد بالای حداقل تعریف‌شده است"
          />
        ) : (
          <div className="divide-y max-h-[420px] overflow-y-auto scrollbar-thin">
            {lowStock.map((m) => {
              const pct = Math.min(100, (m.quantity / Math.max(m.minQuantity, 1)) * 100);
              return (
                <button
                  key={m.id}
                  onClick={() => navigate("warehouse", "inventory")}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition text-right"
                >
                  <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 grid place-items-center shrink-0">
                    <Icon name="boxes" size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.name}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    <div className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {fa(m.quantity)} از {fa(m.minQuantity)} {m.unit}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {m.quantity <= 0 ? "ناموجود" : "زیر حداقل موجودی"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
