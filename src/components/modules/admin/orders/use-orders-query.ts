"use client";

// Printoo24 ERP — Orders data hook (Phase 3 atomic split)
//
// Single hook for the All-Orders page data: orders (filtered by selected
// customer/product on the server), plus the customer & product picklists.
// Typed, error-safe, and React-Query keyed so useInvalidate(["orders"]) hits
// all derived queries.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Order } from "./types";

type CustomerLite = { id: string; name: string; phone: string };
type ProductLite = { id: string; name: string };

export type UseOrdersQueryArgs = {
  customerId: string | null;
  productId: string | null;
  excludeArchived?: boolean;
};

export function useOrdersQuery({
  customerId,
  productId,
  excludeArchived,
}: UseOrdersQueryArgs) {
  const ordersQ = useQuery({
    queryKey: ["orders", customerId, productId, excludeArchived ?? false],
    queryFn: () => {
      const params = new URLSearchParams();
      if (customerId) params.set("customerId", customerId);
      if (productId) params.set("productId", productId);
      if (excludeArchived) params.set("excludeArchived", "true");
      const qs = params.toString();
      return api<{ orders: Order[] }>(`/api/orders${qs ? `?${qs}` : ""}`);
    },
    select: (d) => d.orders,
  });

  const customersQ = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api<{ customers: CustomerLite[] }>("/api/customers"),
    select: (d) => d.customers,
  });

  const productsQ = useQuery({
    queryKey: ["products-list"],
    queryFn: () => api<{ products: ProductLite[] }>("/api/products"),
    select: (d) => d.products,
  });

  return {
    orders: ordersQ.data ?? [],
    customers: customersQ.data ?? [],
    products: productsQ.data ?? [],
    isLoading: ordersQ.isLoading,
    isError: ordersQ.isError,
    error: ordersQ.error,
    refetch: ordersQ.refetch,
  };
}
