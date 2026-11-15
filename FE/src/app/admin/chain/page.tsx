'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Store as StoreIcon,
  Layers,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Clock,
  UtensilsCrossed,
  Boxes,
  ExternalLink,
  Settings2,
  Sparkles,
  CopyCheck,
  MonitorSmartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, getActor, type Actor } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type IngredientStockItem = {
  id: string;
  name: string;
  sku: string;
  unit: 'GRAM' | 'MILLILITER' | 'EACH';
  quantity: number;
  lowStockQuantity: number | null;
};

type ChainStoreMetric = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  openingTime: string;
  closingTime: string;
  timezone: string;
  taxRate: number;
  cashRegisters: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  members: Array<{ id: string; email: string; role: string; isActive: boolean }>;
  revenue: number;
  orderCount: number;
  aov: number;
  unpaidOrdersCount: number;
  unpaidAmount: number;
  tablesCount: number;
  occupiedTablesCount: number;
  reservedTablesCount: number;
  productsCount: number;
  ingredientsCount: number;
  recipesCount: number;
  lowStockCount: number;
  ingredientStocks: IngredientStockItem[];
};

type ChainOverviewData = {
  range: string;
  summary: {
    totalStores: number;
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalTables: number;
    occupiedTables: number;
    lowStockAlertsCount: number;
  };
  stores: ChainStoreMetric[];
};

type UserItem = { id: string; email: string; role: string; isActive: boolean };

