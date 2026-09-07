"use client";

// ─── Phase 15: داشبورد مالی — بازطراحی کامل ─────────────────────────
// ساختار (تحلیل وظیفه‌محور واحد مالی):
//   ۱) اوورویو: ۵ کارت فیلتردار (فیلتر سراسری زمان — هزینه و درآمد با هم):
//      هزینه‌های در انتظار تأیید • مجموع هزینه‌ها • مجموع درآمدها •
//      سود خالص • تسویه‌نشده (بستانکار) — هر کارت کلیک‌پذیر → لیست فیلترشده
//   ۲) فرم ثبت هزینه جدید (دو حالت: روی سفارش / آزاد) — اینلاین، عین
//      افزودن آیتم ویزارد؛ حالت سفارش: سرچ سفارش + «ثبت در فاکتور»
//   ۳) دسته‌بندی هزینه‌های آزاد: کارتِ هر دسته (Σ در بازه + تعداد) +
//      مدیریت دسته‌ها (حقوق هاردکد-پیش‌فرض) + دکمهٔ تاریخچه هزینه‌ها

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader } from "@/components/shared";
import { Icon, type IconName } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeRangePicker } from "@/components/ui/time-range-picker";
import { CostEntryForm } from "@/components/shared/cost-entry-form";
import { getPreset, type TimeRange } from "@/lib/time-ranges";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

type Summary = {
  pendingCount: number;
  pendingSum: number;
  costSum: number;
  revenueSum: number;
  netProfit: number;
  unsettledSum: number;
  unsettledCount: number;
  freeByCategory: { id: string | null; name: string; sum: number; count: number }[];
  costsByModule: { module: string; sum: number; count: number }[];
};

type ExpenseType = { id: string; name: string; isDefault: boolean };

// ─── KPI card ──────────────────────────────────────────────────────────

type KpiDef = {
  key: string;
  label: string;
  icon: IconName;
  color: "amber" | "rose" | "emerald" | "violet" | "teal";
  value: number;
  hint: string;
  isAmount?: boolean;
  onClick?: () => void;
};

const KPI_COLORS: Record<
  KpiDef["color"],
  { bg: string; text: string; ring: string }
> = {
  amber: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/20" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/20" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/20" },
};

