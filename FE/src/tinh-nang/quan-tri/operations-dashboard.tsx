'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  Info,
  TrendingUp,
  ArrowRight,
  ChefHat,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Flame,
  CheckCircle2,
  Clock,
  Receipt,
  UtensilsCrossed,
  DollarSign,
  PieChart as PieIcon,
  Percent,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Sparkles,
  QrCode,
  Store,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { AccessDenied } from '@/thanh-phan/access-denied';
import { ApiError, apiRequest, downloadProtectedFile, getActor, type Actor } from '@/thu-vien/auth';
import { useActiveStore } from '@/thu-vien/store-context';
import { toast } from 'sonner';

type Order = {
  id: string;
  status: string;
  source?: string;
  totalAmount: number;
  createdAt?: string;
  items?: { id: string; productName: string; quantity: number }[];
};
type Shift = { openedAt: string; openingCash?: number; cashMovements: { amount: number }[] } | null;
type Ticket = { id: string; status: string };

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

type DashboardMetrics = {
  storeName: string;
  range?: string;
  currentRevenue: number;
  prevRevenue: number;
  revenueGrowth: number;
  currentUsers: number;
  prevUsers: number;
  userGrowth: number;
  averageOrderValue: number;
  aovGrowth: number;
  profitability: {
    revenue: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
  };
  peakHour: string;
  hourlyDistribution: { hour: string; hourNum: number; orders: number; revenue: number }[];
  dayparts: { name: string; orders: number; revenue: number; percent: number }[];
  categoryDistribution: { category: string; quantity: number; revenue: number; percent: number }[];
  channelComparison: {
    pos: { ordersCount: number; revenue: number; aov: number; sharePercent: number };
    tableQr: { ordersCount: number; revenue: number; aov: number; sharePercent: number };
  };
  orderBrackets: { key: string; label: string; count: number; revenue: number; percent: number }[];
  salesTrend: { date: string; revenue: number; ordersCount: number }[];
  revenueBarData: { name: string; desktop: number; mobile: number }[];
  paymentSourceData: { name: string; value: number; amount?: number; color: string }[];
  topItems: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
    contributionPercent?: number;
  }[];
};

