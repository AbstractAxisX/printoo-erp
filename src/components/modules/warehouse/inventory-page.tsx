"use client";

// ─── Phase 16: موجودی و مواد اولیهٔ انبار ──────────────────────────
// ساختار صفحه:
//   ۱) نوار KPI: تعداد مواد / کم‌موجودها (قرمز) / جمع اقلام
//   ۲) فرم اینلاین افزودن ماده (جمع‌وجور، بازشونده)
//   ۳) جدول مواد: موجودی (نوار پیشرفت برای کم‌موجودها)، حداقل، وضعیت،
//      آخرین گردش + اقدام‌های ورود/خروج (دیالوگ گردش) و ویرایش
//   ۴) بخش «گردش انبار» (بازشونده): ۱۰۰ گردش آخر + فیلتر ماده

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState } from "@/components/shared";
import { DataTable } from "@/components/ui/data-table";
import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

type Material = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  note: string | null;
  low: boolean;
  lastMove: { createdAt: string; delta: number; reason: string } | null;
};

type Move = {
  id: string;
  materialId: string;
  delta: number;
  reason: string;
  createdByName: string | null;
  createdAt: string;
  material: { id: string; name: string; unit: string };
};

const UNITS = ["عدد", "ورق", "بسته", "کیلوگرم", "لیتر", "متر", "رول"] as const;

const fa = (n: number) => n.toLocaleString("fa-IR");

// ─── Page ──────────────────────────────────────────────────────────────

