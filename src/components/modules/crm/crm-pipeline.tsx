"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import { useInvalidate } from "@/lib/use-invalidate";
import { PageHeader, EmptyState, LoadingState } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, daysRemaining } from "@/lib/format";
import { toast } from "sonner";
import { DealFormDialog } from "./deal-form-dialog";
import {
  type Deal,
  type DealStage,
  DEAL_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  DEFAULT_PROBABILITY,
} from "./crm-types";

type CustomerOption = { id: string; name: string; phone: string };

export function CRMPipeline() {
  const invalidate = useInvalidate();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<Deal | null>(null);
  const [defaultStage, setDefaultStage] = React.useState<DealStage>("lead");
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data: dealsData, isLoading } = useQuery({
    queryKey: ["deals", "pipeline"],
    queryFn: () => api<{ deals: Deal[] }>("/api/deals"),
    refetchInterval: 30000,
  });
  const { data: customersData } = useQuery({
    queryKey: ["customers", "crm-pipeline"],
    queryFn: () => api<{ customers: CustomerOption[] }>("/api/customers"),
    refetchInterval: 60000,
  });

  const deals = dealsData?.deals ?? [];
  const customers = customersData?.customers ?? [];

  const grouped: Record<DealStage, Deal[]> = React.useMemo(() => {
    const m: Record<DealStage, Deal[]> = {
      lead: [],
      qualified: [],
      proposal: [],
      negotiation: [],
      won: [],
      lost: [],
    };
    for (const d of deals) {
      if (DEAL_STAGES.includes(d.stage)) m[d.stage].push(d);
    }
    return m;
  }, [deals]);

  const activeDeal = React.useMemo(
    () => deals.find((d) => d.id === activeId) ?? null,
    [deals, activeId]
  );

  const updateStageMut = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      return api(`/api/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage, probability: DEFAULT_PROBABILITY[stage] }),
      });
    },
    onSuccess: (_data, vars) => {
      invalidate(["deals", "crm-dashboard", "customers"]);
      toast.success(`معامله به «${STAGE_LABELS[vars.stage]}» منتقل شد`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const newStage = String(over.id) as DealStage;
    if (!DEAL_STAGES.includes(newStage)) return;
    const deal = deals.find((d) => d.id === String(active.id));
    if (!deal) return;
    if (deal.stage === newStage) return;
    updateStageMut.mutate({ id: deal.id, stage: newStage });
  }

  function openNew(stage: DealStage = "lead") {
    setEditingDeal(null);
    setDefaultStage(stage);
    setDialogOpen(true);
  }
  function openEdit(deal: Deal) {
    setEditingDeal(deal);
    setDefaultStage(deal.stage);
    setDialogOpen(true);
  }

  if (isLoading && !dealsData) {
    return (
      <div className="space-y-5">
        <PageHeader title="قیف فروش" description="مدیریت معاملات با نمای کانبان" icon="layers" />
        <LoadingState label="در حال بارگذاری قیف فروش..." />
      </div>
    );
  }

  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="قیف فروش"
        description={`مجموع ${deals.length} معامله • ${formatCurrency(totalValue)}`}
        icon="layers"
        actions={
          <Button onClick={() => openNew("lead")} className="gap-2">
            <Icon name="plus" size={16} /> معامله جدید
          </Button>
        }
      />

      {deals.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon="layers"
            title="قیف فروش خالی است"
            description="اولین معامله خود را ایجاد کنید تا قیف فروش شکل بگیرد"
            action={
              <Button onClick={() => openNew("lead")} className="gap-2">
                <Icon name="plus" size={16} /> ایجاد معامله
              </Button>
            }
          />
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ minWidth: "min-content" }}>
            {DEAL_STAGES.map((stage) => {
              const items = grouped[stage];
              const total = items.reduce((s, d) => s + (d.value || 0), 0);
              const colors = STAGE_COLORS[stage];
              return (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  items={items}
                  total={total}
                  onAdd={() => openNew(stage)}
                  onCardClick={(d) => openEdit(d)}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeDeal ? (
              <DealCard deal={activeDeal} dragging onClick={() => {}} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <DealFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deal={editingDeal}
        customers={customers}
        defaultStage={defaultStage}
      />

      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center pt-1">
        <Icon name="refresh" size={11} />
        به‌روزرسانی خودکار هر ۳۰ ثانیه • کارت‌ها را بکشید تا بین مراحل جابجا شوند
      </div>
    </div>
  );
}

function PipelineColumn({
  stage,
  items,
  total,
  onAdd,
  onCardClick,
}: {
  stage: DealStage;
  items: Deal[];
  total: number;
  onAdd: () => void;
  onCardClick: (d: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const colors = STAGE_COLORS[stage];
  return (
    <div className="flex flex-col w-[280px] shrink-0">
      <div className={cn("rounded-t-lg border-b", colors.bg, colors.border)}>
        <div className="px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", colors.dot)} />
            <span className={cn("text-sm font-semibold", colors.text)}>{STAGE_LABELS[stage]}</span>
            <span className="text-xs text-muted-foreground tabular-nums">({items.length})</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onAdd}
            title="افزودن معامله به این مرحله"
          >
            <Icon name="plus" size={14} />
          </Button>
        </div>
        <div className="px-3 pb-2 text-[11px] text-muted-foreground tabular-nums" dir="ltr">
          {formatCurrency(total)}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-b-lg border-x border-b bg-muted/20 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-260px)] overflow-y-auto transition-colors",
          colors.border,
          isOver && "bg-primary/5"
        )}
      >
        {items.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            <Icon name="inbox" size={20} className="mx-auto mb-1 opacity-40" />
            خالی
          </div>
        ) : (
          items.map((d) => (
            <DraggableDealCard key={d.id} deal={d} onClick={() => onCardClick(d)} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableDealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });
  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <DealCard deal={deal} onClick={onClick} />
    </div>
  );
}

function DealCard({
  deal,
  dragging,
  onClick,
}: {
  deal: Deal;
  dragging?: boolean;
  onClick: () => void;
}) {
  const dr = daysRemaining(deal.expectedCloseDate);
  const colors = STAGE_COLORS[deal.stage];
  return (
    <div
      onClick={(e) => {
        if (dragging) return;
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-all group",
        dragging && "shadow-lg ring-2 ring-primary",
        !dragging && "hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold leading-tight line-clamp-2 flex-1">{deal.title}</h4>
        <div
          className={cn("size-2 rounded-full shrink-0 mt-1", colors.dot)}
          title={`احتمال: ${deal.probability}%`}
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Icon name="customers" size={12} />
        <span className="truncate">{deal.customer.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold tabular-nums" dir="ltr">
          {formatCurrency(deal.value)}
        </div>
        <div className="flex items-center gap-1">
          {deal.probability > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium tabular-nums">
              {deal.probability}%
            </span>
          )}
          {deal.expectedCloseDate && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                dr.status === "today" && "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
                dr.status === "overdue" && "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
                dr.status === "remaining" && "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
                dr.status === "none" && "bg-muted text-muted-foreground"
              )}
              title={formatDate(deal.expectedCloseDate)}
            >
              <Icon name="calendar" size={9} />
              {dr.status === "today"
                ? "امروز"
                : dr.status === "overdue"
                ? "گذشته"
                : dr.status === "remaining"
                ? `${dr.days} روز`
                : "—"}
            </span>
          )}
        </div>
      </div>
      {deal._count?.activities ? (
        <div className="mt-2 pt-2 border-t flex items-center gap-1 text-[10px] text-muted-foreground">
          <Icon name="task" size={10} />
          {deal._count.activities} فعالیت ثبت شده
        </div>
      ) : null}
    </div>
  );
}
