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
import { AccessDenied } from '../../components/access-denied';
import { ApiError, apiRequest, downloadProtectedFile, getActor, type Actor } from '../../lib/auth';
import { useActiveStore } from '../../lib/store-context';
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
  currentRevenue: number;
  prevRevenue: number;
  revenueGrowth: number;
  currentUsers: number;
  userGrowth: number;
  averageOrderValue?: number;
  salesTrend?: { date: string; revenue: number; ordersCount: number }[];
  revenueBarData: { name: string; desktop: number; mobile: number }[];
  paymentSourceData: { name: string; value: number; color: string }[];
  topItems: { productId: string; name: string; quantity: number; revenue: number }[];
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

export function OperationsDashboard() {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shift, setShift] = useState<Shift>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(
    async (id: string, nextActor: Actor) => {
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
                `/reports/dashboard-metrics?storeId=${encodeURIComponent(id)}`,
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
    [router],
  );

  useEffect(() => {
    void getActor()
      .then((currentActor) => {
        setActor(currentActor);
        if (storeId) {
          void load(storeId, currentActor);
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace('/login');
        }
      });
  }, [load, router, storeId]);

  const handleRefresh = async () => {
    if (!storeId || !actor) return;
    setRefreshing(true);
    await load(storeId, actor);
    toast.success('Đã cập nhật dữ liệu bảng điều hành');
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

  const displayRevenue = dashboardMetrics?.currentRevenue || liveRevenue;
  const displayGrowth = dashboardMetrics?.revenueGrowth ?? 0;
  const displayUsers = dashboardMetrics?.currentUsers || paidOrders.length;
  const aov =
    dashboardMetrics?.averageOrderValue ||
    (displayUsers > 0 ? Math.round(displayRevenue / displayUsers) : 0);

  const activeBarData = dashboardMetrics?.revenueBarData ?? [];
  const activePieData = dashboardMetrics?.paymentSourceData ?? [];
  const activeSalesTrend = dashboardMetrics?.salesTrend ?? [];

  const activeTicketsCount = useMemo(
    () => tickets.filter((t) => t.status !== 'HANDED_OVER' && t.status !== 'VOIDED').length,
    [tickets],
  );

  if (!actor || !actor.permissions.includes('reports.read')) {
    return <AccessDenied area="Bảng điều hành kinh doanh" permission="reports.read" />;
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20">
              <Flame className="size-5 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Tổng Quan Vận Hành & Kinh Doanh
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium mt-0.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Chi nhánh: {currentStore?.name ?? 'Chick Res Main'}</span>
                <span className="text-slate-300">•</span>
                <span>Đồng bộ dữ liệu thực tế từ POS & KDS</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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
            <span>Xuất CSV Doanh thu</span>
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

      {/* Row 1: 4 Distinct KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Revenue */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Doanh thu đã thu</span>
              <TrendingUp className="size-4 text-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {money.format(displayRevenue)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                {displayGrowth >= 0 ? `↑ +${displayGrowth}%` : `↓ ${displayGrowth}%`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tổng doanh thu từ các đơn đã thanh toán
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-amber-600 transition-colors">
            <Link href="/admin/reports" className="flex items-center justify-between w-full">
              <span>Xem báo cáo chi tiết</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Card 2: Paid Orders & AOV */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Đơn hoàn tất (PAID)</span>
              <ShoppingBag className="size-4 text-emerald-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {displayUsers} đơn
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                TB: {money.format(aov)}/đơn
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tổng số {orders.length} đơn phát sinh trên hệ thống
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-amber-600 transition-colors">
            <Link href="/orders" className="flex items-center justify-between w-full">
              <span>Mở sổ đơn hàng</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Card 3: Awaiting Payment Orders */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Đơn chờ thu tiền</span>
              <Receipt className="size-4 text-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600 font-mono tracking-tight">
                {awaitingOrders.length} đơn
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                {money.format(awaitingTotal)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Đơn đặt tại quầy hoặc khách quét QR tại bàn
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-amber-600 transition-colors">
            <Link href="/pos" className="flex items-center justify-between w-full">
              <span>Mở quầy POS thu ngân</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Card 4: KDS & Shift Status */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Điều phối Bếp & Ca</span>
              <ChefHat className="size-4 text-orange-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {activeTicketsCount} ticket
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                  shift
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {shift ? 'Ca đang mở' : 'Ca đang đóng'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Phiếu bếp đang chờ chiên / đóng gói trả khách
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-amber-600 transition-colors">
            <Link href="/kds/frying" className="flex items-center justify-between w-full">
              <span>Mở màn hình bếp KDS</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 2: 2 Middle Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Revenue by Channel */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-slate-900 text-base">Doanh thu theo nguồn đặt món</h3>
              <Info className="size-3.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-4 text-xs font-bold">
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="size-2.5 rounded-sm bg-slate-700" />
                <span>POS Tại quầy</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-600">
                <span className="size-2.5 rounded-sm bg-amber-500" />
                <span>QR Bàn & Online</span>
              </div>
            </div>
          </div>

          <div className="h-60 w-full pt-2">
            {activeBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activeBarData} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-md text-xs space-y-1">
                            <p className="font-bold text-slate-900">{label}</p>
                            <div className="flex items-center justify-between gap-3 text-slate-600 font-mono text-[11px]">
                              <span>POS Tại quầy:</span>
                              <span className="font-bold">{payload[0]?.value}k ₫</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-amber-600 font-mono text-[11px]">
                              <span>QR Bàn / Khác:</span>
                              <span className="font-bold">{payload[1]?.value}k ₫</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="desktop" name="POS Tại quầy" fill="#334155" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="mobile" name="QR Bàn" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Chưa có dữ liệu giao dịch 6 tháng gần nhất
              </div>
            )}
          </div>
        </div>

        {/* Right: 14-day Sales Trend Area Chart */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Xu hướng doanh thu 14 ngày</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-black text-slate-900 font-mono">
                  {money.format(displayRevenue)}
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Dữ liệu thực tế
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleExportSales()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="size-3.5 text-slate-500" />
              <span>Xuất CSV</span>
            </button>
          </div>

          <div className="h-60 w-full pt-2">
            {activeSalesTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeSalesTrend}>
                  <defs>
                    <linearGradient id="amberGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-md text-xs space-y-1">
                            <p className="font-bold text-slate-900">{label}</p>
                            <div className="text-amber-700 font-mono font-bold text-xs">
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
                    fill="url(#amberGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Chưa có dữ liệu xu hướng doanh thu
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: 3 Bottom Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Top Selling Items */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Top món bán chạy nhất</h3>
            <Link
              href="/admin/catalog/products"
              className="text-xs font-semibold text-amber-700 hover:underline"
            >
              Thực đơn &gt;
            </Link>
          </div>

          <div className="space-y-4 pt-1">
            {dashboardMetrics?.topItems && dashboardMetrics.topItems.length > 0 ? (
              dashboardMetrics.topItems.slice(0, 4).map((item, idx) => {
                const maxQty = dashboardMetrics.topItems[0]?.quantity || 1;
                const pct = Math.round((item.quantity / maxQty) * 100);
                const barColor =
                  idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-800' : 'bg-slate-400';
                return (
                  <div key={item.productId || item.name}>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-800 truncate max-w-[180px]" title={item.name}>
                        {idx + 1}. {item.name}
                      </span>
                      <span className="font-mono text-slate-900 shrink-0">
                        {item.quantity} phần ({money.format(item.revenue)})
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                Chưa có đơn hàng nào được bán ra trong kỳ.
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Payment Methods */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Tỷ trọng thanh toán</h3>
            <CreditCard className="size-4 text-slate-400" />
          </div>

          <div className="h-40 w-full flex items-center justify-center">
            {activePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activePieData}
                    innerRadius={50}
                    outerRadius={70}
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

          <div className="space-y-1.5 pt-1 text-xs">
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

        {/* Card 3: Ca trực & Trạng thái Bếp KDS */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Vận hành ca & Bếp</h3>
            <Link href="/pos" className="text-xs font-semibold text-amber-700 hover:underline">
              Quầy POS &gt;
            </Link>
          </div>

          <div className="space-y-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-amber-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Ca tiền mặt hiện tại</p>
                  <p className="text-[11px] text-slate-500">
                    {shift?.openedAt
                      ? `Mở lúc ${new Date(shift.openedAt).toLocaleTimeString('vi-VN')}`
                      : 'Chưa mở ca làm việc'}
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  shift
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {shift ? 'Đang mở' : 'Đã đóng'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="size-4 text-orange-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Đơn chờ chế biến</p>
                  <p className="text-[11px] text-slate-500">Hàng đợi trạm chiên & đóng gói</p>
                </div>
              </div>
              <span className="text-xs font-bold font-mono bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                {activeTicketsCount} ticket
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Đồng bộ thời gian thực</p>
                  <p className="text-[11px] text-slate-500">POS ↔ KDS ↔ Tồn kho BOM</p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 font-mono">Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Structured Recent Orders Data Table */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Danh sách đơn hàng gần nhất</h3>
            <p className="text-xs text-slate-500">
              Hiển thị 8 giao dịch mới nhất tại {currentStore?.name ?? 'cửa hàng'}
            </p>
          </div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <span>Xem toàn bộ sổ đơn ({orders.length})</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/90 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Mã đơn</th>
                <th className="px-6 py-3">Nguồn đặt</th>
                <th className="px-6 py-3">Thời gian</th>
                <th className="px-6 py-3">Món ăn</th>
                <th className="px-6 py-3 text-right">Tổng tiền</th>
                <th className="px-6 py-3 text-center">Trạng thái</th>
                <th className="px-6 py-3 text-right">Thao tác</th>
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
                          {order.source === 'TABLE_QR' ? 'QR Tại bàn' : 'POS Tại quầy'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-700 max-w-[260px] truncate">
                        {order.items && order.items.length > 0
                          ? order.items
                              .map((it) => `${it.productName} (x${it.quantity})`)
                              .join(', ')
                          : 'Đơn hàng tại quầy'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {money.format(order.totalAmount)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.cls}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href="/orders"
                          className="text-xs font-semibold text-amber-700 hover:underline"
                        >
                          Chi tiết
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