type SyncResult = {
  sourceStoreId: string;
  targetCount: number;
  categoriesSynced: number;
  optionGroupsSynced: number;
  productsSynced: number;
  ingredientsSynced: number;
  recipesSynced: number;
  tablesSynced: number;
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const unitLabels: Record<string, string> = {
  GRAM: 'g',
  MILLILITER: 'ml',
  EACH: 'cái',
};

export default function ChainManagementPage() {
  const router = useRouter();
  const { currentStoreId, setCurrentStoreId, refreshStores } = useActiveStore();

  const [actor, setActor] = useState<Actor | null>(null);
  const [overview, setOverview] = useState<ChainOverviewData | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month'>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'transfer' | 'create'>(
    'overview',
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Sync Tab State
  const [sourceStoreId, setSourceStoreId] = useState('');
  const [targetStoreIds, setTargetStoreIds] = useState<string[]>([]);
  const [syncCatalog, setSyncCatalog] = useState(true);
  const [syncIngredients, setSyncIngredients] = useState(true);
  const [syncRecipes, setSyncRecipes] = useState(true);
  const [syncTables, setSyncTables] = useState(true);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Inter-Store Transfer State
  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [transferIngredientId, setTransferIngredientId] = useState('');
  const [transferQty, setTransferQty] = useState('500');
  const [transferNote, setTransferNote] = useState(
    'Điều chuyển nguyên vật liệu bổ sung giữa các cơ sở trong chuỗi',
  );

  // Create Store State
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('');
  const [newStoreOpening, setNewStoreOpening] = useState('08:00');
  const [newStoreClosing, setNewStoreClosing] = useState('22:00');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [cloneFromStoreId, setCloneFromStoreId] = useState('');

  // Edit Store & Register Modal State
  const [editingStore, setEditingStore] = useState<ChainStoreMetric | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editOpening, setEditOpening] = useState('08:00');
  const [editClosing, setEditClosing] = useState('22:00');
  const [newRegCode, setNewRegCode] = useState('');
  const [newRegName, setNewRegName] = useState('');

  const loadData = useCallback(
    async (selectedRange = range) => {
      setLoading(true);
      try {
        const currentActor = await getActor();
        setActor(currentActor);
        if (!currentActor.isPlatformAdmin) return;

        const [chainData, userList] = await Promise.all([
          apiRequest<ChainOverviewData>(`/stores/chain-overview?range=${selectedRange}`),
          apiRequest<UserItem[]>('/users').catch(() => []),
        ]);

        setOverview(chainData);
        const activeAdmins = userList.filter((u) => u.isActive);
        setUsers(activeAdmins);

        if (chainData.stores.length > 0) {
          const mainStore =
            chainData.stores.find((s) => s.name === 'Chick Res Main') ?? chainData.stores[0];
          setSourceStoreId((prev) => prev || mainStore.id);
          setCloneFromStoreId((prev) => prev || mainStore.id);
          setFromStoreId((prev) => prev || mainStore.id);

          const otherStores = chainData.stores
            .filter((s) => s.id !== mainStore.id)
            .map((s) => s.id);
          setTargetStoreIds((prev) => (prev.length > 0 ? prev : otherStores));
          if (otherStores[0]) {
            setToStoreId((prev) => prev || otherStores[0]);
          }
          if (mainStore.ingredientStocks[0]) {
            setTransferIngredientId((prev) => prev || mainStore.ingredientStocks[0].id);
          }
        }
        if (activeAdmins[0]) {
          setOwnerUserId((prev) => prev || activeAdmins[0].id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không thể tải dữ liệu chuỗi cửa hàng.');
      } finally {
        setLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    void loadData(range);
  }, [range, loadData]);

  const fromStoreObj = useMemo(
    () => overview?.stores.find((s) => s.id === fromStoreId) ?? null,
    [overview, fromStoreId],
  );

  useEffect(() => {
    if (fromStoreObj && fromStoreObj.ingredientStocks.length > 0) {
      const exists = fromStoreObj.ingredientStocks.some((i) => i.id === transferIngredientId);
      if (!exists) {
        setTransferIngredientId(fromStoreObj.ingredientStocks[0].id);
      }
    }
  }, [fromStoreObj, transferIngredientId]);

  const selectedTransferIngredient = useMemo(
    () => fromStoreObj?.ingredientStocks.find((i) => i.id === transferIngredientId) ?? null,
    [fromStoreObj, transferIngredientId],
  );

  const handleSwitchAndNavigate = (storeId: string, destination: string) => {
    setCurrentStoreId(storeId);
    const targetStore = overview?.stores.find((s) => s.id === storeId);
    toast.success(`Đã chuyển sang điều hành chi nhánh: ${targetStore?.name ?? ''}`);
    router.push(destination);
  };

  const handleSyncStores = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceStoreId || targetStoreIds.length === 0) {
      toast.warning('Vui lòng chọn cửa hàng mẫu và ít nhất 1 chi nhánh nhận đồng bộ.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<SyncResult>('/stores/sync', {
        method: 'POST',
        body: JSON.stringify({
          sourceStoreId,
          targetStoreIds,
          syncCatalog,
          syncIngredients,
          syncRecipes,
          syncTables,
        }),
      });
      setLastSyncResult(res);
      toast.success(
        `Đồng bộ thành công sang ${res.targetCount} chi nhánh (${res.productsSynced} món, ${res.ingredientsSynced} nguyên liệu, ${res.recipesSynced} BOM)!`,
      );
      await loadData(range);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi đồng bộ dữ liệu chuỗi.');
    } finally {
      setBusy(false);
    }
  };

  const handleInterStoreTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromStoreId || !toStoreId || !transferIngredientId) {
      toast.warning('Vui lòng chọn đầy đủ chi nhánh xuất, chi nhánh nhận và nguyên vật liệu.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{
        fromStore: string;
        toStore: string;
        ingredientName: string;
        quantity: number;
        unit: string;
        lotCode: string;
      }>('/stores/inter-transfer', {
        method: 'POST',
        body: JSON.stringify({
          fromStoreId,
          toStoreId,
          ingredientId: transferIngredientId,
          quantity: Number(transferQty),
          note: transferNote,
        }),
      });
      toast.success(
        `Đã chuyển ${res.quantity} ${unitLabels[res.unit] ?? res.unit} ${res.ingredientName} từ ${res.fromStore} sang ${res.toStore} (Lô ${res.lotCode})!`,
      );
      await loadData(range);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể điều chuyển kho liên chi nhánh.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim() || !ownerUserId) {
      toast.warning('Vui lòng nhập tên chi nhánh và chọn người phụ trách.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: newStoreName.trim(),
          address: newStoreAddress.trim() || undefined,
          phone: newStorePhone.trim() || undefined,
          openingTime: newStoreOpening,
          closingTime: newStoreClosing,
          ownerUserId,
          syncFromStoreId: cloneFromStoreId || undefined,
        }),
      });
      toast.success(
        `Đã khai trương chi nhánh "${newStoreName.trim()}" và đồng bộ dữ liệu thành công!`,
      );
      setNewStoreName('');
      setNewStoreAddress('');
      setNewStorePhone('');
      await refreshStores();
      await loadData(range);
      setActiveTab('overview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo chi nhánh mới.');
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (store: ChainStoreMetric) => {
    setEditingStore(store);
    setEditName(store.name);
    setEditAddress(store.address ?? '');
    setEditPhone(store.phone ?? '');
    setEditOpening(store.openingTime ?? '08:00');
    setEditClosing(store.closingTime ?? '22:00');
    setNewRegCode('');
    setNewRegName('');
  };

  const handleSaveStoreInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;
    setBusy(true);
    try {
      await apiRequest(`/stores/${editingStore.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          address: editAddress.trim(),
          phone: editPhone.trim(),
          openingTime: editOpening,
          closingTime: editClosing,
        }),
      });
      toast.success('Đã cập nhật thông tin chi nhánh!');
      await refreshStores();
      await loadData(range);
      setEditingStore(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật chi nhánh.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore || !newRegCode.trim() || !newRegName.trim()) return;
    setBusy(true);
    try {
      await apiRequest('/stores/registers', {
        method: 'POST',
        body: JSON.stringify({
          storeId: editingStore.id,
          code: newRegCode.trim().toUpperCase(),
          name: newRegName.trim(),
        }),
      });
      toast.success('Đã thêm máy thu ngân mới cho chi nhánh!');
      setNewRegCode('');
      setNewRegName('');
      await loadData(range);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể thêm máy thu ngân.');
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !actor?.isPlatformAdmin) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-rose-200 text-center space-y-3">
        <ShieldCheck className="size-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-extrabold text-slate-900">
          Khu Vực Dành Riêng Cho Chủ Chuỗi (Super Admin)
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Bạn cần đăng nhập bằng tài khoản cấp cao nhất (<strong>superadmin@chickres.local</strong>)
          để xem tổng quan toàn chuỗi, điều hành đa cửa hàng và đồng bộ dữ liệu liên chi nhánh.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Hero Banner & Time Range Filter */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 rounded-2xl p-6 text-white shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[11px] font-bold">
            <ShieldCheck className="size-3.5" />
            <span>TRUNG TÂM ĐIỀU HÀNH CHUỖI ĐA CỬA HÀNG (SUPER ADMIN)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Tổng Quan Hệ Thống & Đồng Bộ Chuỗi Chick Res
          </h1>
          <p className="text-xs text-slate-300">
            Giám sát doanh thu toàn chuỗi, chuyển đổi điều hành từng cơ sở, đồng bộ Thực đơn / BOM và
            điều chuyển nguyên liệu liên chi nhánh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-white/10 p-1 backdrop-blur">
            {(
              [
                { key: 'today', label: 'Hôm nay' },
                { key: '7d', label: '7 ngày' },
                { key: '30d', label: '30 ngày' },
                { key: 'month', label: 'Tháng này' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  range === item.key
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(range)}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs h-9"
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* 4 Chain-Wide Executive KPI Cards */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tổng Doanh Thu Toàn Chuỗi
              </span>
              <div className="size-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {money.format(overview.summary.totalRevenue)}
            </p>
            <p className="text-xs text-slate-500">
              Từ <strong className="text-slate-800">{overview.summary.totalOrders}</strong> đơn hoàn
              thành • AOV: <strong>{money.format(overview.summary.averageOrderValue)}</strong>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Quy Mô Hệ Thống Cửa Hàng
              </span>
              <div className="size-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <StoreIcon className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {overview.summary.totalStores} chi nhánh
            </p>
            <p className="text-xs text-slate-500">
              Đang chọn điều hành:{' '}
              <strong className="text-amber-700">
                {overview.stores.find((s) => s.id === currentStoreId)?.name ?? 'Chick Res Main'}
              </strong>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Công Suất Bàn Toàn Chuỗi
              </span>
              <div className="size-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <UtensilsCrossed className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {overview.summary.occupiedTables} / {overview.summary.totalTables} bàn
            </p>
            <p className="text-xs text-slate-500">
              Đang có khách ngồi dùng bữa trên toàn hệ thống
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Cảnh Báo Tồn Kho Toàn Chuỗi
              </span>
              <div className="size-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-rose-600">
              {overview.summary.lowStockAlertsCount} mặt hàng
            </p>
            <p className="text-xs text-slate-500">
              Dưới định mức tối thiểu cần điều chuyển hoặc nhập bổ sung
            </p>
          </div>
        </div>
      )}

      {/* Functional Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-1.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            {
              key: 'overview',
              label: '1. Bảng Điều Hành & So Sánh Các Cửa Hàng',
              icon: Building2,
            },
            {
              key: 'transfer',
              label: '2. Điều Chuyển Kho Liên Chi Nhánh',
              icon: ArrowLeftRight,
            },
            {
              key: 'create',
              label: '3. Mở Chi Nhánh Mới',
              icon: Plus,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-[11px] font-semibold text-indigo-900 flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-indigo-600 shrink-0" />
          <span>
            Menu, Nguyên liệu & BOM: <strong>Admin</strong> thêm/sửa sẽ tự động áp dụng toàn chuỗi •{' '}
            <strong>Manager</strong> thêm/sửa chỉ áp dụng tại chi nhánh
          </span>
        </div>
      </div>

      {/* TAB 1: STORE-BY-STORE OVERVIEW & MANAGEMENT */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {overview.stores.map((store, idx) => {
              const isCurrent = store.id === currentStoreId;
              const revenueShare =
                overview.summary.totalRevenue > 0
                  ? Math.round((store.revenue / overview.summary.totalRevenue) * 100)
                  : 0;

              return (
                <div
                  key={store.id}
                  className={`rounded-2xl border bg-white p-6 shadow-2xs flex flex-col justify-between space-y-5 transition-all ${
                    isCurrent
                      ? 'border-amber-500 ring-2 ring-amber-500/20'
                      : 'border-slate-200/90 hover:border-amber-300'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Store Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="size-11 rounded-2xl bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-extrabold text-slate-900">
                              {store.name}
                            </h3>
                            {isCurrent && (
                              <Badge className="bg-emerald-600 text-white text-[10px]">
                                Đang chọn điều hành
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                            {store.address && (
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3.5 text-slate-400" />
                                {store.address}
                              </span>
                            )}
                            {store.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3.5 text-slate-400" />
                                {store.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5 text-slate-400" />
                              {store.openingTime} - {store.closingTime}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(store)}
                        className="text-xs h-8 shrink-0"
                      >
                        <Settings2 className="size-3.5 mr-1" />
                        Cấu hình
                      </Button>
                    </div>

                    {/* Financial & Operational Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Doanh thu ({revenueShare}%)
                        </span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                          {money.format(store.revenue)}
                        </span>
                        <span className="text-[11px] text-emerald-700 font-semibold">
                          {store.orderCount} đơn hoàn tất
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Trung bình đơn (AOV)
                        </span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                          {money.format(store.aov)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {store.unpaidOrdersCount > 0 ? (
                            <strong className="text-rose-600">
                              {store.unpaidOrdersCount} đơn chờ thu
                            </strong>
                          ) : (
                            'Không có đơn nợ'
                          )}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Sơ đồ bàn & Thực đơn
                        </span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                          {store.occupiedTablesCount}/{store.tablesCount} bàn có khách
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {store.productsCount} món • {store.recipesCount} BOM
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Kho nguyên vật liệu
                        </span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">
                          {store.ingredientsCount} nguyên liệu
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            store.lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {store.lowStockCount > 0
                            ? `⚠️ ${store.lowStockCount} mặt hàng sắp hết`
                            : '✓ Tồn kho an toàn'}
                        </span>
                      </div>
                    </div>

                    {/* Registers & Staff */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 bg-slate-50/70 px-3.5 py-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MonitorSmartphone className="size-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700">Máy POS:</span>
                        {store.cashRegisters.map((reg) => (
                          <span
                            key={reg.id}
                            className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-mono font-bold text-slate-700"
                          >
                            {reg.code} ({reg.name})
                          </span>
                        ))}
                      </div>
                      <span>Nhân sự gán quyền: {store.members.length} tài khoản</span>
                    </div>
                  </div>

                  {/* Quick Jump Actions for this Store */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleSwitchAndNavigate(store.id, '/admin')}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-8"
                      >
                        <ExternalLink className="size-3.5 mr-1.5" />
                        Dashboard chi nhánh
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSwitchAndNavigate(store.id, '/pos')}
                        className="text-xs h-8"
                      >
                        Quầy POS
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSwitchAndNavigate(store.id, '/admin/inventory/stock')}
                        className="text-xs h-8"
                      >
                        Kho hàng
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSwitchAndNavigate(store.id, '/admin/tables')}
                        className="text-xs h-8"
                      >
                        Sơ đồ bàn
                      </Button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const main =
                          overview.stores.find((s) => s.id !== store.id) ?? overview.stores[0];
                        if (main && main.id !== store.id) {
                          setSourceStoreId(main.id);
                          setTargetStoreIds([store.id]);
                          setActiveTab('sync');
                        }
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                    >
                      Đồng bộ Menu & BOM &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CHAIN CATALOG, INGREDIENT & BOM SYNCHRONIZATION */}
      {activeTab === 'sync' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <CopyCheck className="size-5 text-amber-600" />
                <span>Đồng Bộ Thực Đơn, Giá Bán, Nguyên Liệu & Định Mức BOM</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sao chép chuẩn hóa dữ liệu từ Cửa hàng mẫu sang các chi nhánh khác trong chuỗi chỉ
                với 1 thao tác
              </p>
            </div>

            <form onSubmit={handleSyncStores} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  1. Chọn Cửa hàng chuẩn (Chi nhánh gốc làm mẫu) <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Chọn cửa hàng nguồn"
                  value={sourceStoreId}
                  onChange={(e) => {
                    const nextSource = e.target.value;
                    setSourceStoreId(nextSource);
                    setTargetStoreIds((prev) => prev.filter((id) => id !== nextSource));
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                >
                  {overview.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.productsCount} món • {s.ingredientsCount} nguyên liệu •{' '}
                      {s.recipesCount} BOM)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    2. Chọn Chi nhánh nhận đồng bộ <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setTargetStoreIds(
                        overview.stores.filter((s) => s.id !== sourceStoreId).map((s) => s.id),
                      )
                    }
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 cursor-pointer"
                  >
                    Chọn tất cả chi nhánh khác
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {overview.stores
                    .filter((s) => s.id !== sourceStoreId)
                    .map((store) => {
                      const checked = targetStoreIds.includes(store.id);
                      return (
                        <label
                          key={store.id}
                          className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                            checked
                              ? 'border-amber-500 bg-amber-50/60 font-bold text-slate-900'
                              : 'border-slate-200 bg-slate-50/50 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTargetStoreIds((prev) => [...prev, store.id]);
                              } else {
                                setTargetStoreIds((prev) => prev.filter((id) => id !== store.id));
                              }
                            }}
                            className="size-4 accent-amber-600"
                          />
                          <div className="text-xs">
                            <span className="block">{store.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              Hiện có: {store.productsCount} món, {store.ingredientsCount} NL
                            </span>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">
                  3. Các hạng mục dữ liệu muốn đồng bộ
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncCatalog}
                      onChange={(e) => setSyncCatalog(e.target.checked)}
                      className="mt-0.5 size-4 accent-amber-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        Thực đơn, Giá & Nhóm Topping
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Danh mục, Món ăn, Biến thể size, Bảng giá & Topping
                      </span>
                    </div>
                  </label>

                  <label className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncIngredients}
                      onChange={(e) => setSyncIngredients(e.target.checked)}
                      className="mt-0.5 size-4 accent-amber-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        Danh mục Nguyên vật liệu & NCC
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Mã SKU, đơn vị tính, ngưỡng cảnh báo tồn & Nhà cung cấp
                      </span>
                    </div>
                  </label>

                  <label className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncRecipes}
                      onChange={(e) => setSyncRecipes(e.target.checked)}
                      className="mt-0.5 size-4 accent-amber-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        Định mức chế biến (BOM)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Công thức định lượng nguyên liệu trừ kho tự động cho từng món
                      </span>
                    </div>
                  </label>

                  <label className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncTables}
                      onChange={(e) => setSyncTables(e.target.checked)}
                      className="mt-0.5 size-4 accent-amber-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        Khung Sơ đồ bàn tiêu chuẩn
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Mã bàn và sức chứa (Tạo mã QR riêng cho từng chi nhánh)
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy || targetStoreIds.length === 0}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold h-11 text-xs"
              >
                <Sparkles className="size-4 mr-2" />
                {busy
                  ? 'Đang đồng bộ dữ liệu liên chi nhánh...'
                  : `Thực Hiện Đồng Bộ Sang ${targetStoreIds.length} Chi Nhánh`}
              </Button>
            </form>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Cơ chế Đồng bộ Chuỗi Thông minh (Upsert An Toàn)
              </h3>
              <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <li>
                  • <strong>Không làm mất dữ liệu giao dịch</strong>: Các đơn hàng, ca thu ngân và
                  tồn kho thực tế tại chi nhánh đích được giữ nguyên 100%.
                </li>
                <li>
                  • <strong>Chuẩn hóa SKU & Tên món</strong>: Nếu món ăn hoặc nguyên liệu chưa có ở
                  chi nhánh đích, hệ thống sẽ tạo mới; nếu đã có sẽ cập nhật giá bán, nhóm topping
                  và công thức BOM mới nhất.
                </li>
                <li>
                  • <strong>Tự chủ trạng thái Hết hàng (Sold-out)</strong>: Sau khi đồng bộ, từng
                  chi nhánh vẫn có thể tự bật/tắt hết món tạm thời tại quầy của mình.
                </li>
              </ul>
            </div>

            {lastSyncResult && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 space-y-2 text-xs text-emerald-950">
                <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>Kết quả đợt đồng bộ vừa thực hiện</span>
                </div>
                <p>Đã đồng bộ thành công sang {lastSyncResult.targetCount} chi nhánh:</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                    <span className="text-slate-500 block">Danh mục & Món ăn</span>
                    <strong className="text-sm">
                      {lastSyncResult.categoriesSynced} DM • {lastSyncResult.productsSynced} Món
                    </strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                    <span className="text-slate-500 block">Nguyên liệu & BOM</span>
                    <strong className="text-sm">
                      {lastSyncResult.ingredientsSynced} NL • {lastSyncResult.recipesSynced} BOM
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INTER-STORE STOCK TRANSFER */}
      {activeTab === 'transfer' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="size-5 text-blue-600" />
                <span>Điều Chuyển Nguyên Vật Liệu Liên Chi Nhánh</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Xuất nguyên vật liệu từ Kho của Chi nhánh A sang Kho của Chi nhánh B (Tự động trừ lô
                FEFO ở kho xuất và tạo lô nhập tương ứng ở kho nhận)
              </p>
            </div>

            <form onSubmit={handleInterStoreTransfer} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Từ Chi nhánh xuất hàng <span className="text-rose-500">*</span>
                  </label>
                  <select
                    aria-label="Chi nhánh xuất"
                    value={fromStoreId}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setFromStoreId(nextFrom);
                      if (nextFrom === toStoreId) {
                        const alt = overview.stores.find((s) => s.id !== nextFrom);
                        if (alt) setToStoreId(alt.id);
                      }
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                  >
                    {overview.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Đến Chi nhánh nhận hàng <span className="text-rose-500">*</span>
                  </label>
                  <select
                    aria-label="Chi nhánh nhận"
                    value={toStoreId}
                    onChange={(e) => setToStoreId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                  >
                    {overview.stores
                      .filter((s) => s.id !== fromStoreId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Nguyên vật liệu điều chuyển <span className="text-rose-500">*</span>
                  </label>
                  <select
                    aria-label="Nguyên vật liệu"
                    value={transferIngredientId}
                    onChange={(e) => setTransferIngredientId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                  >
                    {fromStoreObj?.ingredientStocks.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} (Tồn: {ing.quantity.toLocaleString('vi-VN')}{' '}
                        {unitLabels[ing.unit] ?? ing.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Số lượng chuyển ({selectedTransferIngredient ? unitLabels[selectedTransferIngredient.unit] : ''}){' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    className="h-10 text-xs font-bold"
                  />
                  {selectedTransferIngredient && (
                    <span className="text-[11px] text-slate-500 block">
                      Khả dụng tại {fromStoreObj?.name}:{' '}
                      <strong>
                        {selectedTransferIngredient.quantity.toLocaleString('vi-VN')}{' '}
                        {unitLabels[selectedTransferIngredient.unit]}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Ghi chú phiếu điều chuyển</label>
                <Input
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || !fromStoreId || !toStoreId || fromStoreId === toStoreId}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 text-xs"
              >
                <ArrowLeftRight className="size-4 mr-2" />
                {busy
                  ? 'Đang xử lý điều chuyển liên chi nhánh...'
                  : 'Xác Nhận Xuất Chuyển Kho Liên Chi Nhánh'}
              </Button>
            </form>
          </div>

          {/* Right: Stock comparison across stores */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Boxes className="size-4 text-amber-600" />
              <span>Đối Chiếu Tồn Kho Giữa Các Chi Nhánh</span>
            </h3>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {overview.stores.map((st) => (
                <div key={st.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-slate-900">{st.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {st.ingredientsCount} mặt hàng
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {st.ingredientStocks.slice(0, 6).map((ing) => (
                      <div
                        key={ing.id}
                        className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 flex items-center justify-between"
                      >
                        <span className="truncate text-slate-700 pr-1">{ing.name}</span>
                        <strong
                          className={
                            ing.lowStockQuantity != null && ing.quantity <= ing.lowStockQuantity
                              ? 'text-rose-600 shrink-0'
                              : 'text-emerald-700 shrink-0'
                          }
                        >
                          {ing.quantity.toLocaleString('vi-VN')} {unitLabels[ing.unit]}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CREATE NEW BRANCH STORE */}
      {activeTab === 'create' && overview && (
        <div className="max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Plus className="size-5 text-emerald-600" />
              <span>Mở Chi Nhánh Mới Trong Chuỗi Chick Res</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khởi tạo điểm bán mới, tự động tạo quầy thu ngân, kho lưu trữ và sao chép toàn bộ Thực
              đơn & Định mức BOM từ chi nhánh gốc
            </p>
          </div>

          <form onSubmit={handleCreateStore} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700">
                  Tên chi nhánh mới <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="Ví dụ: Chick Res Quận 7 - Phú Mỹ Hưng"
                  className="h-10 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Địa chỉ chi nhánh</label>
                <Input
                  value={newStoreAddress}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="Ví dụ: 45 Nguyễn Thị Thập, Quận 7, TP.HCM"
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Số điện thoại hotline</label>
                <Input
                  value={newStorePhone}
                  onChange={(e) => setNewStorePhone(e.target.value)}
                  placeholder="0909 888 999"
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Giờ mở cửa</label>
                <Input
                  type="time"
                  value={newStoreOpening}
                  onChange={(e) => setNewStoreOpening(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Giờ đóng cửa</label>
                <Input
                  type="time"
                  value={newStoreClosing}
                  onChange={(e) => setNewStoreClosing(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Người phụ trách / Quản lý <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Chọn người phụ trách"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Sao chép Thực đơn, Nguyên liệu & BOM từ
                </label>
                <select
                  aria-label="Sao chép dữ liệu từ chi nhánh"
                  value={cloneFromStoreId}
                  onChange={(e) => setCloneFromStoreId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="">-- Không sao chép (Khởi tạo trống) --</option>
                  {overview.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sao chép chuẩn từ: {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !newStoreName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs"
            >
              <Plus className="size-4 mr-1.5" />
              {busy ? 'Đang khởi tạo và đồng bộ chi nhánh...' : 'Khởi Tạo Chi Nhánh Mới'}
            </Button>
          </form>
        </div>
      )}

      {/* EDIT STORE & CASH REGISTERS MODAL */}
      {editingStore && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                Cấu hình Chi nhánh: {editingStore.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStoreInfo} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Tên chi nhánh</label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Địa chỉ</label>
                  <Input
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Điện thoại</label>
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Giờ mở cửa</label>
                  <Input
                    type="time"
                    value={editOpening}
                    onChange={(e) => setEditOpening(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Giờ đóng cửa</label>
                  <Input
                    type="time"
                    value={editClosing}
                    onChange={(e) => setEditClosing(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-9 text-xs"
              >
                Lưu thông tin chi nhánh
              </Button>
            </form>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-slate-700">
                Thêm Máy Thu Ngân (Cash Register)
              </h4>
              <form onSubmit={handleAddRegister} className="flex gap-2">
                <Input
                  placeholder="Mã (VD: POS-02)"
                  value={newRegCode}
                  onChange={(e) => setNewRegCode(e.target.value)}
                  className="h-9 text-xs w-32 font-mono"
                />
                <Input
                  placeholder="Tên quầy (VD: Quầy tầng 2)"
                  value={newRegName}
                  onChange={(e) => setNewRegName(e.target.value)}
                  className="h-9 text-xs flex-1"
                />
                <Button type="submit" size="sm" disabled={busy} className="h-9 text-xs">
                  + Thêm
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
