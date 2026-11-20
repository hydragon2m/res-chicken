'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ApiError, apiRequest, getActor, type Actor } from '@/thu-vien/auth';
import { useActiveStore } from '@/thu-vien/store-context';
import { InventoryNav } from '@/tinh-nang/kho-nguyen-lieu/inventory-nav';
import { StockView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/stock-view';
import { ReceiveView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/receive-view';
import { TransferView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/transfer-view';
import { AuditView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/audit-view';
import { WasteView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/waste-view';
import { LedgerView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/ledger-view';
import { RecipesView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/recipes-view';
import { IngredientsView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/ingredients-view';
import { SuppliersView } from '@/tinh-nang/kho-nguyen-lieu/giao-dien/suppliers-view';
import type {
  Supplier,
  Location,
  Ingredient,
  Lot,
  StockRow,
  LedgerRow,
  Product,
  Recipe,
  InventoryAlerts,
  InventorySectionKey,
} from '@/tinh-nang/kho-nguyen-lieu/types';

interface InventoryWorkspaceProps {
  initialSection?: InventorySectionKey;
}

export function InventoryWorkspace({ initialSection = 'stock' }: InventoryWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlerts>({
    lowStock: [],
    nearExpiry: [],
    todayReceived: [],
  });

  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Map legacy tabs if present in query params
  const tabFromUrl = searchParams.get('tab');
  const ingredientIdFromUrl = searchParams.get('ingredientId') ?? undefined;

  const currentSection: InventorySectionKey = useMemo(() => {
    if (tabFromUrl === 'move') return 'transfer';
    if (tabFromUrl === 'setup') return 'ingredients';
    const validSections: InventorySectionKey[] = [
      'stock',
      'receive',
      'transfer',
      'audit',
      'waste',
      'ledger',
      'recipes',
      'ingredients',
      'suppliers',
    ];
    if (tabFromUrl && validSections.includes(tabFromUrl as InventorySectionKey)) {
      return tabFromUrl as InventorySectionKey;
    }
    return initialSection;
  }, [tabFromUrl, initialSection]);

  const canManage = actor?.permissions.includes('inventory.manage') ?? false;

  const load = useCallback(async (selectedStoreId: string) => {
    const suffix = `?storeId=${encodeURIComponent(selectedStoreId)}`;
    const [
      supplierList,
      locationList,
      ingredientList,
      stockList,
      ledgerList,
      productList,
      recipeList,
      alertData,
    ] = await Promise.all([
      apiRequest<Supplier[]>(`/inventory/suppliers${suffix}`).catch(() => []),
      apiRequest<Location[]>(`/inventory/locations${suffix}`).catch(() => []),
      apiRequest<Ingredient[]>(`/inventory/ingredients${suffix}`).catch(() => []),
      apiRequest<StockRow[]>(`/inventory/stock${suffix}`).catch(() => []),
      apiRequest<LedgerRow[]>(`/inventory/ledger${suffix}`).catch(() => []),
      apiRequest<Product[]>(`/inventory/recipe-products${suffix}`).catch(() => []),
      apiRequest<Recipe[]>(`/inventory/recipes${suffix}`).catch(() => []),
      apiRequest<InventoryAlerts>(`/inventory/alerts${suffix}`).catch(() => ({
        lowStock: [],
        nearExpiry: [],
        todayReceived: [],
      })),
    ]);

    setSuppliers(supplierList);
    setLocations(locationList);
    setIngredients(ingredientList);
    setStock(stockList);
    setLedger(ledgerList);
    setProducts(productList);
    setRecipes(recipeList);
    setAlerts(alertData);
  }, []);

  useEffect(() => {
    let active = true;
    void getActor().then((res) => {
      if (active) setActor(res);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    setLoading(true);
    const frame = window.requestAnimationFrame(() => {
      load(storeId)
        .catch((error) => {
          if (!active) return;
          const msg =
            error instanceof ApiError
              ? error.message
              : 'Không thể tải dữ liệu kho. Vui lòng thử lại sau.';
          setNotice(msg);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [storeId, load]);

  const run = async (operation: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setNotice('');
    try {
      await operation();
      if (storeId) await load(storeId);
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : 'Không thể thực hiện thao tác kho. Vui lòng kiểm tra lại.';
      setNotice(msg);
      toast.error(msg);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const lots = useMemo(
    () =>
      stock
        .filter((row): row is StockRow & { lot: Lot } => Boolean(row.lot))
        .map((row) => ({
          ...row.lot,
          ingredientId: row.ingredient.id,
          locationId: row.location.id,
          quantity: row.quantity,
        })),
    [stock],
  );

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-rose-500 hover:text-rose-700 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Functional Navigation Bar */}
      <InventoryNav
        currentSection={currentSection}
        alerts={alerts}
        canManage={canManage}
      />

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Đang đồng bộ dữ liệu tồn kho, hạn dùng và thẻ kho…
        </div>
      ) : (
        <div className="space-y-6">
          {currentSection === 'stock' && (
            <StockView
              stock={stock}
              locations={locations}
              ingredients={ingredients}
              alerts={alerts}
              canManage={canManage}
            />
          )}

          {currentSection === 'receive' && canManage && (
            <ReceiveView
              storeId={storeId}
              suppliers={suppliers}
              locations={locations}
              ingredients={ingredients}
              lots={lots}
              alerts={alerts}
              ledger={ledger}
              preselectedIngredientId={ingredientIdFromUrl}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'transfer' && canManage && (
            <TransferView
              storeId={storeId}
              locations={locations}
              ingredients={ingredients}
              stock={stock}
              lots={lots}
              ledger={ledger}
              initialIngredientId={ingredientIdFromUrl}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'audit' && canManage && (
            <AuditView
              storeId={storeId}
              locations={locations}
              ingredients={ingredients}
              stock={stock}
              lots={lots}
              ledger={ledger}
              initialIngredientId={ingredientIdFromUrl}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'waste' && canManage && (
            <WasteView
              storeId={storeId}
              locations={locations}
              ingredients={ingredients}
              stock={stock}
              lots={lots}
              alerts={alerts}
              ledger={ledger}
              initialIngredientId={ingredientIdFromUrl}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'ledger' && (
            <LedgerView
              ledger={ledger}
              ingredients={ingredients}
              locations={locations}
            />
          )}

          {currentSection === 'recipes' && canManage && (
            <RecipesView
              storeId={storeId}
              products={products}
              ingredients={ingredients}
              recipes={recipes}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'ingredients' && canManage && (
            <IngredientsView
              storeId={storeId}
              ingredients={ingredients}
              locations={locations}
              busy={busy}
              run={run}
            />
          )}

          {currentSection === 'suppliers' && canManage && (
            <SuppliersView
              storeId={storeId}
              suppliers={suppliers}
              busy={busy}
              run={run}
            />
          )}
        </div>
      )}
    </div>
  );
}
