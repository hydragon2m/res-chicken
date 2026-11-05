'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  CalendarDays,
  Plus,
  QrCode,
  Users,
  RefreshCw,
  ExternalLink,
  Printer,
  Armchair,
  LayoutGrid,
  List,
  Copy,
  Check,
  Search,
  History,
  Clock,
  Phone,
  Columns2,
  Maximize2,
  Filter,
} from 'lucide-react';
import { apiRequest } from '@/lib/auth';
import { printTableQrCard } from '@/lib/print-receipt';
import { useActiveStore } from '@/lib/store-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  TableOrdersDialog,
  TableOrdersSummary,
  type TableCurrentOrder,
} from '@/features/tables/table-orders';

type Table = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  qrToken: string;
  orders: TableCurrentOrder[];
};

type Reservation = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  guestCount: number;
  reservationTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  specialNotes?: string | null;
  tableId?: string | null;
  table?: { id: string; code: string; name?: string } | null;
};

type RawTable = {
  id: string;
  code?: string;
  tableNumber?: string;
  name?: string;
  capacity: number;
  status: Table['status'];
  qrCodeToken?: string;
  qrToken?: string;
  orders?: TableCurrentOrder[];
};

const ACTIVE_RES_STATUSES: Array<Reservation['status']> = ['PENDING', 'CONFIRMED', 'SEATED'];
const HISTORY_RES_STATUSES: Array<Reservation['status']> = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export default function TablesManagementPage() {
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified workspace layout mode: 'split' (default: see both tables & reservations/history together), 'tables', 'reservations'
  const [layoutMode, setLayoutMode] = useState<'split' | 'tables' | 'reservations'>('split');
  const [tableViewMode, setTableViewMode] = useState<'grid' | 'table'>('grid');
  const [tableStatusFilter, setTableStatusFilter] = useState<'ALL' | Table['status']>('ALL');
  const [selectedTableFilterId, setSelectedTableFilterId] = useState<string>('ALL');

  // Reservation & History filters
  const [resFilterGroup, setResFilterGroup] = useState<'ALL' | 'ACTIVE' | 'HISTORY'>('ALL');
  const [resSearch, setResSearch] = useState('');

  // QR Modal state
  const [selectedTableForQr, setSelectedTableForQr] = useState<Table | null>(null);
  const [ordersTableId, setOrdersTableId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // New table form state
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableCode, setNewTableCode] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [newCapacity, setNewCapacity] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  // New reservation form state
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resGuests, setResGuests] = useState(4);
  const [resDate, setResDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [resTime, setResTime] = useState('18:30');
  const [resTableId, setResTableId] = useState('');
  const [resNotes, setResNotes] = useState('');

  // Table assignment state per reservation row
  const [assignTableMap, setAssignTableMap] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(
    async (silent = false) => {
      if (!storeId) return;
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const [tListRaw, rList] = await Promise.all([
          apiRequest<RawTable[]>(`/tables?storeId=${encodeURIComponent(storeId)}`),
          apiRequest<Reservation[]>(`/reservations?storeId=${encodeURIComponent(storeId)}`),
        ]);
        const mappedTables: Table[] = (tListRaw || []).map((t) => ({
          id: t.id,
          code: t.code ?? t.tableNumber ?? 'B-01',
          name: t.name ?? `Bàn ${t.code ?? ''}`,
          capacity: t.capacity,
          status: t.status,
          qrToken: t.qrCodeToken ?? t.qrToken ?? '',
          orders: Array.isArray(t.orders) ? t.orders : [],
        }));
        setTables(mappedTables);
        setReservations(Array.isArray(rList) ? rList : []);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Không thể tải dữ liệu bàn ăn và lịch đặt chỗ.';
        setLoadError(msg);
        if (!silent) toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Keep table occupancy & current orders fresh for staff on the floor.
  useEffect(() => {
    const timer = setInterval(() => void loadData(true), 15000);
    return () => clearInterval(timer);
  }, [loadData]);

  const ordersTable = useMemo(
    () => tables.find((t) => t.id === ordersTableId) ?? null,
    [tables, ordersTableId],
  );

  useEffect(() => {
    if (!selectedTableForQr) {
      setQrDataUrl('');
      return;
    }
    const url = `${window.location.origin}/table/${selectedTableForQr.qrToken}`;
    void QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [selectedTableForQr]);

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !newTableCode.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest('/tables', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          code: newTableCode.trim().toUpperCase(),
          name: newTableName.trim() || `Bàn ${newTableCode.trim().toUpperCase()}`,
          capacity: Number(newCapacity),
        }),
      });
      toast.success('Đã thêm bàn ăn mới');
      setNewTableCode('');
      setNewTableName('');
      setNewCapacity(4);
      setShowAddTable(false);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi tạo bàn');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setSubmitting(true);
    try {
      const reservationTime = new Date(`${resDate}T${resTime}:00`).toISOString();
      await apiRequest('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          tableId: resTableId || undefined,
          customerName: resName.trim(),
          customerPhone: resPhone.trim(),
          guestCount: Number(resGuests),
          reservationTime,
          specialNotes: resNotes.trim() || undefined,
        }),
      });
      toast.success('Đã tạo lịch đặt bàn mới');
      setResName('');
      setResPhone('');
      setResNotes('');
      setResTableId('');
      setShowAddReservation(false);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo đặt bàn');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeTableStatus = async (tableId: string, status: Table['status']) => {
    try {
      await apiRequest(`/tables/${tableId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success('Đã cập nhật trạng thái bàn');
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái');
    }
  };

  const handleUpdateReservationStatus = async (
    id: string,
    status: string,
    explicitTableId?: string,
  ) => {
    try {
      const chosenTableId = explicitTableId ?? assignTableMap[id];
      await apiRequest(`/reservations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(chosenTableId ? { tableId: chosenTableId } : {}),
        }),
      });
      toast.success('Đã cập nhật trạng thái đặt bàn');
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật đặt chỗ');
    }
  };

  const statusBadge = (status: Table['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success">Bàn trống</Badge>;
      case 'OCCUPIED':
        return <Badge variant="destructive">Có khách</Badge>;
      case 'RESERVED':
        return <Badge variant="amber">Đã đặt trước</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const statusShortText = (status: Table['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return 'Trống';
      case 'OCCUPIED':
        return 'Có khách';
      case 'RESERVED':
        return 'Đặt trước';
      default:
        return status;
    }
  };

  const resStatusBadge = (status: Reservation['status']) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary">Chờ xác nhận</Badge>;
      case 'CONFIRMED':
        return <Badge variant="amber">Đã giữ bàn</Badge>;
      case 'SEATED':
        return <Badge variant="success">Đang dùng bữa</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline">Hoàn tất</Badge>;
      case 'NO_SHOW':
        return <Badge variant="destructive">Khách không đến</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Đã huỷ</Badge>;
    }
  };

  const availableCount = tables.filter((t) => t.status === 'AVAILABLE').length;
  const occupiedCount = tables.filter((t) => t.status === 'OCCUPIED').length;
  const reservedCount = tables.filter((t) => t.status === 'RESERVED').length;

  const activeReservationsCount = useMemo(
    () => reservations.filter((r) => ACTIVE_RES_STATUSES.includes(r.status)).length,
    [reservations],
  );
  const historyReservationsCount = useMemo(
    () => reservations.filter((r) => HISTORY_RES_STATUSES.includes(r.status)).length,
    [reservations],
  );

  // Map each tableId -> active reservation & total reservation count
  const tableReservationInfo = useMemo(() => {
    const map: Record<string, { active?: Reservation; totalCount: number }> = {};
    for (const r of reservations) {
      const tid = r.tableId ?? r.table?.id;
      if (!tid) continue;
      if (!map[tid]) map[tid] = { totalCount: 0 };
      map[tid].totalCount += 1;
      if (ACTIVE_RES_STATUSES.includes(r.status) && !map[tid].active) {
        map[tid].active = r;
      }
    }
    return map;
  }, [reservations]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (tableStatusFilter !== 'ALL' && t.status !== tableStatusFilter) return false;
      return true;
    });
  }, [tables, tableStatusFilter]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (resFilterGroup === 'ACTIVE' && !ACTIVE_RES_STATUSES.includes(r.status)) return false;
      if (resFilterGroup === 'HISTORY' && !HISTORY_RES_STATUSES.includes(r.status)) return false;
      if (selectedTableFilterId !== 'ALL') {
        const tid = r.tableId ?? r.table?.id;
        if (tid !== selectedTableFilterId) return false;
      }
      if (resSearch.trim()) {
        const q = resSearch.trim().toLowerCase();
        const matchName = r.customerName.toLowerCase().includes(q);
        const matchPhone = r.customerPhone.toLowerCase().includes(q);
        const matchTable = r.table?.code?.toLowerCase().includes(q) ?? false;
        const matchNotes = r.specialNotes?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchPhone && !matchTable && !matchNotes) return false;
      }
      return true;
    });
  }, [reservations, resFilterGroup, selectedTableFilterId, resSearch]);

  const selectedTableObj = useMemo(
    () => tables.find((t) => t.id === selectedTableFilterId),
    [tables, selectedTableFilterId],
  );

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Armchair className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Điều Phối Sơ Đồ Bàn, QR Tại Bàn & Lịch Sử Đặt Chỗ
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Chi nhánh:{' '}
              <span className="font-semibold text-slate-700">
                {currentStore?.name ?? 'Chick Res Main'}
              </span>{' '}
              • Theo dõi trực tiếp bàn trống, gán bàn cho khách hẹn và tra cứu lịch sử đặt bàn trên
              cùng 1 màn hình
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Switcher */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                layoutMode === 'split'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns2 className="size-3.5 text-amber-600" />
              <span>Xem gộp (Bàn + Lịch đặt)</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('tables')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'tables'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Chỉ Sơ đồ bàn</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('reservations')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'reservations'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Chỉ Sổ đặt bàn</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setResTableId(selectedTableFilterId !== 'ALL' ? selectedTableFilterId : '');
              setShowAddReservation(true);
            }}
            className="flex items-center gap-1.5 font-bold border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100 cursor-pointer"
          >
            <CalendarDays className="size-4 text-amber-600" />
            <span>+ Tạo lịch đặt bàn</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              const existingCodes = new Set(tables.map((t) => t.code.toUpperCase()));
              let num = tables.length + 1;
              while (existingCodes.has(`B-${String(num).padStart(2, '0')}`)) {
                num += 1;
              }
              const nextCode = `B-${String(num).padStart(2, '0')}`;
              setNewTableCode(nextCode);
              setNewTableName(`Bàn ${String(num).padStart(2, '0')} (Sảnh chính)`);
              setNewCapacity(4);
              setShowAddTable(true);
            }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-sm cursor-pointer"
          >
            <Plus className="size-4" />
            <span>+ Thêm bàn mới</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
          <span>Lỗi đồng bộ dữ liệu: {loadError}</span>
          <Button variant="outline" size="xs" onClick={() => void loadData()}>
            Thử lại
          </Button>
        </div>
      )}

      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
          <CardHeader className="p-4">
            <CardDescription className="text-[11px] font-bold text-slate-500 uppercase">
              Tổng số bàn phục vụ
            </CardDescription>
            <CardTitle className="text-2xl font-extrabold text-slate-900">
              {tables.length} bàn
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-emerald-200/90 bg-emerald-50/20 shadow-2xs">
          <CardHeader className="p-4">
            <CardDescription className="text-[11px] font-bold text-emerald-700 uppercase">
              Bàn đang trống
            </CardDescription>
            <CardTitle className="text-2xl font-extrabold text-emerald-600">
              {availableCount} bàn
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-rose-200/90 bg-rose-50/20 shadow-2xs">
          <CardHeader className="p-4">
            <CardDescription className="text-[11px] font-bold text-rose-700 uppercase">
              Đang có khách ngồi
            </CardDescription>
            <CardTitle className="text-2xl font-extrabold text-rose-600">
              {occupiedCount} bàn
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-amber-200/90 bg-amber-50/20 shadow-2xs">
          <CardHeader className="p-4">
            <CardDescription className="text-[11px] font-bold text-amber-700 uppercase">
              Bàn giữ chỗ trước
            </CardDescription>
            <CardTitle className="text-2xl font-extrabold text-amber-600">
              {reservedCount} bàn
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-blue-200/90 bg-blue-50/20 shadow-2xs col-span-2 sm:col-span-1">
          <CardHeader className="p-4">
            <CardDescription className="text-[11px] font-bold text-blue-700 uppercase">
              Đặt chỗ & Lịch sử
            </CardDescription>
            <CardTitle className="text-xl font-extrabold text-blue-700">
              {activeReservationsCount} đang hẹn{' '}
              <span className="text-xs font-semibold text-slate-500">
                / {reservations.length} tổng
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* UNIFIED 2-PANEL WORKSPACE: TABLES ON LEFT + RESERVATIONS & HISTORY ON RIGHT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: SƠ ĐỒ BÀN ĂN & QR TẠI BÀN */}
        {(layoutMode === 'split' || layoutMode === 'tables') && (
          <div
            className={`${layoutMode === 'split' ? 'xl:col-span-5' : 'xl:col-span-12'} space-y-4`}
          >
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <Armchair className="size-4.5 text-amber-600" />
                      <span>Sơ Đồ Bàn Ăn & QR Tại Bàn ({filteredTables.length})</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Nhấn vào một bàn để lọc lịch đặt chỗ & lịch sử của bàn đó ở khung bên phải
                    </CardDescription>
                  </div>

                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setTableViewMode('grid')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                        tableViewMode === 'grid'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LayoutGrid className="size-3.5" />
                      <span>Lưới</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableViewMode('table')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                        tableViewMode === 'table'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <List className="size-3.5" />
                      <span>Bảng</span>
                    </button>
                  </div>
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'ALL', label: `Tất cả (${tables.length})` },
                      { key: 'AVAILABLE', label: `Trống (${availableCount})` },
                      { key: 'OCCUPIED', label: `Có khách (${occupiedCount})` },
                      { key: 'RESERVED', label: `Đặt trước (${reservedCount})` },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setTableStatusFilter(st.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        tableStatusFilter === st.key
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {filteredTables.length === 0 ? (
                  <p className="py-10 text-center text-xs text-slate-400">
                    Không có bàn nào ở trạng thái này.
                  </p>
                ) : tableViewMode === 'grid' ? (
                  <div
                    className={`grid gap-3 ${
                      layoutMode === 'split'
                        ? 'grid-cols-1 sm:grid-cols-2'
                        : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                    }`}
                  >
                    {filteredTables.map((t) => {
                      const info = tableReservationInfo[t.id];
                      const isSelected = selectedTableFilterId === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between gap-3 ${
                            isSelected
                              ? 'border-amber-500 ring-2 ring-amber-500/25 bg-amber-50/40'
                              : t.status === 'OCCUPIED'
                                ? 'border-rose-200 bg-rose-50/25'
                                : t.status === 'RESERVED'
                                  ? 'border-amber-200 bg-amber-50/25'
                                  : 'border-slate-200 bg-white hover:border-amber-300'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`size-9 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                                    t.status === 'OCCUPIED'
                                      ? 'bg-rose-600 text-white'
                                      : t.status === 'RESERVED'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-emerald-600 text-white'
                                  }`}
                                >
                                  {t.code}
                                </div>
                                <div>
                                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                                    {t.name}
                                  </h3>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <Users className="size-3" />
                                    <span>{t.capacity} chỗ ngồi</span>
                                  </p>
                                </div>
                              </div>
                              {statusBadge(t.status)}
                            </div>

                            {/* Current orders of an occupied table */}
                            <TableOrdersSummary
                              orders={t.orders}
                              onOpen={() => setOrdersTableId(t.id)}
                            />

                            {/* Active Reservation Info on Table Card */}
                            {info?.active ? (
                              <div className="p-2 rounded-lg bg-amber-100/70 border border-amber-200 text-[11px] text-amber-950 space-y-0.5">
                                <p className="font-bold truncate">
                                  Khách hẹn: {info.active.customerName} ({info.active.guestCount}{' '}
                                  người)
                                </p>
                                <p className="text-amber-800">
                                  Giờ hẹn:{' '}
                                  {new Date(info.active.reservationTime).toLocaleTimeString(
                                    'vi-VN',
                                    {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    },
                                  )}{' '}
                                  • SĐT: {info.active.customerPhone}
                                </p>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                                <span>Lịch sử đặt bàn này: {info?.totalCount ?? 0} lượt</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            {/* Quick status switch */}
                            <div className="grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                disabled={t.status === 'AVAILABLE'}
                                onClick={() => void handleChangeTableStatus(t.id, 'AVAILABLE')}
                                className={`py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                                  t.status === 'AVAILABLE'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700'
                                }`}
                              >
                                Trống
                              </button>
                              <button
                                type="button"
                                disabled={t.status === 'OCCUPIED'}
                                onClick={() => void handleChangeTableStatus(t.id, 'OCCUPIED')}
                                className={`py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                                  t.status === 'OCCUPIED'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700'
                                }`}
                              >
                                Có khách
                              </button>
                              <button
                                type="button"
                                disabled={t.status === 'RESERVED'}
                                onClick={() => void handleChangeTableStatus(t.id, 'RESERVED')}
                                className={`py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                                  t.status === 'RESERVED'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700'
                                }`}
                              >
                                Giữ bàn
                              </button>
                            </div>

                            {/* Bottom actions: QR + Filter History */}
                            <div className="flex items-center justify-between gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setSelectedTableForQr(t)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                              >
                                <QrCode className="size-3.5 text-amber-600" />
                                <span>Mã QR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedTableFilterId(isSelected ? 'ALL' : t.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                                }`}
                              >
                                <History className="size-3.5" />
                                <span>
                                  {isSelected
                                    ? 'Đang xem lịch sử'
                                    : `Xem lịch đặt (${info?.totalCount ?? 0})`}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                        <tr>
                          <th className="py-3 px-3">Bàn</th>
                          <th className="py-3 px-3 text-center">Ghế</th>
                          <th className="py-3 px-3 text-center">Trạng thái</th>
                          <th className="py-3 px-3">Đơn hiện tại</th>
                          <th className="py-3 px-3">QR & Lịch sử</th>
                          <th className="py-3 px-3 text-right">Đổi nhanh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTables.map((t) => {
                          const info = tableReservationInfo[t.id];
                          const isSelected = selectedTableFilterId === t.id;
                          return (
                            <tr
                              key={t.id}
                              className={`hover:bg-slate-50/70 ${
                                isSelected ? 'bg-amber-50/60' : ''
                              }`}
                            >
                              <td className="py-3 px-3">
                                <span className="font-extrabold text-amber-800 block">
                                  {t.code}
                                </span>
                                <span className="text-[11px] text-slate-600">{t.name}</span>
                              </td>
                              <td className="py-3 px-3 text-center font-semibold">{t.capacity}</td>
                              <td className="py-3 px-3 text-center">{statusBadge(t.status)}</td>
                              <td className="py-3 px-3 min-w-[200px]">
                                {t.orders.length > 0 ? (
                                  <TableOrdersSummary
                                    orders={t.orders}
                                    onOpen={() => setOrdersTableId(t.id)}
                                  />
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTableForQr(t)}
                                    className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] cursor-pointer"
                                  >
                                    QR
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedTableFilterId(isSelected ? 'ALL' : t.id)
                                    }
                                    className={`px-2 py-1 rounded font-bold text-[11px] cursor-pointer ${
                                      isSelected
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-amber-50 text-amber-900 border border-amber-200'
                                    }`}
                                  >
                                    Lịch sử ({info?.totalCount ?? 0})
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <select
                                  aria-label="Đổi trạng thái bàn"
                                  value={t.status}
                                  onChange={(e) =>
                                    void handleChangeTableStatus(
                                      t.id,
                                      e.target.value as Table['status'],
                                    )
                                  }
                                  className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                                >
                                  <option value="AVAILABLE">Bàn trống</option>
                                  <option value="OCCUPIED">Có khách</option>
                                  <option value="RESERVED">Giữ bàn</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* RIGHT PANEL: SỔ ĐẶT BÀN TRỰC TIẾP & LỊCH SỬ ĐẶT BÀN */}
        {(layoutMode === 'split' || layoutMode === 'reservations') && (
          <div
            className={`${layoutMode === 'split' ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-4`}
          >
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <CalendarDays className="size-4.5 text-amber-600" />
                      <span>
                        Sổ Điều Phối Đặt Bàn & Lịch Sử Đặt Chỗ ({filteredReservations.length})
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Xếp bàn trống, xác nhận khách đến nhận bàn và tra cứu toàn bộ lịch sử đặt bàn
                    </CardDescription>
                  </div>

                  {selectedTableObj && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-xs font-bold text-amber-950">
                      <span>
                        Đang lọc theo: {selectedTableObj.code} ({selectedTableObj.name})
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTableFilterId('ALL')}
                        className="text-amber-700 hover:text-amber-950 font-black cursor-pointer"
                      >
                        ✕ Bỏ lọc
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter Tabs (Tất cả / Đang hẹn / Lịch sử) + Search */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="inline-flex rounded-xl bg-slate-200/70 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setResFilterGroup('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resFilterGroup === 'ALL'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tất cả ({reservations.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResFilterGroup('ACTIVE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resFilterGroup === 'ACTIVE'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Đang chờ / Phục vụ ({activeReservationsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResFilterGroup('HISTORY')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resFilterGroup === 'HISTORY'
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Lịch sử đã đóng ({historyReservationsCount})
                    </button>
                  </div>

                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      value={resSearch}
                      onChange={(e) => setResSearch(e.target.value)}
                      placeholder="Tìm tên khách, SĐT, mã bàn..."
                      className="pl-9 h-9 text-xs bg-white"
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3.5">Khách hàng & Liên hệ</th>
                        <th className="px-3 py-3.5 text-center">Khách</th>
                        <th className="px-3 py-3.5">Giờ hẹn</th>
                        <th className="px-3 py-3.5">Xếp bàn</th>
                        <th className="px-3 py-3.5 text-center">Trạng thái</th>
                        <th className="px-4 py-3.5 text-right">Thao tác kiểm soát</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredReservations.map((r) => {
                        const currentTableId =
                          assignTableMap[r.id] ?? r.tableId ?? r.table?.id ?? '';
                        const isEditable = r.status === 'PENDING' || r.status === 'CONFIRMED';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3.5">
                              <p className="font-bold text-slate-900 text-sm">{r.customerName}</p>
                              <p className="text-slate-600 font-medium flex items-center gap-1 mt-0.5">
                                <Phone className="size-3 text-slate-400" />
                                <span>{r.customerPhone}</span>
                              </p>
                              {r.specialNotes && (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-50 text-[11px] text-amber-900 border border-amber-200/70">
                                  Ghi chú: {r.specialNotes}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3.5 text-center font-extrabold text-slate-800">
                              {r.guestCount}
                            </td>
                            <td className="px-3 py-3.5 whitespace-nowrap">
                              <span className="font-extrabold text-amber-800 block">
                                {new Date(r.reservationTime).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {new Date(r.reservationTime).toLocaleDateString('vi-VN')}
                              </span>
                            </td>
                            <td className="px-3 py-3.5">
                              {isEditable ? (
                                <select
                                  aria-label="Chọn bàn gán cho khách"
                                  value={currentTableId}
                                  onChange={(e) =>
                                    setAssignTableMap((prev) => ({
                                      ...prev,
                                      [r.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:border-amber-500 outline-none max-w-[155px]"
                                >
                                  <option value="">-- Chưa xếp bàn --</option>
                                  {tables.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.code} ({t.capacity} chỗ • {statusShortText(t.status)})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 font-bold text-slate-800">
                                  {r.table ? r.table.code : 'Chưa gán'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3.5 text-center">{resStatusBadge(r.status)}</td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                {r.status === 'PENDING' && (
                                  <Button
                                    size="xs"
                                    onClick={() =>
                                      void handleUpdateReservationStatus(
                                        r.id,
                                        'CONFIRMED',
                                        currentTableId || undefined,
                                      )
                                    }
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer"
                                  >
                                    Giữ bàn
                                  </Button>
                                )}
                                {(r.status === 'CONFIRMED' || r.status === 'PENDING') && (
                                  <Button
                                    size="xs"
                                    onClick={() =>
                                      void handleUpdateReservationStatus(
                                        r.id,
                                        'SEATED',
                                        currentTableId || undefined,
                                      )
                                    }
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                                  >
                                    Nhận bàn
                                  </Button>
                                )}
                                {r.status === 'SEATED' && (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() =>
                                      void handleUpdateReservationStatus(r.id, 'COMPLETED')
                                    }
                                    className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-bold cursor-pointer"
                                  >
                                    Hoàn tất
                                  </Button>
                                )}
                                {(r.status === 'PENDING' || r.status === 'CONFIRMED') && (
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() =>
                                      void handleUpdateReservationStatus(r.id, 'NO_SHOW')
                                    }
                                    className="text-slate-600 hover:bg-slate-100 cursor-pointer"
                                  >
                                    Vắng
                                  </Button>
                                )}
                                {r.status !== 'CANCELLED' &&
                                  r.status !== 'COMPLETED' &&
                                  r.status !== 'NO_SHOW' && (
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      onClick={() =>
                                        void handleUpdateReservationStatus(r.id, 'CANCELLED')
                                      }
                                      className="text-rose-600 hover:bg-rose-50 hover:border-rose-200 cursor-pointer"
                                    >
                                      Huỷ
                                    </Button>
                                  )}
                                {HISTORY_RES_STATUSES.includes(r.status) && (
                                  <span className="text-[11px] text-slate-400 italic">
                                    Đã lưu lịch sử
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredReservations.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            Không có lịch đặt bàn nào khớp với bộ lọc hiện tại.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add Table Dialog */}
      {showAddTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Thêm Bàn Ăn Mới</h3>
              <button
                type="button"
                onClick={() => setShowAddTable(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tableCode" className="text-xs font-semibold text-slate-700">
                    Mã số bàn *
                  </Label>
                  <Input
                    id="tableCode"
                    placeholder="VD: B-05, VIP-02"
                    required
                    value={newTableCode}
                    onChange={(e) => setNewTableCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="capacity" className="text-xs font-semibold text-slate-700">
                    Sức chứa (Số ghế) *
                  </Label>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tableName" className="text-xs font-semibold text-slate-700">
                  Tên hiển thị / Khu vực
                </Label>
                <Input
                  id="tableName"
                  placeholder="VD: Bàn 5 (Cửa sổ tầng 1)"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[2, 4, 6, 8, 10].map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => setNewCapacity(cap)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer border ${
                        newCapacity === cap
                          ? 'bg-amber-100 border-amber-400 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cap} ghế
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddTable(false)}
                  disabled={submitting}
                >
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {submitting ? 'Đang tạo...' : 'Tạo bàn'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Reservation Dialog */}
      {showAddReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Tạo Lịch Đặt Bàn Mới</h3>
              <button
                type="button"
                onClick={() => setShowAddReservation(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Tên khách hàng *</Label>
                  <Input
                    required
                    placeholder="Nguyễn Văn A"
                    value={resName}
                    onChange={(e) => setResName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Số điện thoại *</Label>
                  <Input
                    required
                    placeholder="0901234567"
                    value={resPhone}
                    onChange={(e) => setResPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Số khách</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={resGuests}
                    onChange={(e) => setResGuests(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Ngày</Label>
                  <Input
                    type="date"
                    required
                    value={resDate}
                    onChange={(e) => setResDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Giờ</Label>
                  <Input
                    type="time"
                    required
                    value={resTime}
                    onChange={(e) => setResTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Xếp vào bàn (Tuỳ chọn)
                </Label>
                <select
                  aria-label="Chọn bàn đặt trước"
                  value={resTableId}
                  onChange={(e) => setResTableId(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:border-amber-500 outline-none"
                >
                  <option value="">-- Tự động hoặc xếp sau --</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.name} ({t.capacity} chỗ • {statusShortText(t.status)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Ghi chú</Label>
                <Input
                  placeholder="Ghế trẻ em, bàn gần cửa sổ..."
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddReservation(false)}
                >
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {submitting ? 'Đang lưu...' : 'Tạo đặt bàn'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Current orders of a table (read-only for floor staff) */}
      {ordersTable && (
        <TableOrdersDialog
          tableCode={ordersTable.code}
          tableName={ordersTable.name}
          orders={ordersTable.orders}
          onClose={() => setOrdersTableId(null)}
        />
      )}

      {/* Real Scannable QR Code Modal */}
      {selectedTableForQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-center space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Mã QR {selectedTableForQr.name} ({selectedTableForQr.code})
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTableForQr(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 inline-block mx-auto shadow-inner">
              <div className="size-52 bg-white p-2 rounded-xl border border-amber-300 flex flex-col items-center justify-center">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`QR ${selectedTableForQr.code}`}
                    className="size-40 object-contain"
                  />
                ) : (
                  <QrCode className="size-36 text-slate-900" />
                )}
                <span className="text-[11px] font-bold text-amber-800 mt-1">
                  {selectedTableForQr.code} • {currentStore?.name ?? 'Chick Res'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Khách hàng dùng điện thoại quét mã QR này để xem menu và tự gửi đơn trực tiếp tới POS
              &amp; Bếp KDS.
            </p>

            <div className="pt-2 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs cursor-pointer"
                onClick={() => {
                  const url = `${window.location.origin}/table/${selectedTableForQr.qrToken}`;
                  void navigator.clipboard.writeText(url);
                  setCopiedLink(true);
                  toast.success('Đã sao chép đường dẫn tự gọi món');
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
              >
                {copiedLink ? (
                  <Check className="size-3.5 mr-1 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5 mr-1" />
                )}
                <span>Copy Link</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs cursor-pointer"
                onClick={() => {
                  const url = `${window.location.origin}/table/${selectedTableForQr.qrToken}`;
                  window.open(url, '_blank');
                }}
              >
                <ExternalLink className="size-3.5 mr-1" />
                <span>Mở trang</span>
              </Button>
              <Button
                size="sm"
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
                onClick={() =>
                  printTableQrCard({
                    storeName: currentStore?.name ?? 'CHICK RES',
                    tableCode: selectedTableForQr.code,
                    tableName: selectedTableForQr.name,
                    qrDataUrl,
                  })
                }
              >
                <Printer className="size-3.5 mr-1" />
                <span>In QR</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
