export type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
  note?: string | null;
  email?: string | null;
};

export type Location = {
  id: string;
  name: string;
  kind: 'STORAGE' | 'PREP';
  isActive: boolean;
};

export type Ingredient = {
  id: string;
  sku: string;
  name: string;
  unit: 'GRAM' | 'MILLILITER' | 'EACH';
  isActive: boolean;
  lowStockQuantity?: number | null;
};

export type Lot = {
  id: string;
  code: string;
  expiresAt?: string | null;
  receivedAt: string;
  unitCost: number;
};

export type StockRow = {
  ingredient: Ingredient;
  location: Location;
  lot: Lot | null;
  quantity: number;
};

export type LedgerRow = {
  id: string;
  type: string;
  quantity: number;
  occurredAt: string;
  note?: string | null;
  ingredient: Ingredient;
  location: Location;
  lot?: Lot | null;
};

export type Product = {
  id: string;
  name: string;
};

export type Recipe = {
  id: string;
  version: number;
  isActive: boolean;
  product: Product;
  lines: Array<{
    id: string;
    quantity: number;
    ingredient: Ingredient;
  }>;
};

export type InventoryAlerts = {
  lowStock: Array<{
    ingredient: Ingredient;
    quantity: number;
    threshold: number;
    shortfall: number;
  }>;
  nearExpiry: Array<{
    ingredient: Ingredient;
    lot: Lot;
    quantity: number;
    isExpired: boolean;
    daysUntilExpiry: number;
  }>;
  todayReceived: Array<{
    ingredient: Ingredient;
    lot: Lot;
    quantity: number;
  }>;
};

export type InventorySectionKey =
  | 'stock'
  | 'receive'
  | 'transfer'
  | 'audit'
  | 'waste'
  | 'ledger'
  | 'recipes'
  | 'ingredients'
  | 'suppliers';

// Backward compatibility with previous tab keys
export type InventoryTabKey = InventorySectionKey | 'move' | 'setup';

export const unitLabel: Record<Ingredient['unit'], string> = {
  GRAM: 'g',
  MILLILITER: 'ml',
  EACH: 'cái',
};

export const ledgerLabel: Record<string, string> = {
  RECEIPT: 'Nhập hàng',
  TRANSFER_OUT: 'Chuyển kho (Xuất)',
  TRANSFER_IN: 'Chuyển kho (Nhập)',
  COUNT_ADJUSTMENT: 'Kiểm kê cân chỉnh',
  WASTE: 'Báo hủy / Hao hụt',
  CONSUMPTION: 'Trừ kho BOM (Bán hàng)',
};

export const ledgerBadgeColor: Record<string, string> = {
  RECEIPT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TRANSFER_OUT: 'bg-amber-50 text-amber-800 border-amber-200',
  TRANSFER_IN: 'bg-blue-50 text-blue-700 border-blue-200',
  COUNT_ADJUSTMENT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  WASTE: 'bg-rose-50 text-rose-700 border-rose-200',
  CONSUMPTION: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export const localIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function slugToSku(name: string) {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return clean ? `ING-${clean}` : '';
}
