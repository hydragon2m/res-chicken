'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/thanh-phan/giao-dien/card';
import { AccessDenied } from '@/thanh-phan/access-denied';
import { ApiError, apiRequest, downloadProtectedFile, getActor, type Actor } from '@/thu-vien/auth';
import { useActiveStore } from '@/thu-vien/store-context';
import { toast } from 'sonner';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

type SalesSummary = {
  storeId: string;
  orderCount: number;
  refundedOrderCount?: number;
  totalRevenue: number;
  netSales: number;
  refundTotal: number;
  totalDiscount: number;
  totalSubtotal: number;
  totalCogs?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  consumedTicketsCount?: number;
  averageOrderValue: number;
  paymentMethods: Record<string, number>;
  sources: Record<string, number>;
};

type TopItem = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

type ShiftItem = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  openingCash: number;
  declaredCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  movementsCount: number;
  cashSalesTotal: number;
};

type ShiftsReportResponse = {
  storeId: string;
  totalShifts: number;
  closedShiftsCount: number;
  totalVariance: number;
  shifts: ShiftItem[];
};

type WasteItem = {
  id: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  reason: string;
  wastedAt: string;
};

type WasteReportResponse = {
  storeId: string;
  totalWastedEntries: number;
  totalWastedQuantity: number;
  byReason: Record<string, number>;
  wastes: WasteItem[];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt tại quầy (CASH)',
  QR_VIETQR: 'Chuyển khoản VietQR (QR_VIETQR)',
  CARD: 'Thẻ ngân hàng (CARD)',
};

const ORDER_SOURCE_LABELS: Record<string, string> = {
  POS: 'Bán tại quầy (POS)',
  TABLE_QR: 'Khách tự đặt tại bàn (QR Bàn)',
  WEB: 'Đặt trực tuyến (Web)',
};

