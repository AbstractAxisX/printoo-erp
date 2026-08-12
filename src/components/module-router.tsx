"use client";

import * as React from "react";
import { useAppStore } from "@/stores/app-store";
import { findModule } from "@/lib/nav";
import { PageHeader, EmptyState } from "@/components/shared";
import { Icon } from "@/lib/icons";

// Admin pages
import { AdminDashboard } from "@/components/modules/admin/admin-dashboard";
import { OrdersPage } from "@/components/modules/admin/orders/orders-page";
import { OrderWizardPage } from "@/components/modules/admin/orders/order-wizard-page";
import { OpenOrdersPage } from "@/components/modules/admin/open-orders";
import { TasksPage } from "@/components/modules/admin/tasks-page";
import { CalendarPage } from "@/components/modules/admin/calendar-page";
import { CustomersPage } from "@/components/modules/admin/customers-page";
import { SuppliersPage } from "@/components/modules/admin/suppliers-page";
import { ProductsPage } from "@/components/modules/admin/products-page";
import { ArchivePage } from "@/components/modules/admin/archive-page";

// Generic module page for designer/print/warehouse/finance/qc/crm/srm
import { GenericModulePage } from "@/components/modules/generic-module-page";

export function ModuleRouter() {
  const moduleKey = useAppStore((s) => s.module);
  const page = useAppStore((s) => s.page);
  const mod = findModule(moduleKey);

  if (moduleKey === "admin") {
    switch (page) {
      case "dashboard": return <AdminDashboard />;
      case "orders": return <OrdersPage />;
      case "orders-new": return <OrderWizardPage />;
      case "open-orders": return <OpenOrdersPage />;
      case "tasks": return <TasksPage />;
      case "calendar": return <CalendarPage />;
      case "customers": return <CustomersPage />;
      case "suppliers": return <SuppliersPage />;
      case "products": return <ProductsPage />;
      case "archive": return <ArchivePage />;
      default:
        return (
          <PlaceholderPage title={pageTitle(mod, page)} />
        );
    }
  }

  // other modules
  return <GenericModulePage moduleKey={module} page={page} />;
}

function pageTitle(mod: ReturnType<typeof findModule>, page: string) {
  for (const g of mod.groups) {
    const item = g.items.find((i) => i.page === page);
    if (item) return item.label;
  }
  return page;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} icon="grid" />
      <EmptyState
        icon="tool"
        title="این صفحه به‌زودی فعال می‌شود"
        description="این بخش در دست توسعه است و به‌زودی کامل خواهد شد."
      />
    </div>
  );
}