export function InventoryPage() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();

  // فرم افزودن ماده
  const [addOpen, setAddOpen] = React.useState(false);
  const [newMat, setNewMat] = React.useState({ name: "", unit: "عدد", min: "", note: "" });

  // بخش گردش‌ها
  const [movesOpen, setMovesOpen] = React.useState(false);
  const [moveFilter, setMoveFilter] = React.useState("all");

  // دیالوگ ورود/خروج
  const [moveDlg, setMoveDlg] = React.useState<{ mat: Material; mode: "in" | "out" } | null>(null);
  const [moveQty, setMoveQty] = React.useState("");
  const [moveReason, setMoveReason] = React.useState("");

  // دیالوگ ویرایش
  const [editMat, setEditMat] = React.useState<Material | null>(null);
  const [editForm, setEditForm] = React.useState({ name: "", unit: "عدد", min: "", note: "" });

  // ── Queries ──
  const { data: matsData, isLoading: matsLoading } = useQuery({
    queryKey: ["materials", "list"],
    queryFn: () => api<{ materials: Material[] }>("/api/materials"),
    refetchInterval: 60_000,
  });
  const materials = matsData?.materials ?? [];

  const { data: movesData, isLoading: movesLoading } = useQuery({
    queryKey: ["materials", "moves"],
    queryFn: () => api<{ moves: Move[] }>("/api/materials/moves?limit=100"),
    enabled: movesOpen,
  });
  const moves = movesData?.moves ?? [];

  // ── KPI ──
  const totalMaterials = materials.length;
  const lowCount = materials.filter((m) => m.low).length;
  const totalQuantity = materials.reduce((s, m) => s + m.quantity, 0);

  // ── Mutations ──
  const addMut = useMutation({
    mutationFn: () =>
      api("/api/materials", {
        method: "POST",
        body: JSON.stringify({
          name: newMat.name.trim(),
          unit: newMat.unit,
          minQuantity: Number(newMat.min || 0) || 0,
          note: newMat.note.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success("مادهٔ اولیه ثبت شد");
      setNewMat({ name: "", unit: "عدد", min: "", note: "" });
      invalidate(["materials", "inventory", "warehouse"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: (args: { id: string; delta: number; reason: string }) =>
      api<{ message: string }>(`/api/materials/${args.id}/moves`, {
        method: "POST",
        body: JSON.stringify({ delta: args.delta, reason: args.reason }),
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "گردش ثبت شد");
      setMoveDlg(null);
      setMoveQty("");
      setMoveReason("");
      invalidate(["materials", "inventory", "warehouse"]);
      qc.invalidateQueries({ queryKey: ["materials", "moves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: () =>
      api(`/api/materials/${editMat?.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name.trim(),
          unit: editForm.unit,
          minQuantity: Number(editForm.min || 0) || 0,
          note: editForm.note.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success("ماده به‌روزرسانی شد");
      setEditMat(null);
      invalidate(["materials", "warehouse"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── اکشن‌های جدول ──
  const openMove = React.useCallback((m: Material, mode: "in" | "out") => {
    setMoveQty("");
    setMoveReason("");
    setMoveDlg({ mat: m, mode });
  }, []);

  const openEdit = React.useCallback((m: Material) => {
    setEditForm({ name: m.name, unit: m.unit, min: String(m.minQuantity), note: m.note ?? "" });
    setEditMat(m);
  }, []);

  // واحدهای ویرایش — اگر واحد ماده سفارشی باشد به لیست اضافه می‌شود
  const editUnitOptions = Array.from(new Set([...UNITS, ...(editMat ? [editMat.unit] : [])]));

  const moveQtyNum = Number(moveQty);
  const moveQtyValid = moveQty.trim() !== "" && Number.isFinite(moveQtyNum) && moveQtyNum > 0;
  const moveAfter =
    moveDlg && moveQtyValid
      ? moveDlg.mat.quantity + (moveDlg.mode === "in" ? moveQtyNum : -moveQtyNum)
      : null;
  const moveOutValid = moveDlg?.mode !== "out" || (moveAfter !== null && moveAfter >= 0);

  // ── Columns ──
  const columns = React.useMemo<ColumnDef<Material>[]>(
    () => [
      {
        id: "name",
        accessorFn: (m) => m.name,
        header: "نام ماده",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[180px]">{row.original.name}</div>
            {row.original.note && (
              <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                {row.original.note}
              </div>
            )}
          </div>
        ),
        enableSorting: true,
      },
      {
        id: "quantity",
        accessorFn: (m) => m.quantity,
        header: "موجودی",
        cell: ({ row }) => {
          const m = row.original;
          const target = Math.max(m.minQuantity * 2, 1);
          const pct = Math.min(100, Math.max(3, (m.quantity / target) * 100));
          return (
            <div className="min-w-[110px]">
              <div
                className={cn(
                  "text-sm font-bold tabular-nums",
                  m.low && "text-rose-600 dark:text-rose-400"
                )}
              >
                {fa(m.quantity)}{" "}
                <span className="text-[10px] font-medium text-muted-foreground">{m.unit}</span>
              </div>
              {m.low && (
                <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "min",
        accessorFn: (m) => m.minQuantity,
        header: "حداقل",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fa(row.original.minQuantity)} {row.original.unit}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: "state",
        accessorFn: (m) => (m.low ? 1 : 0),
        header: "وضعیت",
        cell: ({ row }) =>
          row.original.low ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <Icon name="alertTriangle" size={11} /> کم‌موجود
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Icon name="checkCircle" size={11} /> کافی
            </span>
          ),
        enableSorting: true,
      },
      {
        id: "lastMove",
        header: "آخرین گردش",
        cell: ({ row }) => {
          const lm = row.original.lastMove;
          if (!lm) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="text-[11px] min-w-0">
              <div className="truncate max-w-[140px]">{lm.reason}</div>
              <div className="text-muted-foreground">
                <span className={lm.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {lm.delta >= 0 ? "+" : "−"}
                  {fa(Math.abs(lm.delta))}
                </span>
                {" · "}
                <span>{relativeTime(lm.createdAt)}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { align: "center", hideable: false },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={(e) => {
                  e.stopPropagation();
                  openMove(m, "in");
                }}
              >
                <Icon name="plusCircle" size={12} /> ورود
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 gap-1 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                onClick={(e) => {
                  e.stopPropagation();
                  openMove(m, "out");
                }}
              >
                <Icon name="minus" size={12} /> خروج
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(m);
                }}
                title="ویرایش"
              >
                <Icon name="edit" size={13} />
              </Button>
            </div>
          );
        },
      },
    ],
    [openMove, openEdit]
  );

  // ── Columns گردش‌ها ──
  const moveColumns = React.useMemo<ColumnDef<Move>[]>(
    () => [
      {
        id: "material",
        accessorFn: (m) => m.material.name,
        header: "ماده",
        cell: ({ row }) => (
          <span className="text-sm font-medium truncate max-w-[160px] block">
            {row.original.material.name}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "type",
        accessorFn: (m) => (m.delta >= 0 ? 1 : 0),
        header: "نوع",
        cell: ({ row }) =>
          row.original.delta >= 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Icon name="plusCircle" size={11} /> ورود
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <Icon name="minus" size={11} /> خروج
            </span>
          ),
        enableSorting: false,
      },
      {
        id: "qty",
        accessorFn: (m) => Math.abs(m.delta),
        header: "مقدار",
        cell: ({ row }) => (
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              row.original.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            {row.original.delta >= 0 ? "+" : "−"}
            {fa(Math.abs(row.original.delta))}{" "}
            <span className="text-[10px] font-medium text-muted-foreground">
              {row.original.material.unit}
            </span>
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "reason",
        accessorFn: (m) => m.reason,
        header: "دلیل",
        cell: ({ row }) => (
          <span className="text-xs truncate block max-w-[180px]">{row.original.reason}</span>
        ),
        enableSorting: false,
      },
      {
        id: "by",
        accessorFn: (m) => m.createdByName ?? "",
        header: "ثبت‌کننده",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[110px]">
            {row.original.createdByName ?? "—"}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "createdAt",
        accessorFn: (m) => new Date(m.createdAt).getTime(),
        header: "تاریخ",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
        enableSorting: true,
      },
    ],
    []
  );

  const filteredMoves = React.useMemo(
    () => (moveFilter === "all" ? moves : moves.filter((m) => m.materialId === moveFilter)),
    [moves, moveFilter]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="موجودی و مواد"
        icon="boxes"
        description="موجودی مواد اولیهٔ انبار — ورود/خروج با تاریخ و دلیل"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => invalidate(["materials", "warehouse"])}
            title="به‌روزرسانی"
          >
            <Icon name="refresh" size={14} className={matsLoading ? "animate-spin" : ""} />
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3.5 ring-1 ring-primary/15">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon name="boxes" size={17} />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">{fa(totalMaterials)}</div>
              <div className="text-[11px] text-muted-foreground">تعداد مواد</div>
            </div>
          </div>
        </Card>
        <Card className={cn("p-3.5 ring-1", lowCount > 0 ? "ring-rose-500/25" : "ring-emerald-500/15")}>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "size-9 rounded-xl grid place-items-center shrink-0",
                lowCount > 0
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <Icon name={lowCount > 0 ? "alertTriangle" : "checkCircle"} size={17} />
            </div>
            <div>
              <div className={cn("text-xl font-bold tabular-nums", lowCount > 0 && "text-rose-600 dark:text-rose-400")}>
                {fa(lowCount)}
              </div>
              <div className="text-[11px] text-muted-foreground">کم‌موجودها</div>
            </div>
          </div>
        </Card>
        <Card className="p-3.5 ring-1 ring-violet-500/15">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center shrink-0">
              <Icon name="layers" size={17} />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">{fa(totalQuantity)}</div>
              <div className="text-[11px] text-muted-foreground">جمع اقلام (با واحدهای مختلف)</div>
            </div>
          </div>
        </Card>
      </div>

      {/* افزودن مادهٔ اولیه — فرم اینلاین */}
      <Card className="p-0 overflow-hidden">
        <Collapsible open={addOpen} onOpenChange={setAddOpen}>
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <Icon name="plusCircle" size={17} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">افزودن مادهٔ اولیه</h3>
                <p className="text-[11px] text-muted-foreground">
                  مثلاً کاغذ گلاسه، جوهر، فوم‌برد، نایلون…
                </p>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Icon name={addOpen ? "chevronUp" : "chevronDown"} size={14} />
                {addOpen ? "بستن" : "افزودن"}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="نام ماده" required>
                  <Input
                    value={newMat.name}
                    onChange={(e) => setNewMat((f) => ({ ...f, name: e.target.value }))}
                    placeholder="مثلاً کاغذ گلاسه ۱۳۵ گرم"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMat.name.trim() && !addMut.isPending)
                        addMut.mutate();
                    }}
                  />
                </Field>
                <Field label="واحد">
                  <Select
                    value={newMat.unit}
                    onValueChange={(v) => setNewMat((f) => ({ ...f, unit: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="حداقل موجودی">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    className="text-center"
                    value={newMat.min}
                    onChange={(e) => setNewMat((f) => ({ ...f, min: e.target.value }))}
                    placeholder="0"
                  />
                </Field>
                <Field label="یادداشت">
                  <Input
                    value={newMat.note}
                    onChange={(e) => setNewMat((f) => ({ ...f, note: e.target.value }))}
                    placeholder="اختیاری…"
                  />
                </Field>
              </div>
              <div className="flex justify-end mt-3">
                <Button
                  className="gap-2"
                  disabled={!newMat.name.trim() || addMut.isPending}
                  onClick={() => addMut.mutate()}
                >
                  <Icon
                    name={addMut.isPending ? "loading" : "plus"}
                    size={15}
                    className={addMut.isPending ? "animate-spin" : ""}
                  />
                  افزودن ماده
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* جدول مواد */}
      <Card className="p-4">
        <DataTable
          columns={columns}
          data={materials}
          isLoading={matsLoading}
          showColumnToggle={false}
          pageSize={15}
          emptyState={
            <EmptyState
              icon="boxes"
              title="ماده‌ای ثبت نشده"
              description="از فرم «افزودن مادهٔ اولیه» بالا، مواد انبار را تعریف کنید"
              action={
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={14} /> افزودن مادهٔ اولیه
                </Button>
              }
            />
          }
        />
      </Card>

      {/* گردش انبار */}
      <Card className="p-0 overflow-hidden">
        <Collapsible open={movesOpen} onOpenChange={setMovesOpen}>
          <div className="px-5 py-3.5 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center">
                <Icon name="route" size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">گردش انبار</h3>
                <p className="text-[11px] text-muted-foreground">
                  ۱۰۰ گردش آخر — ورود و خروج مواد با ثبت‌کننده
                </p>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Icon name={movesOpen ? "chevronUp" : "chevronDown"} size={14} />
                {movesOpen ? "بستن" : "نمایش"}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="p-4">
              <DataTable
                columns={moveColumns}
                data={filteredMoves}
                isLoading={movesLoading}
                pageSize={10}
                showColumnToggle={false}
                toolbar={
                  <Select value={moveFilter} onValueChange={setMoveFilter}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همهٔ مواد</SelectItem>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                emptyState={
                  <EmptyState
                    icon="route"
                    title="گردشی ثبت نشده"
                    description="با دکمه‌های ورود/خروج جدول بالا، گردش انبار ثبت کنید"
                  />
                }
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ── دیالوگ ورود/خروج ── */}
      <Dialog open={!!moveDlg} onOpenChange={(v) => !v && setMoveDlg(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm p-0 gap-0">
          {moveDlg && (
            <>
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-3">
                <div
                  className={cn(
                    "size-10 rounded-lg grid place-items-center shrink-0",
                    moveDlg.mode === "in"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}
                >
                  <Icon name={moveDlg.mode === "in" ? "plusCircle" : "minus"} size={18} />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">
                    {moveDlg.mode === "in" ? "ورود به انبار" : "خروج از انبار"} — {moveDlg.mat.name}
                  </DialogTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    موجودی فعلی: {fa(moveDlg.mat.quantity)} {moveDlg.mat.unit}
                  </p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <Field label="مقدار" required>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    className="text-center font-bold text-lg"
                    value={moveQty}
                    onChange={(e) => setMoveQty(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="دلیل">
                  <Input
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                    placeholder={moveDlg.mode === "in" ? "مثلاً خرید جدید…" : "مثلاً مصرف سفارش #۱۲…"}
                  />
                </Field>
                {moveQtyValid && moveAfter !== null && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs",
                      moveAfter < 0
                        ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                        : "bg-muted/30"
                    )}
                  >
                    موجودی بعد از ثبت:{" "}
                    <b className="tabular-nums">
                      {fa(moveAfter)} {moveDlg.mat.unit}
                    </b>
                    {moveAfter < 0 && " — موجودی کافی نیست"}
                  </div>
                )}
              </div>
              <div className="px-5 pb-4 flex items-center justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setMoveDlg(null)}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    moveDlg.mode === "in"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  )}
                  disabled={!moveQtyValid || !moveOutValid || moveMut.isPending}
                  onClick={() =>
                    moveMut.mutate({
                      id: moveDlg.mat.id,
                      delta: moveDlg.mode === "in" ? moveQtyNum : -moveQtyNum,
                      reason: moveReason.trim(),
                    })
                  }
                >
                  <Icon
                    name={moveMut.isPending ? "loading" : moveDlg.mode === "in" ? "plusCircle" : "minus"}
                    size={14}
                    className={moveMut.isPending ? "animate-spin" : ""}
                  />
                  {moveDlg.mode === "in" ? "ثبت ورود" : "ثبت خروج"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ ویرایش ماده ── */}
      <Dialog open={!!editMat} onOpenChange={(v) => !v && setEditMat(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm p-0 gap-0">
          {editMat && (
            <>
              <div className="px-5 pt-4 pb-3 border-b flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                  <Icon name="edit" size={18} />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">ویرایش ماده</DialogTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{editMat.name}</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <Field label="نام ماده" required>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="واحد">
                    <Select
                      value={editForm.unit}
                      onValueChange={(v) => setEditForm((f) => ({ ...f, unit: v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {editUnitOptions.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="حداقل موجودی">
                    <Input
                      type="number"
                      min={0}
                      dir="ltr"
                      className="text-center"
                      value={editForm.min}
                      onChange={(e) => setEditForm((f) => ({ ...f, min: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="یادداشت">
                  <Input
                    value={editForm.note}
                    onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="اختیاری…"
                  />
                </Field>
              </div>
              <div className="px-5 pb-4 flex items-center justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setEditMat(null)}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!editForm.name.trim() || editMut.isPending}
                  onClick={() => editMut.mutate()}
                >
                  <Icon
                    name={editMut.isPending ? "loading" : "check"}
                    size={14}
                    className={editMut.isPending ? "animate-spin" : ""}
                  />
                  ذخیره
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
