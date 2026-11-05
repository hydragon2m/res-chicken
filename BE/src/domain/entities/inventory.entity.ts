export type InventoryUnitEntity = 'GRAM' | 'MILLILITER' | 'EACH';
export type InventoryLocationKindEntity = 'STORAGE' | 'PREP';
export type InventoryLedgerTypeEntity =
  'RECEIPT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'COUNT_ADJUSTMENT' | 'WASTE' | 'CONSUMPTION';

export interface SupplierEntity {
  id: string;
  storeId: string;
  name: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface InventoryLocationEntity {
  id: string;
  storeId: string;
  name: string;
  kind: InventoryLocationKindEntity;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface IngredientEntity {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  unit: InventoryUnitEntity;
  lowStockQuantity: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface GoodsReceiptEntity {
  id: string;
  storeId: string;
  supplierId: string | null;
  locationId: string;
  reference: string | null;
  receivedAt: Date;
  receivedById: string;
  note: string | null;
  createdAt: Date;
}
export interface GoodsReceiptLineEntity {
  id: string;
  receiptId: string;
  ingredientId: string;
  quantity: number;
  unitCost: number;
  lotCode: string;
  expiresAt: Date | null;
}
export interface StockLotEntity {
  id: string;
  storeId: string;
  ingredientId: string;
  supplierId: string | null;
  receiptLineId: string;
  code: string;
  receivedAt: Date;
  expiresAt: Date | null;
  unitCost: number;
  createdAt: Date;
}
export interface InventoryLedgerEntryEntity {
  id: string;
  storeId: string;
  ingredientId: string;
  locationId: string;
  lotId: string | null;
  type: InventoryLedgerTypeEntity;
  quantity: number;
  sourceType: string;
  sourceId: string;
  note: string | null;
  occurredAt: Date;
  actorId: string;
}
export interface StockCountEntity {
  id: string;
  storeId: string;
  ingredientId: string;
  locationId: string;
  lotId: string | null;
  expectedQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  reason: string;
  countedById: string;
  countedAt: Date;
}
export interface InventoryTransferEntity {
  id: string;
  storeId: string;
  ingredientId: string;
  lotId: string | null;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  note: string | null;
  transferredById: string;
  transferredAt: Date;
}
export interface InventoryWasteEntity {
  id: string;
  storeId: string;
  ingredientId: string;
  locationId: string;
  lotId: string | null;
  quantity: number;
  reason: string;
  wastedById: string;
  wastedAt: Date;
}
export interface RecipeRevisionEntity {
  id: string;
  storeId: string;
  productId: string;
  version: number;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
}
export interface RecipeLineEntity {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
}
