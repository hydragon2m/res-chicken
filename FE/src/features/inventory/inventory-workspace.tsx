'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Package,
  PackagePlus,
  ArrowLeftRight,
  ScrollText,
  ClipboardList,
  Settings2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Warehouse,
  Truck,
  Flame,
  Filter,
  ArrowRight,
  Edit3,
} from 'lucide-react';
import { AccessDenied } from '../../components/access-denied';
import { ApiError, apiRequest, getActor, type Actor } from '../../lib/auth';
import { formatDate, formatDateTime, formatQuantity } from '../../lib/format';
import { useActiveStore } from '../../lib/store-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type Supplier = { id: string; name: string; phone?: string | null; note?: string | null; email?: string | null };
type Location = { id: string; name: string; kind: 'STORAGE' | 'PREP'; isActive: boolean };
type Ingredient = {
  id: string;
  sku: string;
  name: string;
  unit: 'GRAM' | 'MILLILITER' | 'EACH';
  isActive: boolean;
  lowStockQuantity?: number | null;
};
type Lot = {
  id: string;
  code: string;
  expiresAt?: string | null;
  receivedAt: string;
  unitCost: number;
};
type StockRow = { ingredient: Ingredient; location: Location; lot: Lot | null; quantity: number };
type LedgerRow = {
  id: string;
  type: string;
  quantity: number;
  occurredAt: string;
  note?: string | null;
  ingredient: Ingredient;
  location: Location;
  lot?: Lot | null;
};
type Product = { id: string; name: string };
type Recipe = {
  id: string;
  version: number;
  isActive: boolean;
  product: Product;
  lines: Array<{ id: string; quantity: number; ingredient: Ingredient }>;
};
type InventoryAlerts = {
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
  todayReceived: Array<{ ingredient: Ingredient; lot: Lot; quantity: number }>;
};

export type InventoryTabKey = 'stock' | 'receive' | 'move' | 'ledger' | 'recipes' | 'setup';

const unitLabel: Record<Ingredient['unit'], string> = { GRAM: 'g', MILLILITER: 'ml', EACH: 'cái' };
const ledgerLabel: Record<string, string> = {
  RECEIPT: 'Nhập hàng',
  TRANSFER_OUT: 'Chuyển kho (Xuất)',
  TRANSFER_IN: 'Chuyển kho (Nhập)',
  COUNT_ADJUSTMENT: 'Kiểm kê cân chỉnh',
  WASTE: 'Báo hủy / Hao hụt',
  CONSUMPTION: 'Trừ kho BOM (Bán hàng)',
};

const ledgerBadgeColor: Record<string, string> = {
  RECEIPT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TRANSFER_OUT: 'bg-amber-50 text-amber-800 border-amber-200',
  TRANSFER_IN: 'bg-blue-50 text-blue-700 border-blue-200',
  COUNT_ADJUSTMENT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  WASTE: 'bg-rose-50 text-rose-700 border-rose-200',
  CONSUMPTION: 'bg-slate-100 text-slate-700 border-slate-200',
};

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

const localIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function InventoryWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentStoreId: storeId, currentStore, stores } = useActiveStore();
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

  const tabFromUrl = searchParams.get('tab') as InventoryTabKey | null;
  const [tab, setTab] = useState<InventoryTabKey>('stock');
  const [preselectedIngredientId, setPreselectedIngredientId] = useState<string>('');
  const [preselectedMoveAction, setPreselectedMoveAction] = useState<
    'transfer' | 'count' | 'waste'
  >('transfer');

  useEffect(() => {
    if (
      tabFromUrl &&
      ['stock', 'receive', 'move', 'ledger', 'recipes', 'setup'].includes(tabFromUrl)
    ) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const canManage = actor?.permissions.includes('inventory.manage') ?? false;

  const load = useCallback(async (selectedStoreId: string) => {
    if (!selectedStoreId) return;
    const suffix = `?storeId=${encodeURIComponent(selectedStoreId)}`;
    const [
      nextSuppliers,
      nextLocations,
      nextIngredients,
      nextStock,
      nextLedger,
      nextProducts,
      nextRecipes,
      nextAlerts,
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
    setSuppliers(nextSuppliers ?? []);
    setLocations(nextLocations ?? []);
    setIngredients(nextIngredients ?? []);
    setStock(nextStock ?? []);
    setLedger(nextLedger ?? []);
    setProducts(nextProducts ?? []);
    setRecipes(nextRecipes ?? []);
    setAlerts(
      nextAlerts ?? {
        lowStock: [],
        nearExpiry: [],
        todayReceived: [],
      },
    );
  }, []);

  useEffect(() => {
    void getActor()
      .then((nextActor) => {
        setActor(nextActor);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
        else setNotice(error instanceof ApiError ? error.message : 'Không thể tải dữ liệu kho.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!storeId || !actor?.permissions.includes('inventory.read')) return;
    const frame = window.requestAnimationFrame(() => {
      setLoading(true);
      void load(storeId)
        .catch((error) => {
          setNotice(error instanceof ApiError ? error.message : 'Không thể đồng bộ kho.');
        })
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storeId, actor, load]);

  const run = async (operation: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setNotice('');
    try {
      await operation();
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Không thể lưu thay đổi kho.';
      setNotice(msg);
      toast.error(msg);
      setBusy(false);
      return;
    }
    try {
      await load(storeId);
    } catch {
      // Bỏ qua lỗi đồng bộ sau khi thao tác lưu đã thành công (201/200)
    } finally {
      setBusy(false);
    }
  };

  const lots = useMemo(
    () =>
      stock.flatMap((row) =>
        row.lot && row.ingredient && row.location
          ? [
              {
                ...row.lot,
                ingredientId: row.ingredient.id,
                locationId: row.location.id,
                quantity: row.quantity,
              },
            ]
          : [],
      ),
    [stock],
  );

  const handleJumpToAction = (
    targetTab: InventoryTabKey,
    ingredientId?: string,
    moveAction?: 'transfer' | 'count' | 'waste',
  ) => {
    if (ingredientId) setPreselectedIngredientId(ingredientId);
    if (moveAction) setPreselectedMoveAction(moveAction);
    setTab(targetTab);
  };

  if (loading && !actor)
    return (
      <main className="w-full p-8 text-center text-sm text-slate-500">
        Đang tải phân hệ quản lý kho…
      </main>
    );
  if (!actor || !actor.permissions.includes('inventory.read'))
    return <AccessDenied area="Kho" permission="inventory.read" />;
  if (!stores.length)
    return (
      <main className="w-full p-8">
        <p className="eyebrow">Kho</p>
        <h1 className="text-xl font-bold">Chưa có phạm vi cửa hàng</h1>
        <p className="text-sm text-slate-500">
          Tài khoản cần được gán ít nhất một cửa hàng để vận hành kho.
        </p>
      </main>
    );

  const activeRecipesCount = recipes.filter((r) => r.isActive).length;
  const totalAlertsCount = alerts.lowStock.length + alerts.nearExpiry.length;

  const navItems: Array<{
    key: InventoryTabKey;
    label: string;
    sub: string;
    icon: typeof Package;
    badge?: string | number;
    badgeTone?: string;
    manageOnly?: boolean;
  }> = [
    {
      key: 'stock',
      label: '1. Tồn kho & Cảnh báo',
      sub: 'Tồn thực tế theo lô & vị trí',
      icon: Package,
      badge: totalAlertsCount > 0 ? `${totalAlertsCount} cảnh báo` : `${stock.length} lô`,
      badgeTone:
        totalAlertsCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700',
    },
    {
      key: 'receive',
      label: '2. Nhập kho theo lô',
      sub: 'Lập phiếu nhập PO & hạn dùng',
      icon: PackagePlus,
      badge: alerts.todayReceived.length > 0 ? `+${alerts.todayReceived.length} hôm nay` : 'Tạo phiếu',
      badgeTone: 'bg-emerald-100 text-emerald-800',
      manageOnly: true,
    },
    {
      key: 'move',
      label: '3. Xuất · Kiểm kê · Hủy',
      sub: 'Chuyển kho, kiểm đếm & hao hụt',
      icon: ArrowLeftRight,
      badge: '3 nghiệp vụ',
      badgeTone: 'bg-amber-100 text-amber-800',
      manageOnly: true,
    },
    {
      key: 'ledger',
      label: '4. Sổ cái Thẻ kho',
      sub: 'Lịch sử nhập - xuất - tiêu hao',
      icon: ScrollText,
      badge: `${ledger.length} giao dịch`,
      badgeTone: 'bg-blue-100 text-blue-800',
    },
    {
      key: 'recipes',
      label: '5. Định mức món (BOM)',
      sub: 'Công thức trừ kho tự động',
      icon: ClipboardList,
      badge: `${activeRecipesCount}/${products.length} món`,
      badgeTone: 'bg-purple-100 text-purple-800',
      manageOnly: true,
    },
    {
      key: 'setup',
      label: '6. Danh mục & Cấu hình',
      sub: 'Nguyên liệu, Vị trí kho & NCC',
      icon: Settings2,
      badge: `${ingredients.length} NVL`,
      badgeTone: 'bg-slate-200 text-slate-800',
      manageOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => !item.manageOnly || canManage);

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Warehouse className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 uppercase tracking-wider">
              <span>{currentStore?.name ?? 'Chi nhánh'}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">Hệ thống Quản trị Kho & Định mức BOM</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Trung Tâm Điều Hành Kho Nguyên Vật Liệu
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && tab !== 'receive' && (
            <Button
              size="sm"
              onClick={() => setTab('receive')}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-xs"
            >
              <PackagePlus className="size-4" />
              <span>+ Nhập hàng vào kho</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(storeId)}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Đồng bộ kho</span>
          </Button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="font-bold text-amber-700 hover:text-amber-950 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 6 Functional Modules Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20 shadow-sm'
                  : 'bg-white border-slate-200/90 hover:border-amber-300 hover:bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div
                  className={`size-8 rounded-xl flex items-center justify-center ${
                    isActive ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeTone}`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <div>
                <p
                  className={`text-xs font-extrabold leading-snug ${
                    isActive ? 'text-amber-950' : 'text-slate-900'
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Functional Workspace */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Đang đồng bộ dữ liệu tồn kho và sổ cái…
        </div>
      ) : (
        <div className="space-y-6">
          {tab === 'stock' && (
            <StockTab
              stock={stock}
              locations={locations}
              ingredients={ingredients}
              alerts={alerts}
              canManage={canManage}
              onJump={handleJumpToAction}
            />
          )}
          {tab === 'receive' && canManage && (
            <ReceiveTab
              storeId={storeId}
              suppliers={suppliers}
              locations={locations}
              ingredients={ingredients}
              lots={lots}
              alerts={alerts}
              ledger={ledger}
              preselectedIngredientId={preselectedIngredientId}
              busy={busy}
              run={run}
              onGoSetup={() => setTab('setup')}
            />
          )}
          {tab === 'move' && canManage && (
            <MovementTab
              storeId={storeId}
              locations={locations}
              ingredients={ingredients}
              stock={stock}
              lots={lots}
              ledger={ledger}
              initialAction={preselectedMoveAction}
              initialIngredientId={preselectedIngredientId}
              busy={busy}
              run={run}
            />
          )}
          {tab === 'ledger' && (
            <LedgerTab ledger={ledger} ingredients={ingredients} locations={locations} />
          )}
          {tab === 'recipes' && canManage && (
            <RecipeTab
              storeId={storeId}
              products={products}
              ingredients={ingredients}
              recipes={recipes}
              busy={busy}
              run={run}
            />
          )}
          {tab === 'setup' && canManage && (
            <SetupTab
              storeId={storeId}
              suppliers={suppliers}
              locations={locations}
              ingredients={ingredients}
              busy={busy}
              run={run}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 1. TAB TỒN KHO & CẢNH BÁO
 * ========================================================================== */
function StockTab({
  stock,
  locations,
  ingredients,
  alerts,
  canManage,
  onJump,
}: {
  stock: StockRow[];
  locations: Location[];
  ingredients: Ingredient[];
  alerts: InventoryAlerts;
  canManage: boolean;
  onJump: (
    tab: InventoryTabKey,
    ingredientId?: string,
    moveAction?: 'transfer' | 'count' | 'waste',
  ) => void;
}) {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW' | 'EXPIRY'>('ALL');

  const lowStockIds = useMemo(
    () => new Set(alerts.lowStock.map((x) => x.ingredient.id)),
    [alerts.lowStock],
  );
  const nearExpiryLotIds = useMemo(
    () => new Set(alerts.nearExpiry.map((x) => x.lot.id)),
    [alerts.nearExpiry],
  );

  const filteredStock = useMemo(() => {
    return stock.filter((row) => {
      if (locationFilter !== 'ALL' && row.location.id !== locationFilter) return false;
      if (statusFilter === 'LOW' && !lowStockIds.has(row.ingredient.id)) return false;
      if (statusFilter === 'EXPIRY' && (!row.lot || !nearExpiryLotIds.has(row.lot.id)))
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = row.ingredient.name.toLowerCase().includes(q);
        const matchSku = row.ingredient.sku.toLowerCase().includes(q);
        const matchLot = row.lot?.code?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchSku && !matchLot) return false;
      }
      return true;
    });
  }, [stock, locationFilter, statusFilter, search, lowStockIds, nearExpiryLotIds]);

  return (
    <div className="space-y-6">
      {/* 3 Alert Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Low Stock */}
        <div className="p-5 rounded-2xl bg-white border border-rose-200 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                    Cảnh báo thiếu hụt
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Nguyên liệu dưới định mức tối thiểu
                  </h3>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-extrabold text-xs">
                {alerts.lowStock.length} mặt hàng
              </span>
            </div>

            {alerts.lowStock.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Tất cả {ingredients.length} nguyên liệu đều đạt ngưỡng tồn kho an toàn.
              </p>
            ) : (
              <ul className="space-y-2 text-xs divide-y divide-slate-100">
                {alerts.lowStock.slice(0, 4).map((row) => (
                  <li
                    key={row.ingredient.id}
                    className="pt-2 flex justify-between items-center gap-2"
                  >
                    <span className="font-bold text-slate-800 truncate">{row.ingredient.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-rose-600 font-bold">
                        Còn {formatQuantity(row.quantity, unitLabel[row.ingredient.unit])} (thiếu{' '}
                        {formatQuantity(row.shortfall, unitLabel[row.ingredient.unit])})
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onJump('receive', row.ingredient.id)}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Nhập ngay
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Card 2: Near Expiry */}
        <div className="p-5 rounded-2xl bg-white border border-amber-200 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    Kiểm soát FEFO
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">Lô hàng sắp hoặc đã hết hạn</h3>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-extrabold text-xs">
                {alerts.nearExpiry.length} lô
              </span>
            </div>

            {alerts.nearExpiry.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Không có lô nguyên liệu nào hết hạn trong 7 ngày tới.
              </p>
            ) : (
              <ul className="space-y-2 text-xs divide-y divide-slate-100">
                {alerts.nearExpiry.slice(0, 4).map((row) => (
                  <li key={row.lot.id} className="pt-2 flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 truncate block">
                        {row.ingredient.name}
                      </span>
                      <span className="text-[10px] text-slate-400">Lô: {row.lot.code}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={
                          row.isExpired ? 'text-rose-600 font-bold' : 'text-amber-700 font-bold'
                        }
                      >
                        {row.isExpired ? 'Đã hết hạn' : `Còn ${row.daysUntilExpiry} ngày`}
                      </span>
                      {canManage && row.isExpired && (
                        <button
                          type="button"
                          onClick={() => onJump('move', row.ingredient.id, 'waste')}
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Xử lý hủy
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Card 3: Today Received */}
        <div className="p-5 rounded-2xl bg-white border border-emerald-200 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                    Nhập trong ngày
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">Lô hàng mới tiếp nhận</h3>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-extrabold text-xs">
                {alerts.todayReceived.length} lô
              </span>
            </div>

            {alerts.todayReceived.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Hôm nay chưa phát sinh phiếu nhập lô hàng mới.
              </p>
            ) : (
              <ul className="space-y-2 text-xs divide-y divide-slate-100">
                {alerts.todayReceived.slice(0, 4).map((row) => (
                  <li key={row.lot.id} className="pt-2 flex justify-between items-center">
                    <span className="font-bold text-slate-800">{row.ingredient.name}</span>
                    <span className="text-emerald-700 font-bold">
                      +{formatQuantity(row.quantity, unitLabel[row.ingredient.unit])} (Lô{' '}
                      {row.lot.code})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Main Stock Table with Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-slate-900 text-base">
              Bảng Tồn Kho Thực Tế Theo Lô & Khu Vực Lưu Trữ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tra cứu tồn kho chi tiết tại Kho chính và Trạm sơ chế bếp • Nhấn nút thao tác bên phải
              để nhập thêm hoặc kiểm kê nhanh
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nguyên liệu, SKU, mã lô..."
                className="pl-9 h-9 text-xs"
              />
            </div>

            <select
              aria-label="Lọc theo vị trí kho"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Tất cả vị trí kho ({locations.length})</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.kind === 'STORAGE' ? 'Kho chính' : 'Trạm sơ chế'})
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              {(
                [
                  { key: 'ALL', label: 'Tất cả' },
                  { key: 'LOW', label: `Sắp hết (${alerts.lowStock.length})` },
                  { key: 'EXPIRY', label: `Cận hạn (${alerts.nearExpiry.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    statusFilter === f.key
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredStock.length === 0 ? (
          <div className="py-14 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-600">
              Không tìm thấy dòng tồn kho nào phù hợp với bộ lọc.
            </p>
            {canManage && stock.length === 0 && (
              <Button
                size="sm"
                onClick={() => onJump('receive')}
                className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
              >
                + Tạo phiếu nhập kho đầu tiên
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Nguyên vật liệu / Mã SKU</th>
                  <th className="px-4 py-3.5">Vị trí lưu trữ</th>
                  <th className="px-4 py-3.5">Mã lô (Lot) & Giá vốn</th>
                  <th className="px-4 py-3.5">Hạn sử dụng</th>
                  <th className="px-4 py-3.5 text-right">Ngưỡng tối thiểu</th>
                  <th className="px-4 py-3.5 text-right">Tồn thực tế</th>
                  {canManage && <th className="px-5 py-3.5 text-right">Thao tác nhanh</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.map((row) => {
                  const isLow = lowStockIds.has(row.ingredient.id);
                  const isNearExp = row.lot ? nearExpiryLotIds.has(row.lot.id) : false;
                  return (
                    <tr
                      key={`${row.ingredient.id}-${row.location.id}-${row.lot?.id ?? 'none'}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {row.ingredient.name}
                          </span>
                          {isLow && <Badge variant="destructive">Sắp hết</Badge>}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          SKU: {row.ingredient.sku}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg font-semibold text-xs ${
                            row.location.kind === 'STORAGE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                          }`}
                        >
                          {row.location.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.lot ? (
                          <div>
                            <span className="font-bold text-slate-800 block">{row.lot.code}</span>
                            <span className="text-[11px] text-slate-400">
                              Giá vốn: {money.format(row.lot.unitCost)}/
                              {unitLabel[row.ingredient.unit]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Tồn chung (Không chia lô)</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {row.lot?.expiresAt ? (
                          <span
                            className={`font-semibold ${
                              isNearExp ? 'text-rose-600 font-bold' : 'text-slate-700'
                            }`}
                          >
                            {formatDate(row.lot.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Không giới hạn</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-500 font-medium">
                        {row.ingredient.lowStockQuantity != null
                          ? formatQuantity(
                              row.ingredient.lowStockQuantity,
                              unitLabel[row.ingredient.unit],
                            )
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={`font-extrabold text-sm ${
                            isLow ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {formatQuantity(row.quantity, unitLabel[row.ingredient.unit])}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onJump('receive', row.ingredient.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs cursor-pointer transition-colors"
                            >
                              + Nhập thêm
                            </button>
                            <button
                              type="button"
                              onClick={() => onJump('move', row.ingredient.id, 'transfer')}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-colors"
                            >
                              Chuyển / Kiểm
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. TAB NHẬP KHO THEO LÔ (PO / RECEIPTS)
 * ========================================================================== */
function makeLotCode(index = 0) {
  const now = new Date();
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const hm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const seq = String(index + 1).padStart(2, '0');
  return `LOT-${ymd}-${hm}-${seq}`;
}

function makePoRef() {
  const now = new Date();
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const hm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `PO-${ymd}-${hm}`;
}

function futureDateStr(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function ReceiveTab({
  storeId,
  suppliers,
  locations,
  ingredients,
  lots,
  alerts,
  ledger,
  preselectedIngredientId,
  busy,
  run,
  onGoSetup,
}: {
  storeId: string;
  suppliers: Supplier[];
  locations: Location[];
  ingredients: Ingredient[];
  lots: Array<Lot & { ingredientId: string; locationId: string; quantity: number }>;
  alerts: InventoryAlerts;
  ledger: LedgerRow[];
  preselectedIngredientId?: string;
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
  onGoSetup: () => void;
}) {
  const defaultStorageLocationId = useMemo(
    () => locations.find((l) => l.kind === 'STORAGE')?.id ?? locations[0]?.id ?? '',
    [locations],
  );
  const [locationId, setLocationId] = useState(defaultStorageLocationId);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [receivedAt, setReceivedAt] = useState(() => localIso());
  const [reference, setReference] = useState(() => makePoRef());
  const [note, setNote] = useState('Đã kiểm tra nhiệt độ bảo quản và bao bì đạt chuẩn');

  useEffect(() => {
    if (!locationId && defaultStorageLocationId) setLocationId(defaultStorageLocationId);
  }, [defaultStorageLocationId, locationId]);

  useEffect(() => {
    if (!supplierId && suppliers[0]?.id) setSupplierId(suppliers[0].id);
  }, [suppliers, supplierId]);

  const getDefaultsForIngredient = useCallback(
    (ingId: string, idx: number) => {
      const ing = ingredients.find((i) => i.id === ingId);
      const lowItem = alerts.lowStock.find((x) => x.ingredient.id === ingId);
      const prevLot = lots.find((l) => l.ingredientId === ingId);
      const defaultQty = lowItem
        ? Math.max(lowItem.shortfall, ing?.unit === 'EACH' ? 50 : 1000)
        : ing?.unit === 'EACH'
          ? 50
          : 2000;
      const defaultCost =
        prevLot?.unitCost ?? (ing?.unit === 'EACH' ? 15000 : ing?.unit === 'GRAM' ? 120 : 80);
      return {
        ingredientId: ingId,
        quantity: String(defaultQty),
        unitCost: String(defaultCost),
        lotCode: makeLotCode(idx),
        expiresAt: futureDateStr(7),
      };
    },
    [ingredients, alerts.lowStock, lots],
  );

  const [lines, setLines] = useState(() => {
    const initialId = preselectedIngredientId || ingredients[0]?.id || '';
    if (initialId) {
      return [
        {
          ingredientId: initialId,
          quantity: '1000',
          unitCost: '120',
          lotCode: makeLotCode(0),
          expiresAt: futureDateStr(7),
        },
      ];
    }
    return [
      {
        ingredientId: '',
        quantity: '100',
        unitCost: '1000',
        lotCode: makeLotCode(0),
        expiresAt: futureDateStr(7),
      },
    ];
  });

  useEffect(() => {
    if (preselectedIngredientId) {
      setLines([getDefaultsForIngredient(preselectedIngredientId, 0)]);
    }
  }, [preselectedIngredientId, getDefaultsForIngredient]);

  useEffect(() => {
    if (ingredients.length > 0) {
      setLines((prev) =>
        prev.map((line, idx) =>
          !line.ingredientId ? getDefaultsForIngredient(ingredients[0].id, idx) : line,
        ),
      );
    }
  }, [ingredients, getDefaultsForIngredient]);

  const handleFillLowStock = () => {
    const source =
      alerts.lowStock.length > 0
        ? alerts.lowStock.map((item) => item.ingredient.id)
        : ingredients.slice(0, 3).map((i) => i.id);
    if (!source.length) return;
    setLines(source.map((ingId, idx) => getDefaultsForIngredient(ingId, idx)));
    toast.success(`Đã tự động điền ${source.length} nguyên liệu kèm số lượng, giá vốn & mã lô!`);
  };

  const totalReceiptCost = useMemo(() => {
    return lines.reduce((sum, line) => {
      const q = Number(line.quantity) || 0;
      const c = Number(line.unitCost) || 0;
      return sum + q * c;
    }, 0);
  }, [lines]);

  const recentReceipts = useMemo(
    () => ledger.filter((row) => row.type === 'RECEIPT').slice(0, 12),
    [ledger],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/receipts', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: JSON.stringify({
          storeId,
          supplierId: supplierId || undefined,
          locationId: locationId || defaultStorageLocationId,
          reference: reference.trim() || undefined,
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
          note: note.trim() || undefined,
          lines: lines.map((line, idx) => ({
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
            lotCode: line.lotCode.trim() || makeLotCode(idx),
            expiresAt: line.expiresAt ? new Date(line.expiresAt).toISOString() : undefined,
          })),
        }),
      });
      setReference(makePoRef());
      setReceivedAt(localIso());
      const firstId = ingredients[0]?.id ?? '';
      setLines([
        firstId
          ? getDefaultsForIngredient(firstId, 0)
          : {
              ingredientId: '',
              quantity: '100',
              unitCost: '1000',
              lotCode: makeLotCode(0),
              expiresAt: futureDateStr(7),
            },
      ]);
    }, 'Đã ghi nhận phiếu nhập kho thành công!');
  };

  return (
    <div className="space-y-6">
      {(!ingredients.length || !locations.length) && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-amber-950">
              Cần khởi tạo Danh mục Nguyên liệu & Vị trí kho trước khi nhập hàng
            </h3>
            <p className="text-xs text-amber-800">
              Hiện có {ingredients.length} nguyên liệu và {locations.length} vị trí kho tại chi
              nhánh này.
            </p>
          </div>
          <Button
            size="sm"
            onClick={onGoSetup}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
          >
            Sang mục 6. Danh mục & Cấu hình →
          </Button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Nghiệp vụ Nhập kho Tự động (Inbound PO)
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
              Lập Phiếu Tiếp Nhận Nguyên Vật Liệu Theo Lô
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mã phiếu PO, Mã lô (Lot Code), Giá vốn gần nhất và Hạn dùng được tự động sinh để không
              cần nhập tay
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {ingredients.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFillLowStock}
                className="text-xs font-bold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                <Flame className="size-3.5 mr-1 text-amber-600" />
                <span>
                  {alerts.lowStock.length > 0
                    ? `Tự điền ${alerts.lowStock.length} NVL sắp hết`
                    : 'Tự điền nhanh danh sách nhập mẫu'}
                </span>
              </Button>
            )}
            <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-right">
              <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                Tổng giá trị phiếu nhập
              </span>
              <span className="text-base font-extrabold text-emerald-900">
                {money.format(totalReceiptCost)}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Bước 1: Thông tin chung phiếu nhập */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Bước 1: Thông tin chứng từ & Vị trí kho tiếp nhận (Đã điền sẵn mặc định)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/70">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Vị trí kho nhận hàng <span className="text-rose-500">*</span>
                </label>
                <select
                  name="locationId"
                  required
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option disabled value="">
                    -- Chọn vị trí kho --
                  </option>
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.kind === 'STORAGE' ? 'Kho chính' : 'Trạm sơ chế'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Nhà cung cấp</label>
                <select
                  name="supplierId"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Nhập lẻ / Tự do --</option>
                  {suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Thời điểm nhận <span className="text-rose-500">*</span>
                </label>
                <input
                  name="receivedAt"
                  required
                  type="datetime-local"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Mã phiếu PO (Tự sinh)</label>
                  <button
                    type="button"
                    onClick={() => setReference(makePoRef())}
                    className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
                  >
                    Đổi mã mới
                  </button>
                </div>
                <input
                  name="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Tự động sinh nếu để trống"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700">Ghi chú kiểm nhận nhanh</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Đã kiểm tra nhiệt độ bảo quản và bao bì đạt chuẩn',
                      'Nhập bổ sung nguyên liệu ca sáng',
                      'Nhập hàng định kỳ theo hợp đồng NCC',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNote(preset)}
                        className="px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-amber-400 text-[11px] font-medium text-slate-600 cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú tình trạng nhiệt độ xe lạnh, tem kiểm dịch, bao bì..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Bước 2: Chi tiết các dòng nguyên liệu */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Bước 2: Danh sách các lô nguyên vật liệu nhập ({lines.length} dòng)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const nextIdx = lines.length;
                  const unusedIng =
                    ingredients.find((i) => !lines.some((l) => l.ingredientId === i.id)) ??
                    ingredients[0];
                  setLines((current) => [
                    ...current,
                    unusedIng
                      ? getDefaultsForIngredient(unusedIng.id, nextIdx)
                      : {
                          ingredientId: '',
                          quantity: '100',
                          unitCost: '1000',
                          lotCode: makeLotCode(nextIdx),
                          expiresAt: futureDateStr(7),
                        },
                  ]);
                }}
                className="text-xs font-bold text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer"
              >
                <Plus className="size-3.5 mr-1" />
                <span>Thêm dòng nguyên liệu</span>
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              <div className="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase bg-slate-100">
                <span className="col-span-4">Nguyên vật liệu & Đơn vị</span>
                <span className="col-span-2">Số lượng nhập *</span>
                <span className="col-span-2">Đơn giá vốn (đ) *</span>
                <span className="col-span-2">Mã lô (Tự sinh / KAuto)</span>
                <span className="col-span-2">Hạn sử dụng (HSD)</span>
              </div>

              {lines.map((line, index) => {
                const selectedIng = ingredients.find((i) => i.id === line.ingredientId);
                return (
                  <div
                    key={index}
                    className="p-3 bg-white hover:bg-slate-50/70 transition-colors space-y-2"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-4">
                        <select
                          aria-label="Chọn nguyên liệu nhập"
                          required
                          value={line.ingredientId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            const autoVals = getDefaultsForIngredient(nextId, index);
                            setLines((curr) =>
                              curr.map((it, idx) => (idx === index ? autoVals : it)),
                            );
                          }}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- Chọn nguyên liệu --</option>
                          {ingredients.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.sku} - tính theo {unitLabel[item.unit]})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2 relative">
                        <input
                          required
                          min="1"
                          type="number"
                          placeholder="Số lượng"
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index ? { ...it, quantity: e.target.value } : it,
                              ),
                            )
                          }
                          className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                        {selectedIng && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                            {unitLabel[selectedIng.unit]}
                          </span>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <input
                          required
                          min="0"
                          type="number"
                          placeholder="Đơn giá / ĐVT"
                          value={line.unitCost}
                          onChange={(e) =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index ? { ...it, unitCost: e.target.value } : it,
                              ),
                            )
                          }
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <input
                          placeholder="Để trống sẽ tự sinh"
                          value={line.lotCode}
                          onChange={(e) =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index ? { ...it, lotCode: e.target.value } : it,
                              ),
                            )
                          }
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs font-mono font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="md:col-span-2 flex items-center gap-1.5">
                        <input
                          type="date"
                          aria-label="Hạn sử dụng lô hàng"
                          value={line.expiresAt}
                          onChange={(e) =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index ? { ...it, expiresAt: e.target.value } : it,
                              ),
                            )
                          }
                          className="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-amber-500"
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setLines((curr) => curr.filter((_, idx) => idx !== index))
                            }
                            className="size-9 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                            title="Xóa dòng này"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick 1-click preset pills per line */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pl-1">
                      <span className="font-semibold text-slate-400">Chọn nhanh SL:</span>
                      {[50, 100, 500, 1000, 5000].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index ? { ...it, quantity: String(q) } : it,
                              ),
                            )
                          }
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-amber-100 hover:text-amber-900 font-semibold cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                      <span className="text-slate-300">|</span>
                      <span className="font-semibold text-slate-400">HSD:</span>
                      {[
                        { label: '+3 ngày', days: 3 },
                        { label: '+7 ngày', days: 7 },
                        { label: '+30 ngày', days: 30 },
                      ].map((exp) => (
                        <button
                          key={exp.days}
                          type="button"
                          onClick={() =>
                            setLines((curr) =>
                              curr.map((it, idx) =>
                                idx === index
                                  ? { ...it, expiresAt: futureDateStr(exp.days) }
                                  : it,
                              ),
                            )
                          }
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 font-semibold cursor-pointer"
                        >
                          {exp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={busy || !ingredients.length || !locations.length}
              className="px-6 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-sm"
            >
              {busy ? 'Đang ghi sổ kho...' : 'Xác Nhận Nhập Kho & Cập Nhật Tồn'}
            </Button>
          </div>
        </form>
      </div>

      {/* Lịch sử nhập kho gần đây */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Lịch sử các lô mới nhập gần đây</h3>
            <p className="text-xs text-slate-500">
              Đối chiếu nhanh các dòng nguyên liệu vừa tiếp nhận vào kho
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
            {recentReceipts.length} lần nhập gần nhất
          </span>
        </div>
        {recentReceipts.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">Chưa có lịch sử nhập kho.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-4 py-3">Nguyên liệu</th>
                  <th className="px-4 py-3">Vị trí nhận</th>
                  <th className="px-4 py-3">Ghi chú / PO</th>
                  <th className="px-5 py-3 text-right">Số lượng nhập</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-500">{formatDateTime(r.occurredAt)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{r.ingredient.name}</td>
                    <td className="px-4 py-3 text-slate-700">{r.location.name}</td>
                    <td className="px-4 py-3 text-slate-500">{r.note || 'Phiếu nhập kho'}</td>
                    <td className="px-5 py-3 text-right font-extrabold text-emerald-600">
                      +{formatQuantity(r.quantity, unitLabel[r.ingredient.unit])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. TAB CHUYỂN KHO · KIỂM KÊ · BÁO HỦY HAO HỤT
 * ========================================================================== */
function MovementTab({
  storeId,
  locations,
  ingredients,
  stock,
  lots,
  ledger,
  initialAction,
  initialIngredientId,
  busy,
  run,
}: {
  storeId: string;
  locations: Location[];
  ingredients: Ingredient[];
  stock: StockRow[];
  lots: Array<Lot & { ingredientId: string; locationId: string; quantity: number }>;
  ledger: LedgerRow[];
  initialAction?: 'transfer' | 'count' | 'waste';
  initialIngredientId?: string;
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}) {
  const [action, setAction] = useState<'transfer' | 'count' | 'waste'>(
    initialAction ?? 'transfer',
  );
  const [ingredientId, setIngredientId] = useState(
    () => initialIngredientId || stock[0]?.ingredient.id || ingredients[0]?.id || '',
  );
  const [lotId, setLotId] = useState('');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [reasonOrNote, setReasonOrNote] = useState('Xuất nguyên liệu sang trạm sơ chế bếp');

  useEffect(() => {
    if (initialAction) setAction(initialAction);
  }, [initialAction]);

  useEffect(() => {
    if (initialIngredientId) setIngredientId(initialIngredientId);
  }, [initialIngredientId]);

  const validLots = useMemo(
    () => lots.filter((lot) => lot.ingredientId === ingredientId && lot.quantity > 0),
    [lots, ingredientId],
  );
  const currentIngredientStock = useMemo(
    () => stock.filter((s) => s.ingredient.id === ingredientId && s.quantity > 0),
    [stock, ingredientId],
  );

  // Auto-select locations, quantity, and default reason when ingredient or action changes
  useEffect(() => {
    const sortedByQty = [...currentIngredientStock].sort((a, b) => b.quantity - a.quantity);
    const bestStockLocId =
      sortedByQty[0]?.location.id ??
      locations.find((l) => l.kind === 'STORAGE')?.id ??
      locations[0]?.id ??
      '';
    const prepLocId =
      locations.find((l) => l.id !== bestStockLocId && l.kind === 'PREP')?.id ??
      locations.find((l) => l.id !== bestStockLocId)?.id ??
      '';

    setFromLocationId(bestStockLocId);
    setToLocationId(prepLocId);
    setLocationId(bestStockLocId);
    setLotId('');

    const totalAtBestLoc = currentIngredientStock
      .filter((s) => s.location.id === bestStockLocId)
      .reduce((sum, s) => sum + s.quantity, 0);

    if (action === 'transfer') {
      setQuantity(String(totalAtBestLoc > 0 ? Math.max(1, Math.round(totalAtBestLoc * 0.5)) : 10));
      setReasonOrNote('Xuất nguyên liệu sang trạm sơ chế bếp ca sáng');
    } else if (action === 'count') {
      setQuantity(String(totalAtBestLoc));
      setReasonOrNote('Kiểm kê định kỳ chốt số tồn cuối ca');
    } else {
      setQuantity(String(totalAtBestLoc > 0 ? Math.max(1, Math.round(totalAtBestLoc * 0.1)) : 5));
      setReasonOrNote('Hết hạn sử dụng (FEFO) / Hao hụt chế biến');
    }
  }, [ingredientId, action, currentIngredientStock, locations]);

  const activeSourceLocationId = action === 'transfer' ? fromLocationId : locationId;
  const availableAtActiveLocation = useMemo(() => {
    return currentIngredientStock
      .filter((s) => s.location.id === activeSourceLocationId)
      .reduce((sum, s) => sum + s.quantity, 0);
  }, [currentIngredientStock, activeSourceLocationId]);

  const reasonPresets = useMemo(() => {
    if (action === 'transfer') {
      return [
        'Xuất nguyên liệu sang trạm sơ chế bếp ca sáng',
        'Tiếp thêm nguyên liệu cho bếp ca tối',
        'Hoàn trả nguyên liệu dư về kho bảo quản chính',
      ];
    }
    if (action === 'count') {
      return [
        'Kiểm kê định kỳ chốt số tồn cuối ca',
        'Kiểm kê đột xuất đối chiếu thực tế',
        'Cân chỉnh sai số định lượng tự nhiên',
      ];
    }
    return [
      'Hết hạn sử dụng (FEFO) theo quy định',
      'Hỏng bao bì / Rơi vãi trong quá trình sơ chế',
      'Cháy / Hao hụt khi chiên tại bếp',
    ];
  }, [action]);

  const filteredMovements = useMemo(() => {
    return ledger
      .filter((row) => {
        if (action === 'transfer')
          return row.type === 'TRANSFER_IN' || row.type === 'TRANSFER_OUT';
        if (action === 'count') return row.type === 'COUNT_ADJUSTMENT';
        return row.type === 'WASTE';
      })
      .slice(0, 15);
  }, [ledger, action]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const endpoint =
      action === 'transfer'
        ? '/inventory/transfers'
        : action === 'count'
          ? '/inventory/counts'
          : '/inventory/wastes';
    const successText =
      action === 'transfer'
        ? 'Đã thực hiện chuyển vị trí kho thành công!'
        : action === 'count'
          ? 'Đã cập nhật số đếm kiểm kê kho!'
          : 'Đã ghi nhận phiếu báo hỏng / hao hụt!';
    void run(async () => {
      const data: Record<string, unknown> = {
        storeId,
        ingredientId,
        lotId: lotId || undefined,
      };
      if (action === 'transfer')
        Object.assign(data, {
          fromLocationId,
          toLocationId,
          quantity: Number(quantity),
          note: reasonOrNote.trim() || undefined,
        });
      else if (action === 'count')
        Object.assign(data, {
          locationId,
          countedQuantity: Number(quantity),
          reason: reasonOrNote.trim() || 'Kiểm kê định kỳ',
        });
      else
        Object.assign(data, {
          locationId,
          quantity: Number(quantity),
          reason: reasonOrNote.trim() || 'Hao hụt chế biến',
        });
      await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(data) });
    }, successText);
  };

  return (
    <div className="space-y-6">
      {/* 3 Distinct Sub-Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setAction('transfer')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            action === 'transfer'
              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
              Nghiệp vụ 3A
            </span>
            <Badge variant="amber">Chuyển nội bộ</Badge>
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Chuyển Vị Trí (Kho chính → Bếp)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Xuất nguyên liệu từ Kho đông lạnh sang Trạm sơ chế bếp để chuẩn bị bán hàng
          </p>
        </button>

        <button
          type="button"
          onClick={() => setAction('count')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            action === 'count'
              ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
              Nghiệp vụ 3B
            </span>
            <Badge variant="secondary">Kiểm kê kho</Badge>
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Kiểm Kê & Chốt Số Tồn Thực Tế
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Nhập số lượng thực đếm cuối ngày/tuần để hệ thống tự động cân chỉnh chênh lệch
          </p>
        </button>

        <button
          type="button"
          onClick={() => setAction('waste')}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            action === 'waste'
              ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-rose-800">
              Nghiệp vụ 3C
            </span>
            <Badge variant="destructive">Báo hủy / Hỏng</Badge>
          </div>
          <h3 className="text-base font-extrabold text-slate-900">Ghi Nhận Hao Hụt & Hủy Hàng</h3>
          <p className="text-xs text-slate-500 mt-1">
            Trừ kho các lô nguyên liệu hết hạn, hỏng nhiệt, cháy dầu hoặc rơi vãi khi chế biến
          </p>
        </button>
      </div>

      {/* 2-Column Split: Left Action Form + Current Stock Reference | Right History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900">
              {action === 'transfer'
                ? 'Phiếu Điều Chuyển Vị Trí Kho (Tự động phân bổ lô FEFO)'
                : action === 'count'
                  ? 'Phiếu Kiểm Kê Số Đếm Thực Tế'
                  : 'Phiếu Báo Hỏng / Xuất Hủy Nguyên Liệu'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Vị trí kho đang có tồn, số lượng gợi ý và lý do mẫu được tự động điền sẵn — không cần
              chỉ định lô thủ công
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nguyên vật liệu <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Chọn nguyên vật liệu"
                  required
                  value={ingredientId}
                  onChange={(e) => setIngredientId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Chọn nguyên liệu --</option>
                  {ingredients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({unitLabel[item.unit]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Lô hàng (Tự động chọn lô hạn gần nhất FEFO)
                </label>
                <select
                  name="lotId"
                  aria-label="Chọn lô hàng"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">⚡ Tự động trừ theo lô FEFO (Khuyên dùng)</option>
                  {validLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lô: {lot.code} (Còn {lot.quantity})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Stock Reference Box for Selected Ingredient */}
            {ingredientId && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Số tồn hệ thống hiện tại (Nhấn vào vị trí để chọn nhanh):
                </span>
                {currentIngredientStock.length === 0 ? (
                  <p className="text-xs text-rose-600 font-semibold">
                    Nguyên liệu này hiện chưa có tồn kho tại bất kỳ vị trí nào.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {currentIngredientStock.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (action === 'transfer') setFromLocationId(s.location.id);
                          else setLocationId(s.location.id);
                          if (s.lot) setLotId(s.lot.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-amber-500 text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
                      >
                        <span className="text-amber-700 font-bold">{s.location.name}</span>
                        {s.lot ? <span className="text-slate-400">({s.lot.code})</span> : null}:
                        <span className="font-extrabold text-slate-900">
                          {formatQuantity(s.quantity, unitLabel[s.ingredient.unit])}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {action === 'transfer' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Từ vị trí nguồn <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="fromLocationId"
                      required
                      value={fromLocationId}
                      onChange={(e) => setFromLocationId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                    >
                      <option disabled value="">
                        -- Chọn kho xuất --
                      </option>
                      {locations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Sang vị trí đích <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="toLocationId"
                      required
                      value={toLocationId}
                      onChange={(e) => setToLocationId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                    >
                      <option disabled value="">
                        -- Chọn kho nhận --
                      </option>
                      {locations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Tại vị trí kho <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="locationId"
                    required
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option disabled value="">
                      -- Chọn vị trí kho --
                    </option>
                    {locations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700">
                    {action === 'count'
                      ? 'Số lượng thực đếm hiện tại *'
                      : action === 'transfer'
                        ? 'Số lượng chuyển *'
                        : 'Số lượng báo hỏng / hủy *'}
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {availableAtActiveLocation > 0 && (
                      <>
                        {[
                          { label: '25% tồn', pct: 0.25 },
                          { label: '50% tồn', pct: 0.5 },
                          { label: 'Tất cả tồn', pct: 1 },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                              setQuantity(
                                String(Math.max(1, Math.round(availableAtActiveLocation * p.pct))),
                              )
                            }
                            className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-bold hover:bg-amber-100 cursor-pointer"
                          >
                            {p.label} ({Math.max(1, Math.round(availableAtActiveLocation * p.pct))})
                          </button>
                        ))}
                      </>
                    )}
                    {[10, 50, 100, 500].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuantity(String(val))}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  name="quantity"
                  required
                  min="0"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Nhập số lượng..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700">
                  {action === 'transfer' ? 'Ghi chú điều chuyển' : 'Lý do nghiệp vụ (Chọn nhanh) *'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {reasonPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReasonOrNote(preset)}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-amber-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                name={action === 'transfer' ? 'note' : 'reason'}
                required={action !== 'transfer'}
                value={reasonOrNote}
                onChange={(e) => setReasonOrNote(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy || !ingredientId}
                className={`px-6 h-11 rounded-xl font-bold text-xs text-white transition-colors cursor-pointer disabled:opacity-50 shadow-xs ${
                  action === 'transfer'
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : action === 'count'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {busy
                  ? 'Đang xử lý...'
                  : action === 'transfer'
                    ? 'Xác Nhận Chuyển Vị Trí Kho'
                    : action === 'count'
                      ? 'Chốt Số Đếm Kiểm Kê'
                      : 'Xác Nhận Ghi Nhận Hao Hụt'}
              </button>
            </div>
          </form>
        </div>

        {/* Right: History of selected movement type */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">
              {action === 'transfer'
                ? 'Lịch sử chuyển vị trí gần đây'
                : action === 'count'
                  ? 'Lịch sử kiểm kê cân chỉnh gần đây'
                  : 'Lịch sử báo hỏng / hao hụt gần đây'}
            </h3>
            <p className="text-xs text-slate-500">
              Hiển thị 15 giao dịch gần nhất của nghiệp vụ đang chọn
            </p>
          </div>
          {filteredMovements.length === 0 ? (
            <p className="text-xs text-slate-400 py-10 text-center">
              Chưa có giao dịch nào cho nghiệp vụ này.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {filteredMovements.map((entry) => (
                <div key={entry.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {entry.ingredient.name}{' '}
                      <span className="font-normal text-slate-500">({entry.location.name})</span>
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {entry.note || ledgerLabel[entry.type]}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {formatDateTime(entry.occurredAt)}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-extrabold shrink-0 ${
                      entry.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {entry.quantity > 0 ? '+' : ''}
                    {formatQuantity(entry.quantity, unitLabel[entry.ingredient.unit])}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. TAB SỔ CÁI BIẾN ĐỘNG KHO (FULL LEDGER AUDIT)
 * ========================================================================== */
function LedgerTab({
  ledger,
  ingredients,
  locations,
}: {
  ledger: LedgerRow[];
  ingredients: Ingredient[];
  locations: Location[];
}) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [ingredientFilter, setIngredientFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredLedger = useMemo(() => {
    return ledger.filter((row) => {
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'TRANSFER') {
          if (row.type !== 'TRANSFER_IN' && row.type !== 'TRANSFER_OUT') return false;
        } else if (row.type !== typeFilter) {
          return false;
        }
      }
      if (ingredientFilter !== 'ALL' && row.ingredient.id !== ingredientFilter) return false;
      if (locationFilter !== 'ALL' && row.location.id !== locationFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchIng = row.ingredient.name.toLowerCase().includes(q);
        const matchNote = row.note?.toLowerCase().includes(q) ?? false;
        if (!matchIng && !matchNote) return false;
      }
      return true;
    });
  }, [ledger, typeFilter, ingredientFilter, locationFilter, search]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Sổ Cái Biến Động Kho & Nhật Ký Thẻ Kho (Inventory Ledger)
            </h2>
            <p className="text-xs text-slate-500">
              Truy vết toàn bộ lịch sử Nhập hàng, Tự động trừ kho theo đơn POS (BOM), Chuyển kho,
              Kiểm kê và Báo hủy
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
            Hiển thị {filteredLedger.length}/{ledger.length} bút toán
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'RECEIPT', label: 'Nhập hàng' },
              { key: 'CONSUMPTION', label: 'Trừ kho BOM' },
              { key: 'TRANSFER', label: 'Chuyển kho' },
              { key: 'COUNT_ADJUSTMENT', label: 'Kiểm kê' },
              { key: 'WASTE', label: 'Báo hủy' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  typeFilter === t.key
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Lọc theo nguyên liệu"
            value={ingredientFilter}
            onChange={(e) => setIngredientFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="ALL">Tất cả nguyên liệu</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo vị trí kho"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="ALL">Tất cả vị trí kho</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo ghi chú, mã đơn, nguyên liệu..."
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {filteredLedger.length === 0 ? (
        <p className="text-xs text-slate-400 py-12 text-center">
          Không có bút toán biến động kho nào khớp với bộ lọc.
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-5 py-3.5">Thời gian ghi sổ</th>
                <th className="px-4 py-3.5">Loại nghiệp vụ</th>
                <th className="px-4 py-3.5">Nguyên vật liệu</th>
                <th className="px-4 py-3.5">Vị trí kho</th>
                <th className="px-4 py-3.5">Diễn giải / Ghi chú</th>
                <th className="px-5 py-3.5 text-right">Lượng biến động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLedger.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                    {formatDateTime(entry.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${
                        ledgerBadgeColor[entry.type] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ledgerLabel[entry.type] ?? entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900">{entry.ingredient.name}</span>
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      ({entry.ingredient.sku})
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{entry.location.name}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.note || '—'}</td>
                  <td
                    className={`px-5 py-3 text-right font-extrabold text-sm whitespace-nowrap ${
                      entry.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {entry.quantity > 0 ? '+' : ''}
                    {formatQuantity(entry.quantity, unitLabel[entry.ingredient.unit])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 5. TAB ĐỊNH MỨC CÔNG THỨC MÓN (BOM RECIPES)
 * ========================================================================== */
function RecipeTab({
  storeId,
  products,
  ingredients,
  recipes,
  busy,
  run,
}: {
  storeId: string;
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}) {
  const [productId, setProductId] = useState('');
  const [lines, setLines] = useState([{ ingredientId: '', quantity: '' }]);
  const [recipeSearch, setRecipeSearch] = useState('');

  const activeRecipes = useMemo(() => {
    return recipes
      .filter((r) => r.isActive)
      .filter((r) =>
        recipeSearch.trim()
          ? r.product.name.toLowerCase().includes(recipeSearch.trim().toLowerCase())
          : true,
      );
  }, [recipes, recipeSearch]);

  const handleSelectProduct = (nextProductId: string) => {
    setProductId(nextProductId);
    const existing = recipes.find((r) => r.isActive && r.product.id === nextProductId);
    if (existing && existing.lines.length > 0) {
      setLines(
        existing.lines.map((l) => ({
          ingredientId: l.ingredient.id,
          quantity: String(l.quantity),
        })),
      );
    } else {
      setLines([{ ingredientId: '', quantity: '' }]);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/recipes', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          productId,
          lines: lines.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: Number(line.quantity),
          })),
        }),
      });
      setProductId('');
      setLines([{ ingredientId: '', quantity: '' }]);
    }, 'Đã lưu định mức công thức món (BOM)!');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 5 Cols: BOM Editor */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
        <div>
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            Thiết lập BOM (Bill of Materials)
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
            Định Mức Nguyên Liệu Cho Món Ăn
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Khi thu ngân POS thanh toán 1 phần món ăn, hệ thống tự động trừ kho theo định mức này
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Chọn món ăn / Combo trên thực đơn <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={productId}
              onChange={(event) => handleSelectProduct(event.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="">-- Chọn món ăn cần gán công thức --</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Thành phần nguyên liệu tiêu hao / 1 phần bán
              </span>
              <button
                type="button"
                onClick={() =>
                  setLines((current) => [...current, { ingredientId: '', quantity: '' }])
                }
                className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
              >
                + Thêm nguyên liệu
              </button>
            </div>

            {lines.map((line, index) => {
              const ing = ingredients.find((i) => i.id === line.ingredientId);
              return (
                <div key={index} className="flex items-center gap-2">
                  <select
                    aria-label="Chọn nguyên liệu cấu thành"
                    required
                    value={line.ingredientId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, ingredientId: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Nguyên liệu --</option>
                    {ingredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name} ({unitLabel[ingredient.unit]})
                      </option>
                    ))}
                  </select>

                  <div className="relative w-32">
                    <input
                      required
                      min="1"
                      type="number"
                      placeholder="Định mức"
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, quantity: event.target.value } : item,
                          ),
                        )
                      }
                      className="w-full h-9 pl-2.5 pr-8 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                    {ing && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                        {unitLabel[ing.unit]}
                      </span>
                    )}
                  </div>

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="size-9 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            type="submit"
            disabled={busy || !productId}
            className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer"
          >
            {busy ? 'Đang lưu công thức...' : 'Lưu Định Mức Công Thức (Tạo Phiên Bản Mới)'}
          </Button>
        </form>
      </div>

      {/* Right 7 Cols: Active BOM List */}
      <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Bảng Định Mức BOM Đang Áp Dụng ({activeRecipes.length} món)
            </h3>
            <p className="text-xs text-slate-500">
              Nhấn &quot;Sửa định mức&quot; trên từng món để nạp nhanh vào biểu mẫu bên trái
            </p>
          </div>
          <div className="relative w-full sm:w-60">
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
              placeholder="Tìm tên món ăn..."
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {activeRecipes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-12">
            Chưa có món ăn nào được thiết lập định mức BOM.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {activeRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">
                      {recipe.product.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                      Phiên bản v{recipe.version}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recipe.lines.map((line) => (
                      <span
                        key={line.id}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium"
                      >
                        <span>{line.ingredient.name}:</span>
                        <strong className="text-slate-900">
                          {line.quantity} {unitLabel[line.ingredient.unit]}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleSelectProduct(recipe.product.id)}
                  className="shrink-0 text-xs font-semibold gap-1.5 cursor-pointer self-start sm:self-center"
                >
                  <Edit3 className="size-3.5" />
                  <span>Sửa định mức</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. TAB DANH MỤC NGUYÊN LIỆU, VỊ TRÍ KHO & NHÀ CUNG CẤP
 * ========================================================================== */
function slugToSku(name: string) {
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

function SetupTab({
  storeId,
  suppliers,
  locations,
  ingredients,
  busy,
  run,
}: {
  storeId: string;
  suppliers: Supplier[];
  locations: Location[];
  ingredients: Ingredient[];
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}) {
  const [ingName, setIngName] = useState('');
  const [ingSku, setIngSku] = useState('');
  const [ingUnit, setIngUnit] = useState<Ingredient['unit']>('GRAM');
  const [ingLowStock, setIngLowStock] = useState('1000');

  const [locName, setLocName] = useState('');
  const [locKind, setLocKind] = useState<Location['kind']>('STORAGE');

  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');

  const submitIngredient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          sku: ingSku.trim() || slugToSku(ingName) || undefined,
          name: ingName.trim(),
          unit: ingUnit,
          lowStockQuantity: ingLowStock === '' ? undefined : Number(ingLowStock),
        }),
      });
      setIngName('');
      setIngSku('');
      setIngLowStock(ingUnit === 'EACH' ? '50' : '1000');
    }, 'Đã lưu nguyên vật liệu thành công!');
  };

  const submitLocation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/locations', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: locName.trim(),
          kind: locKind,
        }),
      });
      setLocName('');
    }, 'Đã lưu vị trí kho thành công!');
  };

  const submitSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: supName.trim(),
          phone: supPhone.trim() || undefined,
          note: supEmail.trim() || undefined,
        }),
      });
      setSupName('');
      setSupPhone('');
      setSupEmail('');
    }, 'Đã lưu nhà cung cấp thành công!');
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Ingredients Master Table & Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              Danh mục chuẩn (Master Data)
            </span>
            <h2 className="text-lg font-extrabold text-slate-900">
              Danh Mục Nguyên Vật Liệu ({ingredients.length})
            </h2>
            <p className="text-xs text-slate-500">
              Mã SKU được tự động sinh khi gõ tên nguyên liệu (hoặc chọn từ gợi ý 1 chạm bên dưới)
            </p>
          </div>
        </div>

        {/* 1-Click Quick Templates for QSR Ingredients */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-500 mr-1">⚡ Chọn mẫu nhanh:</span>
          {[
            { name: 'Đùi gà tươi ướp sẵn', unit: 'GRAM' as const, low: '2000' },
            { name: 'Cánh gà tươi', unit: 'GRAM' as const, low: '2000' },
            { name: 'Bột chiên giòn Hàn Quốc', unit: 'GRAM' as const, low: '3000' },
            { name: 'Dầu thực vật chuyên chiên', unit: 'MILLILITER' as const, low: '5000' },
            { name: 'Khoai tây cọng đông lạnh', unit: 'GRAM' as const, low: '2500' },
            { name: 'Vỏ bánh Burger Brioche', unit: 'EACH' as const, low: '40' },
            { name: 'Hộp giấy đựng gà mang về', unit: 'EACH' as const, low: '100' },
          ].map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => {
                setIngName(tpl.name);
                setIngSku(slugToSku(tpl.name));
                setIngUnit(tpl.unit);
                setIngLowStock(tpl.low);
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-semibold text-[11px] cursor-pointer transition-colors"
            >
              + {tpl.name}
            </button>
          ))}
        </div>

        <form
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200/80"
          onSubmit={submitIngredient}
        >
          <input
            required
            name="name"
            value={ingName}
            onChange={(e) => {
              const val = e.target.value;
              setIngName(val);
              setIngSku(slugToSku(val));
            }}
            placeholder="Tên nguyên liệu (VD: Đùi gà tươi) *"
            className="h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
          />
          <input
            name="sku"
            value={ingSku}
            onChange={(e) => setIngSku(e.target.value)}
            placeholder="Mã SKU (Tự động sinh)"
            className="h-10 px-3 rounded-lg border border-slate-200 text-xs font-mono font-semibold bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
          />
          <select
            name="unit"
            aria-label="Đơn vị tính"
            value={ingUnit}
            onChange={(e) => {
              const nextUnit = e.target.value as Ingredient['unit'];
              setIngUnit(nextUnit);
              setIngLowStock(nextUnit === 'EACH' ? '50' : '1000');
            }}
            className="h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
          >
            <option value="GRAM">Gam (g)</option>
            <option value="MILLILITER">Mililit (ml)</option>
            <option value="EACH">Cái / Miếng</option>
          </select>
          <input
            name="lowStockQuantity"
            min="0"
            type="number"
            value={ingLowStock}
            onChange={(e) => setIngLowStock(e.target.value)}
            placeholder="Ngưỡng cảnh báo tồn tối thiểu"
            className="h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
          >
            + Lưu nguyên liệu
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {ingredients.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-xs truncate">{item.name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold block">
                  ĐVT: {unitLabel[item.unit]}
                </span>
                {item.lowStockQuantity != null && (
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Tối thiểu: {item.lowStockQuantity} {unitLabel[item.unit]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Locations & Suppliers Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Locations */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Warehouse className="size-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Vị Trí Lưu Kho & Trạm Sơ Chế ({locations.length})
              </h3>
              <p className="text-xs text-slate-500">
                Phân tách giữa Kho bảo quản chính và Trạm sơ chế tại bếp
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { name: 'Kho đông lạnh chính', kind: 'STORAGE' as const },
              { name: 'Kho khô & Bao bì', kind: 'STORAGE' as const },
              { name: 'Trạm sơ chế bếp chính', kind: 'PREP' as const },
            ].map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => {
                  setLocName(tpl.name);
                  setLocKind(tpl.kind);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                + {tpl.name}
              </button>
            ))}
          </div>

          <form className="flex flex-col sm:flex-row gap-2" onSubmit={submitLocation}>
            <input
              required
              name="name"
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              placeholder="Tên vị trí (VD: Kho lạnh số 1) *"
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
            />
            <select
              name="kind"
              aria-label="Loại vị trí kho"
              value={locKind}
              onChange={(e) => setLocKind(e.target.value as Location['kind'])}
              className="h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="STORAGE">Kho lưu trữ chính</option>
              <option value="PREP">Trạm sơ chế bếp</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors shrink-0"
            >
              + Lưu vị trí
            </button>
          </form>

          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {locations.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs"
              >
                <span className="font-bold text-slate-800">{item.name}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    item.kind === 'STORAGE'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {item.kind === 'STORAGE' ? 'Kho lưu trữ chính' : 'Trạm sơ chế bếp'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Suppliers */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Truck className="size-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Đối Tác Nhà Cung Cấp ({suppliers.length})
              </h3>
              <p className="text-xs text-slate-500">
                Đơn vị cung ứng gà tươi, bột chiên, dầu ăn và bao bì
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { name: 'CP Fresh Food Việt Nam', phone: '0901888999', email: 'b2b@cp.com.vn' },
              { name: 'Thực phẩm Á Châu QSR', phone: '0902777888', email: 'sales@achaufood.vn' },
              { name: 'Bao bì Xanh Sài Gòn', phone: '0903666777', email: 'order@baobixanh.vn' },
            ].map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => {
                  setSupName(tpl.name);
                  setSupPhone(tpl.phone);
                  setSupEmail(tpl.email);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                + {tpl.name}
              </button>
            ))}
          </div>

          <form className="space-y-2.5" onSubmit={submitSupplier}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                required
                name="name"
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Tên nhà cung cấp *"
                className="h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
              <input
                name="phone"
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                placeholder="Số điện thoại"
                className="h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
              <input
                name="email"
                type="email"
                value={supEmail}
                onChange={(e) => setSupEmail(e.target.value)}
                placeholder="Email liên hệ"
                className="h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
            >
              + Lưu nhà cung cấp
            </button>
          </form>

          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {suppliers.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs"
              >
                <span className="font-bold text-slate-800">{item.name}</span>
                <span className="text-slate-500 font-medium">
                  {item.phone || item.note || item.email || 'Chưa cập nhật liên hệ'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
