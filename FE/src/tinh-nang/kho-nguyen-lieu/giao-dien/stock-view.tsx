'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  ArrowDownToLine,
  ArrowLeftRight,
  ClipboardCheck,
  Trash2,
} from 'lucide-react';
import { Input } from '@/thanh-phan/giao-dien/input';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Badge } from '@/thanh-phan/giao-dien/badge';
import { formatDate, formatQuantity } from '@/thu-vien/format';
import type { StockRow, Location, Ingredient, InventoryAlerts } from '@/tinh-nang/kho-nguyen-lieu/types';
import { unitLabel, money } from '@/tinh-nang/kho-nguyen-lieu/types';

interface StockViewProps {
  stock: StockRow[];
  locations: Location[];
  ingredients: Ingredient[];
  alerts: InventoryAlerts;
  canManage: boolean;
  onNavigate?: (section: string, ingredientId?: string) => void;
}

export function StockView({
  stock,
  locations,
  ingredients,
  alerts,
  canManage,
  onNavigate,
}: StockViewProps) {
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
      {/* 3 Executive Alert & Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Low Stock Warning */}
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
                    Dưới định mức tồn an toàn
                  </h3>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-extrabold text-xs">
                {alerts.lowStock.length} mặt hàng
              </span>
            </div>

            {alerts.lowStock.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Tất cả {ingredients.length} nguyên liệu đều đạt ngưỡng tồn an toàn.
              </p>
            ) : (
              <ul className="space-y-2 text-xs divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                {alerts.lowStock.map((row) => (
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
                        <Link
                          href={`/admin/inventory/receive?ingredientId=${row.ingredient.id}`}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Nhập ngay
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage && alerts.lowStock.length > 0 && (
            <Link
              href="/admin/inventory/receive"
              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 pt-2 border-t border-rose-100"
            >
              <span>+ Tạo phiếu nhập kho bổ sung mặt hàng thiếu</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>

        {/* Card 2: FEFO Expiry Management */}
        <div className="p-5 rounded-2xl bg-white border border-amber-200 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    Kiểm soát HSD (FEFO)
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">Lô hàng cận / quá hạn</h3>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-extrabold text-xs">
                {alerts.nearExpiry.length} lô
              </span>
            </div>

            {alerts.nearExpiry.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Không có lô nguyên liệu nào cận hạn trong 7 ngày tới.
              </p>
            ) : (
              <ul className="space-y-2 text-xs divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                {alerts.nearExpiry.map((row) => (
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
                      {canManage && (
                        <Link
                          href={`/admin/inventory/waste?ingredientId=${row.ingredient.id}`}
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Xử lý hủy
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage && alerts.nearExpiry.length > 0 && (
            <Link
              href="/admin/inventory/waste"
              className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1.5 pt-2 border-t border-amber-100"
            >
              <span>Xem chi tiết & lập phiếu xuất hủy lô quá hạn</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>

        {/* Card 3: Today's Receipts */}
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
              <ul className="space-y-2 text-xs divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                {alerts.todayReceived.map((row) => (
                  <li key={row.lot.id} className="pt-2 flex justify-between items-center">
                    <span className="font-bold text-slate-800 truncate">{row.ingredient.name}</span>
                    <span className="text-emerald-700 font-bold shrink-0">
                      +{formatQuantity(row.quantity, unitLabel[row.ingredient.unit])} (Lô{' '}
                      {row.lot.code})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/admin/inventory/receive"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 pt-2 border-t border-emerald-100"
          >
            <span>+ Tạo phiếu nhập hàng từ nhà cung cấp</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-slate-900 text-base">
              Bảng Tồn Kho Thực Tế Theo Lô & Khu Vực Lưu Trữ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tra cứu tồn kho chi tiết tại Kho chính và Trạm sơ chế bếp • Thao tác nhanh chuyển kho, kiểm kê hoặc nhập thêm
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
              <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                <Link href="/admin/inventory/receive">+ Tạo phiếu nhập kho đầu tiên</Link>
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
                  {canManage && <th className="px-5 py-3.5 text-right">Nghiệp vụ liên quan</th>}
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
                            <Link
                              href={`/admin/inventory/receive?ingredientId=${row.ingredient.id}`}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs transition-colors inline-flex items-center gap-1"
                              title="Tạo phiếu nhập thêm"
                            >
                              <ArrowDownToLine className="size-3" />
                              <span>Nhập</span>
                            </Link>
                            <Link
                              href={`/admin/inventory/transfer?ingredientId=${row.ingredient.id}`}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-semibold text-xs transition-colors inline-flex items-center gap-1"
                              title="Điều chuyển sang trạm sơ chế"
                            >
                              <ArrowLeftRight className="size-3" />
                              <span>Chuyển</span>
                            </Link>
                            <Link
                              href={`/admin/inventory/audit?ingredientId=${row.ingredient.id}`}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold text-xs transition-colors inline-flex items-center gap-1"
                              title="Kiểm kê cân kho"
                            >
                              <ClipboardCheck className="size-3" />
                              <span>Kiểm kê</span>
                            </Link>
                            <Link
                              href={`/admin/inventory/waste?ingredientId=${row.ingredient.id}`}
                              className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs transition-colors inline-flex items-center gap-1"
                              title="Báo hỏng / Xuất hủy"
                            >
                              <Trash2 className="size-3" />
                            </Link>
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