export default function ReportsPage() {
  const router = useRouter();
  const { currentStoreId: storeId, currentStore } = useActiveStore();
  const [actor, setActor] = useState<Actor | null>(null);

  const [activeTab, setActiveTab] = useState<'sales' | 'items' | 'shifts' | 'waste'>('sales');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [salesData, setSalesData] = useState<SalesSummary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [shiftsData, setShiftsData] = useState<ShiftsReportResponse | null>(null);
  const [wasteData, setWasteData] = useState<WasteReportResponse | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void getActor()
      .then(setActor)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace('/login');
      });
  }, [router]);

  const buildQueryString = useCallback(() => {
    const now = new Date();
    const query = new URLSearchParams({ storeId });
    if (dateRange === '7d') {
      query.set('from', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      query.set('to', now.toISOString());
    } else if (dateRange === '30d') {
      query.set('from', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
      query.set('to', now.toISOString());
    }
    return query.toString();
  }, [storeId, dateRange]);

  const loadReports = useCallback(async () => {
    if (!storeId || !actor) return;
    setLoading(true);
    setLoadError('');
    const qs = buildQueryString();

    try {
      const [salesRes, itemsRes, shiftsRes, wasteRes] = await Promise.all([
        apiRequest<SalesSummary>(`/reports/sales?${qs}`),
        apiRequest<TopItem[]>(`/reports/top-selling?${qs}&limit=20`),
        apiRequest<ShiftsReportResponse>(`/reports/shifts?${qs}`),
        apiRequest<WasteReportResponse>(`/reports/inventory-waste?${qs}`),
      ]);
      setSalesData(salesRes);
      setTopItems(Array.isArray(itemsRes) ? itemsRes : []);
      setShiftsData(shiftsRes);
      setWasteData(wasteRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải báo cáo tài chính.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [storeId, actor, buildQueryString]);

  useEffect(() => {
    if (storeId && actor) {
      void loadReports();
    }
  }, [storeId, actor, loadReports]);

  const handleExport = async (type: 'sales' | 'inventory') => {
    if (!storeId) return;
    setExporting(true);
    try {
      const qs = buildQueryString();
      await downloadProtectedFile(
        `/reports/export/${type}?${qs}`,
        `bao-cao-${type}-${currentStore?.name || 'store'}.csv`,
      );
      toast.success(`Đã xuất báo cáo ${type === 'sales' ? 'doanh thu' : 'tồn kho'} thành công`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xuất file CSV');
    } finally {
      setExporting(false);
    }
  };

  if (!actor || !actor.permissions.includes('reports.read')) {
    return <AccessDenied area="Báo cáo & Đối soát" permission="reports.read" />;
  }

  const paymentMethodEntries = Object.entries(salesData?.paymentMethods ?? {});
  const sourceEntries = Object.entries(salesData?.sources ?? {});
  const shiftsList = shiftsData?.shifts ?? [];
  const wasteList = wasteData?.wastes ?? [];

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Báo Cáo & Đối Soát Tài Chính
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Chi nhánh:{' '}
                <span className="font-semibold text-slate-700">
                  {currentStore?.name ?? 'Chick Res Main'}
                </span>{' '}
                • Đối soát doanh thu, ca làm việc, món bán chạy và hao hụt kho
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDateRange('7d')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                dateRange === '7d'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 ngày
            </button>
            <button
              type="button"
              onClick={() => setDateRange('30d')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                dateRange === '30d'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 ngày
            </button>
            <button
              type="button"
              onClick={() => setDateRange('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                dateRange === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toàn thời gian
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void loadReports()}
            className="gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </Button>

          <Button
            size="sm"
            disabled={exporting}
            onClick={() => void handleExport('sales')}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>CSV Doanh thu</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={() => void handleExport('inventory')}
            className="font-semibold gap-1.5 cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>CSV Tồn kho</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center justify-between">
          <span>Lỗi tải báo cáo: {loadError}</span>
          <Button variant="outline" size="xs" onClick={() => void loadReports()}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'sales'
              ? 'border-amber-500 text-amber-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          1. Doanh thu & Thanh toán
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('items')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'items'
              ? 'border-amber-500 text-amber-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          2. Top Món bán chạy ({topItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shifts')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'shifts'
              ? 'border-amber-500 text-amber-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          3. Đối soát Ca tiền mặt ({shiftsList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('waste')}
          className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'waste'
              ? 'border-amber-500 text-amber-900 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          4. Hao hụt & Hủy kho ({wasteList.length})
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">Đang tải số liệu đối soát…</div>
      ) : activeTab === 'sales' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  DOANH THU THUẦN (NET SALES)
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 font-mono">
                  {money.format(salesData?.netSales ?? salesData?.totalRevenue ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-emerald-600 font-medium">
                Tạm tính: {money.format(salesData?.totalSubtotal ?? 0)} • Hoàn tiền:{' '}
                {money.format(salesData?.refundTotal ?? 0)}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  SỐ ĐƠN & XUẤT KHO ĐỊNH LƯỢNG
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 font-mono">
                  {salesData?.orderCount ?? 0} đơn
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-slate-500">
                Đã trừ kho BOM: {salesData?.consumedTicketsCount ?? 0} đơn • TB:{' '}
                {money.format(salesData?.averageOrderValue ?? 0)}/đơn
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  GIÁ VỐN XUẤT KHO (BOM COGS)
                </CardDescription>
                <CardTitle className="text-2xl font-black text-rose-700 font-mono">
                  {money.format(salesData?.totalCogs ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-slate-500">
                Tính tự động từ đơn giá lô nhập × định mức BOM
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-emerald-800">
                  LỢI NHUẬN GỘP (DOANH THU - KHO)
                </CardDescription>
                <CardTitle className="text-2xl font-black text-emerald-800 font-mono">
                  {money.format(
                    salesData?.grossProfit ??
                      (salesData?.netSales ?? 0) - (salesData?.totalCogs ?? 0),
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-emerald-700 font-semibold">
                Biên lợi nhuận gộp: {salesData?.grossMarginPercent ?? 0}%
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  TỔNG KHUYẾN MÃI / VOUCHER
                </CardDescription>
                <CardTitle className="text-2xl font-black text-amber-700 font-mono">
                  {money.format(salesData?.totalDiscount ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-slate-500">
                Tổng chiết khấu đã áp dụng ({salesData?.refundedOrderCount ?? 0} đơn hoàn)
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Methods Breakdown Table */}
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Bảng đối soát theo phương thức thanh toán
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Phương thức thanh toán</th>
                      <th className="py-3 px-4 text-right">Tổng tiền thu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paymentMethodEntries.length > 0 ? (
                      paymentMethodEntries.map(([method, amount]) => (
                        <tr key={method} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {PAYMENT_METHOD_LABELS[method] ?? method}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {money.format(amount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-slate-400">
                          Chưa có giao dịch thanh toán nào trong kỳ.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Order Sources Breakdown Table */}
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Bảng phân bổ đơn hàng theo nguồn đặt món
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Kênh bán hàng</th>
                      <th className="py-3 px-4 text-right">Số lượng đơn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sourceEntries.length > 0 ? (
                      sourceEntries.map(([src, count]) => (
                        <tr key={src} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {ORDER_SOURCE_LABELS[src] ?? src}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {count} đơn
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-slate-400">
                          Chưa có đơn hàng nào trong kỳ.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : activeTab === 'items' ? (
        <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
            <CardTitle className="text-sm font-bold text-slate-900">
              Bảng xếp hạng món ăn & biến thể bán chạy nhất
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-24">Hạng</th>
                  <th className="py-3 px-4">Tên món ăn & Quy cách</th>
                  <th className="py-3 px-4 text-center">Số lượng bán</th>
                  <th className="py-3 px-4 text-right">Doanh thu đóng góp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topItems.length > 0 ? (
                  topItems.map((item, idx) => (
                    <tr key={`${item.productId}-${item.name}`} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-amber-700">#{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        {item.quantity} phần
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {money.format(item.revenue)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Chưa có số liệu món bán chạy trong kỳ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : activeTab === 'shifts' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  TỔNG SỐ CA LÀM VIỆC
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 font-mono">
                  {shiftsData?.totalShifts ?? 0} ca
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  CA ĐÃ ĐÓNG SỔ
                </CardDescription>
                <CardTitle className="text-2xl font-black text-emerald-700 font-mono">
                  {shiftsData?.closedShiftsCount ?? 0} ca
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  TỔNG CHÊNH LỆCH TIỀN MẶT
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 font-mono">
                  {money.format(shiftsData?.totalVariance ?? 0)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-sm font-bold text-slate-900">
                Danh sách đối soát ca tiền mặt (Shifts)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Thời gian mở ca</th>
                    <th className="py-3 px-4">Thời gian đóng ca</th>
                    <th className="py-3 px-4 text-center">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Quỹ đầu ca</th>
                    <th className="py-3 px-4 text-right">Bán tiền mặt</th>
                    <th className="py-3 px-4 text-right">Lý thuyết</th>
                    <th className="py-3 px-4 text-right">Thực kiểm</th>
                    <th className="py-3 px-4 text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shiftsList.length > 0 ? (
                    shiftsList.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 text-xs font-mono">
                          {new Date(s.openedAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">
                          {s.closedAt ? new Date(s.closedAt).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              s.status === 'OPEN'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {s.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {money.format(s.openingCash)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          +{money.format(s.cashSalesTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {s.expectedCash !== null ? money.format(s.expectedCash) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {s.declaredCash !== null ? money.format(s.declaredCash) : '—'}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            (s.variance ?? 0) === 0
                              ? 'text-emerald-600'
                              : (s.variance ?? 0) < 0
                                ? 'text-red-600'
                                : 'text-amber-600'
                          }`}
                        >
                          {s.variance !== null ? money.format(s.variance) : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Chưa có dữ liệu ca làm việc trong kỳ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  SỐ LẦN GHI NHẬN HAO HỤT
                </CardDescription>
                <CardTitle className="text-2xl font-black text-slate-900 font-mono">
                  {wasteData?.totalWastedEntries ?? 0} phiếu
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-bold text-slate-500">
                  TỔNG ĐƠN VỊ HAO HỤT
                </CardDescription>
                <CardTitle className="text-2xl font-black text-rose-600 font-mono">
                  {wasteData?.totalWastedQuantity ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-4">
              <CardTitle className="text-sm font-bold text-slate-900">
                Bảng nhật ký hao hụt & hủy kho nguyên vật liệu
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Thời gian ghi nhận</th>
                    <th className="py-3 px-4">Nguyên vật liệu</th>
                    <th className="py-3 px-4 text-center">Số lượng hao hụt</th>
                    <th className="py-3 px-4">Lý do xuất hủy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wasteList.length > 0 ? (
                    wasteList.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {new Date(w.wastedAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{w.ingredientName}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-rose-600">
                          -{w.quantity} {w.unit}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{w.reason}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        Không có phát sinh hao hụt hoặc hủy kho trong kỳ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
