export interface StoreEntity {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface CategoryEntity {
  id: string;
  storeId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
export interface ProductEntity {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  imageUrl: string | null;
  isSoldOut: boolean;
  isActive: boolean;
  /** Explicitly controls whether KDS must consume a recipe before preparation. */
  inventoryMode: 'TRACKED' | 'NOT_TRACKED';
}
export interface ProductVariantEntity {
  id: string;
  productId: string;
  name: string;
  isSoldOut: boolean;
}
export interface OptionGroupEntity {
  id: string;
  storeId: string;
  name: string;
  minSelections: number;
  maxSelections: number;
}
export interface OptionEntity {
  id: string;
  optionGroupId: string;
  name: string;
  priceDelta: number;
  isSoldOut: boolean;
}
export interface ProductOptionGroupEntity {
  productId: string;
  optionGroupId: string;
}
export interface PriceScheduleEntity {
  id: string;
  variantId: string;
  amount: number;
  startsAt: Date;
  endsAt: Date | null;
}