const ORDER_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PAID: {
    label: 'Đã thanh toán',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  AWAITING_PAYMENT: {
    label: 'Chờ thu tiền',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    cls: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  CANCELLED: {
    label: 'Đã huỷ',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const CATEGORY_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

export function OperationsDashboard() {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shift, setShift] = useState<Shift>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'month'>('30d');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(
    async (id: string, nextActor: Actor, range = timeRange) => {
      if (!id) return;
      setLoadError('');
      try {
        const [nextOrders, nextShift, nextTickets, nextMetrics] = await Promise.all([
          nextActor.permissions.includes('orders.read')
            ? apiRequest<Order[]>(`/orders?storeId=${encodeURIComponent(id)}`).catch(() => [])
            : Promise.resolve([]),
          nextActor.permissions.includes('shifts.read')
            ? apiRequest<Shift>(`/shifts/current?storeId=${encodeURIComponent(id)}`).catch(
                () => null,
              )
            : Promise.resolve(null),
          nextActor.permissions.includes('fulfillment.read')
            ? apiRequest<Ticket[]>(`/fulfillment/tickets?storeId=${encodeURIComponent(id)}`).catch(
                () => [],
              )
            : Promise.resolve([]),
          nextActor.permissions.includes('reports.read')
            ? apiRequest<DashboardMetrics>(
                `/reports/dashboard-metrics?storeId=${encodeURIComponent(id)}&range=${encodeURIComponent(range)}`,
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        setOrders(Array.isArray(nextOrders) ? nextOrders : []);
        setShift(nextShift);
        setTickets(Array.isArray(nextTickets) ? nextTickets : []);
        if (nextMetrics) setDashboardMetrics(nextMetrics);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        const msg =
          error instanceof Error ? error.message : 'Không thể đồng bộ dữ liệu bảng điều hành.';
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setRefreshing(false);
      }
    },
    [router, timeRange],
  );

  useEffect(() => {
    void getActor()
      .then((currentActor) => {
        setActor(currentActor);
        if (storeId) {
          void load(storeId, currentActor, timeRange);
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace('/login');
        }
      });
  }, [load, router, storeId, timeRange]);

  const handleRangeChange = (newRange: 'today' | '7d' | '30d' | 'month') => {
    setTimeRange(newRange);
    if (storeId && actor) {
      setRefreshing(true);
      void load(storeId, actor, newRange);
    }
  };

  const handleRefresh = async () => {
    if (!storeId || !actor) return;
    setRefreshing(true);
    await load(storeId, actor, timeRange);
    toast.success('Đã cập nhật dữ liệu bảng phân tích thị trường & kinh doanh');
  };

  const handleExportSales = async () => {
    if (!storeId) return;
    try {
      await downloadProtectedFile(
        `/reports/export/sales?storeId=${storeId}`,
        `doanh-thu-${currentStore?.name || 'store'}.csv`,
      );
      toast.success('Đã tải xuống file CSV doanh thu');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xuất file CSV');
    }
  };

  const paidOrders = useMemo(() => orders.filter((o) => o.status === 'PAID'), [orders]);
  const awaitingOrders = useMemo(
    () => orders.filter((o) => o.status === 'AWAITING_PAYMENT'),
    [orders],
  );
  const awaitingTotal = useMemo(
    () => awaitingOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    [awaitingOrders],
  );
  const liveRevenue = useMemo(
    () => paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    [paidOrders],
  );

  const displayRevenue = dashboardMetrics?.currentRevenue ?? liveRevenue;
  const displayGrowth = dashboardMetrics?.revenueGrowth ?? 0;
  const displayOrders = dashboardMetrics?.currentUsers ?? paidOrders.length;
  const displayOrderGrowth = dashboardMetrics?.userGrowth ?? 0;
  const aov = dashboardMetrics?.averageOrderValue ?? (displayOrders > 0 ? Math.round(displayRevenue / displayOrders) : 0);
  const aovGrowth = dashboardMetrics?.aovGrowth ?? 0;

  const profitability = dashboardMetrics?.profitability ?? {
    revenue: displayRevenue,
    totalCogs: 0,
    grossProfit: displayRevenue,
    grossMarginPercent: 0,
  };

  const peakHour = dashboardMetrics?.peakHour ?? '11:00 - 13:00';
  const hourlyData = dashboardMetrics?.hourlyDistribution ?? [];
  const daypartsData = dashboardMetrics?.dayparts ?? [];
  const categoryData = dashboardMetrics?.categoryDistribution ?? [];
  const channelData = dashboardMetrics?.channelComparison ?? {
    pos: { ordersCount: 0, revenue: 0, aov: 0, sharePercent: 0 },
    tableQr: { ordersCount: 0, revenue: 0, aov: 0, sharePercent: 0 },
  };
  const orderBracketsData = dashboardMetrics?.orderBrackets ?? [];
  const activePieData = dashboardMetrics?.paymentSourceData ?? [];
  const activeSalesTrend = dashboardMetrics?.salesTrend ?? [];
  const topItemsData = dashboardMetrics?.topItems ?? [];

  const activeTicketsCount = useMemo(
    () => tickets.filter((t) => t.status !== 'HANDED_OVER' && t.status !== 'VOIDED').length,
    [tickets],
  );

  if (!actor || !actor.permissions.includes('reports.read')) {
    return <AccessDenied area="Bảng điều hành kinh doanh" permission="reports.read" />;
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header: Title, Horizon Range Filter & Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Flame className="size-6 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Phân Tích Thị Trường & Báo Cáo Kinh Doanh
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium mt-0.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Chi nhánh: {currentStore?.name ?? 'Chick Res Main'}</span>
                <span className="text-slate-300">•</span>
                <span>Thông số thời gian thực từ POS, Khách quét QR bàn & KDS</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time Range Selector */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(
              [
                ['today', 'Hôm nay'],
                ['7d', '7 ngày'],
                ['30d', '30 ngày'],
                ['month', 'Tháng này'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleRangeChange(key)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  timeRange === key
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`size-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportSales()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white shadow-2xs transition-all cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
          <span>Lỗi đồng bộ dữ liệu: {loadError}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-2.5 py-1 rounded-lg border border-rose-200 bg-white font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Row 1: 5 Top Market Performance KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Net Revenue */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Doanh thu thuần</span>
              <TrendingUp className="size-4 text-amber-500" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                {money.format(displayRevenue)}
              </span>
              <span
                className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                  displayGrowth >= 0
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-rose-700 bg-rose-50 border-rose-200'
                }`}
              >
                {displayGrowth >= 0 ? `↑ +${displayGrowth}%` : `↓ ${displayGrowth}%`}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Đơn đã thanh toán ({timeRange})</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-amber-600">
            <Link href="/admin/reports" className="flex items-center justify-between w-full">
              <span>Xem báo cáo chi tiết</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* KPI 2: Gross Profit & Margin */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Lợi nhuận gộp & Lãi</span>
              <DollarSign className="size-4 text-emerald-600" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-black text-emerald-800 font-mono tracking-tight">
                {money.format(profitability.grossProfit)}
              </span>
              <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-1.5 py-0.2 rounded-full">
                Lãi {profitability.grossMarginPercent}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Giá vốn BOM: {money.format(profitability.totalCogs)}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-amber-600">
            <Link href="/admin/inventory" className="flex items-center justify-between w-full">
              <span>Kiểm soát kho BOM</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* KPI 3: Orders Count & AOV */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Đơn hoàn tất & AOV</span>
              <ShoppingBag className="size-4 text-blue-600" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                {displayOrders} đơn
              </span>
              <span className="inline-flex items-center text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded-full font-mono">
                TB: {money.format(aov)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {displayOrderGrowth >= 0 ? `Tăng +${displayOrderGrowth}% số đơn` : `Giảm ${displayOrderGrowth}% số đơn`}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-amber-600">
            <Link href="/orders" className="flex items-center justify-between w-full">
              <span>Xem sổ hóa đơn</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* KPI 4: Peak Hours */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Khung giờ vàng</span>
              <Zap className="size-4 text-amber-500" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-amber-900 font-mono tracking-tight">
                {peakHour}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Khung giờ khách mua đông & doanh số cao nhất</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-amber-600">
            <Link href="/kds/frying" className="flex items-center justify-between w-full">
              <span>Xem hàng đợi bếp KDS</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* KPI 5: Channel Split */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Tỷ lệ kênh bán</span>
              <Store className="size-4 text-purple-600" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-base font-extrabold text-slate-800">
                POS: <strong className="font-mono text-slate-900">{channelData.pos.sharePercent}%</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-base font-extrabold text-amber-700">
                QR: <strong className="font-mono">{channelData.tableQr.sharePercent}%</strong>
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Khách tự gọi QR bàn ({channelData.tableQr.ordersCount} đơn) vs Quầy ({channelData.pos.ordersCount} đơn)
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-600 hover:text-amber-600">
            <Link href="/admin/tables" className="flex items-center justify-between w-full">
              <span>Sơ đồ QR bàn</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 2: Khung Giờ Hoạt Động & Phân Bổ Theo Buổi (Hourly Sales Demand) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (8 cols): Biểu đồ phân bổ doanh số theo giờ */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Clock className="size-4 text-amber-500" />
                <span>Nhu cầu thị trường theo khung giờ (07:00 - 22:00)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Xem đỉnh doanh số và lượt khách gọi món để chủ động chuẩn bị ca trực và chạy khuyến mãi
              </p>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
              Giờ vàng: {peakHour}
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {hourlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0]?.payload;
                        return (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-lg text-xs space-y-1">
                            <p className="font-extrabold text-slate-900">{label}</p>
                            <div className="text-amber-700 font-mono font-black text-sm">
                              {money.format(Number(data?.revenue || 0))}
                            </div>
                            <div className="text-[11px] text-slate-600 font-semibold">
                              {data?.orders || 0} đơn phát sinh
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Chưa có dữ liệu giao dịch trong kỳ được chọn
              </div>
            )}
          </div>
        </div>

        {/* Right (4 cols): Phân bổ theo Buổi trong ngày */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <PieIcon className="size-4 text-blue-600" />
              <span>Cơ cấu doanh thu theo buổi</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Tỷ trọng đóng góp từng ca trong ngày</p>
          </div>

          <div className="space-y-3.5 my-auto">
            {daypartsData.map((dp) => (
              <div key={dp.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{dp.name}</span>
                  <span className="font-mono font-extrabold text-slate-900">
                    {money.format(dp.revenue)} ({dp.percent}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${dp.percent}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 text-right">{dp.orders} đơn</p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Dữ liệu thực tế đối soát</span>
            <span className="font-bold text-slate-800">100% thị phần</span>
          </div>
        </div>
      </div>

      {/* Row 3: Cơ cấu Danh Mục Món & Phân Khúc Chi Tiêu Khách Hàng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Category Market Share */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Layers className="size-4 text-amber-500" />
                <span>Thị hiếu theo nhóm món ăn (Category Share)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhóm sản phẩm nào đang dẫn dắt thị trường và mang lại doanh số cao nhất
              </p>
            </div>
            <Link
              href="/admin/catalog/products"
              className="text-xs font-semibold text-amber-700 hover:underline shrink-0"
            >
              Thực đơn →
            </Link>
          </div>

          <div className="space-y-3 pt-1">
            {categoryData.length > 0 ? (
              categoryData.map((cat, idx) => {
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800 flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span>{cat.category}</span>
                      </span>
                      <span className="font-mono text-slate-900">
                        {cat.quantity} phần • {money.format(cat.revenue)} ({cat.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${cat.percent}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Chưa có dữ liệu danh mục món ăn
              </div>
            )}
          </div>
        </div>

        {/* Right: Order Ticket Size Brackets */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Receipt className="size-4 text-emerald-600" />
                <span>Phân khúc mức chi tiêu của khách hàng</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Phản ánh hành vi chi tiêu (ăn nhanh 1 người, combo 2 người hay đi nhóm)
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {orderBracketsData.map((b) => (
              <div key={b.key} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{b.label}</span>
                  <span className="font-mono font-extrabold text-slate-900">
                    {b.count} đơn ({b.percent}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-800 transition-all duration-300"
                    style={{ width: `${b.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Tổng tiền: {money.format(b.revenue)}</span>
                  <span>TB {b.count > 0 ? money.format(Math.round(b.revenue / b.count)) : '0đ'}/đơn</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: So Sánh Kênh Đặt Món & Xu Hướng Doanh Số Hàng Ngày */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (5 cols): Kênh POS vs Tự gọi QR */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Store className="size-4 text-purple-600" />
              <span>Hiệu quả Kênh bán hàng</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              So sánh sức mua tại quầy thu ngân và khách tự quét QR gọi món tại bàn
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 my-auto">
            {/* POS Quầy */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">POS Tại quầy</span>
                <Store className="size-3.5 text-slate-500" />
              </div>
              <div className="text-lg font-black font-mono text-slate-900">
                {money.format(channelData.pos.revenue)}
              </div>
              <div className="space-y-0.5 text-[11px] text-slate-600">
                <p>Số đơn: <strong>{channelData.pos.ordersCount}</strong> ({channelData.pos.sharePercent}%)</p>
                <p>AOV: <strong className="font-mono">{money.format(channelData.pos.aov)}</strong></p>
              </div>
            </div>

            {/* QR Bàn */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase">QR Tại bàn</span>
                <QrCode className="size-3.5 text-amber-700" />
              </div>
              <div className="text-lg font-black font-mono text-amber-950">
                {money.format(channelData.tableQr.revenue)}
              </div>
              <div className="space-y-0.5 text-[11px] text-amber-900">
                <p>Số đơn: <strong>{channelData.tableQr.ordersCount}</strong> ({channelData.tableQr.sharePercent}%)</p>
                <p>AOV: <strong className="font-mono">{money.format(channelData.tableQr.aov)}</strong></p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100">
            Khách tự gọi qua mã QR thường xem ảnh thực đơn kỹ hơn và có xu hướng chọn thêm đồ uống/món ăn kèm.
          </p>
        </div>

        {/* Right (7 cols): Biểu đồ xu hướng hàng ngày */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Xu hướng doanh thu theo ngày</h3>
              <p className="text-xs text-slate-500 mt-0.5">Biến động doanh thu theo mốc thời gian đã chọn</p>
            </div>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
              Tổng: {money.format(displayRevenue)}
            </span>
          </div>

          <div className="h-60 w-full pt-1">
            {activeSalesTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeSalesTrend}>
                  <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-md text-xs space-y-1">
                            <p className="font-bold text-slate-900">Ngày {label}</p>
                            <div className="text-amber-700 font-mono font-bold text-sm">
                              {money.format(Number(payload[0]?.value || 0))}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {payload[0]?.payload?.ordersCount ?? 0} đơn hoàn tất
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#trendGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Chưa có dữ liệu xu hướng doanh số
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: Top 8 Món Ăn Dẫn Đầu Thị Trường & Tỷ Trọng Thanh Toán */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (8 cols): Top 8 Best Sellers with Market Contribution Rate */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Award className="size-4 text-amber-500" />
                <span>Top 8 món ăn bán chạy nhất & tỷ trọng đóng góp</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các sản phẩm ngôi sao mang lại phần lớn doanh số của nhà hàng
              </p>
            </div>
            <Link
              href="/admin/catalog/products"
              className="text-xs font-semibold text-amber-700 hover:underline shrink-0"
            >
              Xem thực đơn →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {topItemsData.length > 0 ? (
              topItemsData.map((item, idx) => {
                const maxQty = topItemsData[0]?.quantity || 1;
                const pct = Math.round((item.quantity / maxQty) * 100);
                const rankColor =
                  idx === 0
                    ? 'bg-amber-500 text-white'
                    : idx === 1
                      ? 'bg-slate-700 text-white'
                      : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-100 text-slate-600';

                return (
                  <div key={item.productId || item.name} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold gap-2">
                      <span className="text-slate-800 truncate flex items-center gap-2" title={item.name}>
                        <span className={`size-5 rounded-md font-mono text-[10px] grid place-items-center font-black shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="font-mono text-slate-900 shrink-0">
                        {item.quantity} phần
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{money.format(item.revenue)}</span>
                      {item.contributionPercent !== undefined && (
                        <span className="font-bold text-amber-800">
                          {item.contributionPercent}% doanh thu
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 py-8 text-center text-slate-400 text-xs">
                Chưa có đơn hàng nào được bán ra trong kỳ.
              </div>
            )}
          </div>
        </div>

        {/* Right (4 cols): Payment Methods Breakdown */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <CreditCard className="size-4 text-slate-700" />
              <span>Tỷ trọng phương thức thanh toán</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Tiền mặt vs Quét mã QR VietQR</p>
          </div>

          <div className="h-44 w-full flex items-center justify-center my-auto">
            {activePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activePieData}
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {activePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-xs">Chưa có giao dịch</div>
            )}
          </div>

          <div className="space-y-2 pt-1 text-xs border-t border-slate-100">
            {activePieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-bold font-mono text-slate-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 6: Đơn Hàng Gần Nhất & Vận Hành Bếp */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Giao dịch đơn hàng gần nhất</h3>
            <p className="text-xs text-slate-500">
              Hiển thị 8 đơn mới nhất tại {currentStore?.name ?? 'cửa hàng'}
            </p>
          </div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <span>Mở sổ hóa đơn ({orders.length})</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/90 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Mã đơn</th>
                <th className="px-6 py-3">Kênh đặt</th>
                <th className="px-6 py-3">Thời gian</th>
                <th className="px-6 py-3">Món ăn</th>
                <th className="px-6 py-3 text-right">Tổng tiền</th>
                <th className="px-6 py-3 text-center">Trạng thái</th>
                <th className="px-6 py-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-xs text-slate-400">
                    Chưa có đơn hàng nào tại chi nhánh này.
                  </td>
                </tr>
              ) : (
                orders.slice(0, 8).map((order) => {
                  const statusMeta = ORDER_STATUS_BADGE[order.status] ?? {
                    label: order.status,
                    cls: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs font-bold text-slate-900">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-6 py-3 text-xs">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            order.source === 'TABLE_QR'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {order.source === 'TABLE_QR' ? 'QR Bàn' : 'POS Quầy'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-6 py-3 text-xs font-medium text-slate-800 max-w-[220px] truncate">
                        {order.items && order.items.length > 0
                          ? order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')
                          : 'Đơn hàng'}
                      </td>
                      <td className="px-6 py-3 text-xs font-mono font-bold text-slate-900 text-right">
                        {money.format(order.totalAmount)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.cls}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href="/orders"
                          className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline"
                        >
                          Xem →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
