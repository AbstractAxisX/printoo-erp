// Printoo24 ERP — SRM module shared types

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  balanceDue: number;
  note: string | null;
  subcategoryId: string | null;
  createdAt?: string;
  subcategory: {
    id: string;
    name: string;
    category: { id: string; name: string };
  } | null;
  _count?: { services: number; materialCosts: number };
};

export type SupplierCategory = {
  id: string;
  name: string;
  icon: string | null;
  createdAt?: string;
  subcategories: {
    id: string;
    name: string;
    _count: { suppliers: number; services: number };
  }[];
  _count: { subcategories: number };
};

export type SupplierSubcategory = {
  id: string;
  name: string;
  categoryId: string;
  category?: { id: string; name: string };
  _count?: { suppliers: number; services: number };
};

export type PriceListEntry = {
  id: string;
  price: number;
  minQuantity: number;
  note: string | null;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  service: { id: string; name: string; supplier: { id: string; name: string } };
};

export type SupplierService = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  supplierId: string;
  subcategoryId: string | null;
  createdAt?: string;
  supplier: { id: string; name: string };
  subcategory: {
    id: string;
    name: string;
    category: { id: string; name: string };
  } | null;
  priceLists?: PriceListEntry[];
};

export type MaterialCost = {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  module: string;
  description: string | null;
  createdAt: string;
  supplier: { name: string } | null;
  expenseType: { name: string } | null;
  order: { id: string; number: number; customer: { name: string } } | null;
};

export type SupplierDetail = {
  id: string;
  name: string;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  balanceDue: number;
  note: string | null;
  subcategoryId: string | null;
  createdAt: string;
  subcategory: { id: string; name: string; category: { id: string; name: string } } | null;
  services: SupplierService[];
  materialCosts: MaterialCost[];
  _count: { services: number; materialCosts: number };
};

export type PriceComparison = {
  name: string;
  suppliers: {
    id: string;
    name: string;
    price: number | null;
    serviceId: string;
  }[];
  minPrice: number | null;
  maxPrice: number | null;
};