function KpiCard({ def, rangeLabel }: { def: KpiDef; rangeLabel: string }) {
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
        def.onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2"
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
      <div className="text-2xl font-bold tabular-nums mt-2.5" dir="ltr">
        {def.isAmount ? formatCurrency(def.value) : def.value.toLocaleString("fa-IR")}
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{def.label}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t">
        {def.hint} • {rangeLabel}
      </div>
    </Card>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────

export function FinanceDashboard() {
  const navigate = useAppStore((s) => s.navigate);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // فیلتر سراسری زمان — هزینه و درآمد با هم فیلتر می‌شوند
  const [range, setRange] = React.useState<TimeRange>(() => getPreset("this-month"));
  const rangeLabel = range.label;

  // حالت فرم: روی سفارش / آزاد
  const [costMode, setCostMode] = React.useState<"order" | "free">("order");
  const [showCatManage, setShowCatManage] = React.useState(false);
  const [newCategory, setNewCategory] = React.useState("");

  const { data: summary, isLoading } = useQuery({
    queryKey: ["finance", "summary", range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      api<Summary>(`/api/finance/summary?from=${range.from.toISOString()}&to=${range.to.toISOString()}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: typesData, refetch: refetchTypes } = useQuery({
    queryKey: ["expense-types"],
    queryFn: () => api<{ expenseTypes: ExpenseType[] }>("/api/expense-types"),
    staleTime: 60_000,
  });

  const s: Partial<Summary> = summary ?? {};

  const kpis: KpiDef[] = [
    {
      key: "pending",
      label: "هزینه‌های در انتظار تأیید",
      icon: "clock",
      color: "amber",
      value: s.pendingCount ?? 0,
      hint: `Σ ${formatCurrency(s.pendingSum ?? 0)}`,
      onClick: () => {
        setBoardFilter("finance", "pending");
        navigate("finance", "costs");
      },
    },
    {
      key: "costs",
      label: "مجموع هزینه‌ها",
      icon: "money",
      color: "rose",
      value: s.costSum ?? 0,
      isAmount: true,
      hint: "هزینه‌های تأییدشده",
      onClick: () => {
        setBoardFilter("finance", "all-costs");
        navigate("finance", "costs");
      },
    },
    {
      key: "revenue",
      label: "مجموع درآمدها",
      icon: "trending",
      color: "emerald",
      value: s.revenueSum ?? 0,
      isAmount: true,
      hint: "دریافتی‌های مشتریان",
      onClick: () => navigate("finance", "revenues"),
    },
    {
      key: "profit",
      label: "سود خالص",
      icon: "chartColumn",
      color: "teal",
      value: s.netProfit ?? 0,
      isAmount: true,
      hint: "درآمد − هزینه",
    },
    {
      key: "unsettled",
      label: "تسویه‌نشده (بستانکار)",
      icon: "wallet",
      color: "violet",
      value: s.unsettledSum ?? 0,
      isAmount: true,
      hint: `${(s.unsettledCount ?? 0).toLocaleString("fa-IR")} سفارش با مانده`,
      onClick: () => navigate("finance", "unsettled"),
    },
  ];

  // دسته‌ها: merge لیست کامل + آمار بازه (دسته‌های بدون هزینه هم دیده شوند)
  const categories = React.useMemo(() => {
    const all = typesData?.expenseTypes ?? [];
    const stats = new Map((s.freeByCategory ?? []).map((f) => [f.id ?? "", f]));
    return all.map((t) => ({
      ...t,
      sum: stats.get(t.id)?.sum ?? 0,
      count: stats.get(t.id)?.count ?? 0,
    }));
  }, [typesData, s.freeByCategory]);

  // ── دستهٔ جدید ──
  const addCategoryMut = useMutation({
    mutationFn: (name: string) =>
      api("/api/expense-types", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      toast.success("دستهٔ هزینه اضافه شد");
      setNewCategory("");
      refetchTypes();
      invalidate(["finance", "expense-types"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── حذف دسته (غیرپیش‌فرض) ──
  const deleteCategoryMut = useMutation({
    mutationFn: (id: string) => api(`/api/expense-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("دسته حذف شد");
      refetchTypes();
      invalidate(["finance", "expense-types"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {/* Header + فیلتر سراسری */}
      <PageHeader title="داشبورد مالی" icon="wallet" actions={
        <div className="flex items-center gap-2">
          <TimeRangePicker value={range} onChange={setRange} compact />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => qc.invalidateQueries({ queryKey: ["finance"] })}
            title="به‌روزرسانی"
          >
            <Icon name="refresh" size={14} className={isLoading ? "animate-spin" : ""} />
          </Button>
        </div>
      } />

      {/* اوورویو — ۵ کارت فیلتردار */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.key} def={k} rangeLabel={rangeLabel} />
        ))}
      </div>

      {/* ثبت هزینه جدید — دو حالت */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Icon name="plusCircle" size={17} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">ثبت هزینه جدید</h3>
              <p className="text-[11px] text-muted-foreground">
                {costMode === "order"
                  ? "هزینه روی سفارش — با گزینهٔ نشستن در فاکتور"
                  : "هزینهٔ آزاد — کرایه، حقوق و هزینه‌های جاری بدون سفارش"}
              </p>
            </div>
          </div>
          {/* سوییچ حالت */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1" role="radiogroup" aria-label="نوع هزینه">
            <button
              role="radio"
              aria-checked={costMode === "order"}
              onClick={() => setCostMode("order")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                costMode === "order"
                  ? "bg-background text-foreground shadow-sm border"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              <Icon name="orders" size={13} />
              روی سفارش
            </button>
            <button
              role="radio"
              aria-checked={costMode === "free"}
              onClick={() => setCostMode("free")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                costMode === "free"
                  ? "bg-background text-foreground shadow-sm border"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              <Icon name="coins" size={13} />
              هزینهٔ آزاد
            </button>
          </div>
        </div>
        <div className="p-4">
          <CostEntryForm
            key={costMode}
            mode={costMode}
            selectableOrder={costMode === "order"}
            showInvoiceOption={costMode === "order"}
            fixedModule={costMode === "free" ? "finance" : undefined}
            showSupplier={costMode === "order"}
            onManageCategories={costMode === "free" ? () => setShowCatManage((v) => !v) : undefined}
            onSubmitted={() => {
              invalidate(["finance", "material-costs"]);
              qc.invalidateQueries({ queryKey: ["orders", "cost-form"] });
            }}
          />
        </div>
      </Card>

      {/* دسته‌بندی هزینه‌های آزاد + مدیریت */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 grid place-items-center">
              <Icon name="grid" size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">دسته‌بندی هزینه‌های آزاد</h3>
              <p className="text-[11px] text-muted-foreground">
                جمع هر دسته در بازهٔ {rangeLabel} — حقوق پیش‌فرض سیستم است
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCatManage((v) => !v)}
            >
              <Icon name={showCatManage ? "arrowUp" : "gear"} size={14} />
              {showCatManage ? "بستن مدیریت" : "مدیریت دسته‌ها"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setBoardFilter("finance", "free");
                navigate("finance", "costs");
              }}
            >
              <Icon name="checkList" size={14} />
              تاریخچه هزینه‌ها
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* کارت دسته‌ها */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((cat) => (
              <Card
                key={cat.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setBoardFilter("finance", `free:${cat.id}`);
                  navigate("finance", "costs");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setBoardFilter("finance", `free:${cat.id}`);
                    navigate("finance", "costs");
                  }
                }}
                className={cn(
                  "p-3.5 ring-1 ring-teal-500/15 cursor-pointer hover:shadow-md hover:scale-[1.01] transition group",
                  cat.isDefault && "ring-primary/25"
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold truncate">{cat.name}</span>
                  {cat.isDefault ? (
                    <span
                      className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0"
                      title="دستهٔ پیش‌فرض سیستم — قابل حذف نیست"
                    >
                      پیش‌فرض
                    </span>
                  ) : showCatManage ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCategoryMut.mutate(cat.id);
                      }}
                      disabled={deleteCategoryMut.isPending}
                      className="text-muted-foreground hover:text-rose-600 transition shrink-0"
                      title="حذف دسته"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  ) : null}
                </div>
                <div className="text-lg font-bold tabular-nums mt-2" dir="ltr">
                  {formatCurrency(cat.sum)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {cat.count.toLocaleString("fa-IR")} ثبت در {rangeLabel}
                </div>
              </Card>
            ))}
            {categories.length === 0 && (
              <div className="col-span-full text-xs text-muted-foreground text-center py-4">
                دسته‌ای یافت نشد
              </div>
            )}
          </div>

          {/* مدیریت دسته‌ها — افزودن */}
          {showCatManage && (
            <div className="rounded-xl border bg-muted/20 p-3 flex items-center gap-2 flex-wrap">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="نام دستهٔ جدید… مثلاً تبلیغات"
                className="w-64"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategory.trim()) addCategoryMut.mutate(newCategory.trim());
                }}
              />
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!newCategory.trim() || addCategoryMut.isPending}
                onClick={() => addCategoryMut.mutate(newCategory.trim())}
              >
                <Icon name={addCategoryMut.isPending ? "loading" : "plus"} size={14} className={addCategoryMut.isPending ? "animate-spin" : ""} />
                افزودن دسته
              </Button>
              <span className="text-[11px] text-muted-foreground">
                دسته‌های پیش‌فرض (حقوق، اجاره و…) قابل حذف نیستند — «حقوق» از سیستم
                حقوق‌ودستمزد تغذیه می‌شود
              </span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
