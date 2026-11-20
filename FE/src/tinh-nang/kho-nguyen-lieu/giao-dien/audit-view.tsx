'use client';

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { ClipboardCheck, History, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/thanh-phan/giao-dien/button';
import { Input } from '@/thanh-phan/giao-dien/input';
import { apiRequest } from '@/thu-vien/auth';
import { formatDateTime, formatQuantity } from '@/thu-vien/format';
import type { Location, Ingredient, StockRow, Lot, LedgerRow } from '@/tinh-nang/kho-nguyen-lieu/types';
import { unitLabel } from '@/tinh-nang/kho-nguyen-lieu/types';

interface AuditViewProps {
  storeId: string;
  locations: Location[];
  ingredients: Ingredient[];
  stock: StockRow[];
  lots: Array<Lot & { ingredientId: string; locationId: string; quantity: number }>;
  ledger: LedgerRow[];
  initialIngredientId?: string;
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}

export function AuditView({
  storeId,
  locations,
  ingredients,
  stock,
  lots,
  ledger,
  initialIngredientId,
  busy,
  run,
}: AuditViewProps) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [ingredientId, setIngredientId] = useState(
    () => initialIngredientId || stock[0]?.ingredient.id || ingredients[0]?.id || '',
  );
  const [lotId, setLotId] = useState('');
  const [countedQty, setCountedQty] = useState('10');
  const [reason, setReason] = useState('Kiểm kê định kỳ chốt số tồn cuối ngày');

  useEffect(() => {
    if (initialIngredientId) setIngredientId(initialIngredientId);
  }, [initialIngredientId]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId],
  );

  const currentStockAtLocation = useMemo(() => {
    return stock
      .filter((s) => s.ingredient.id === ingredientId && s.location.id === locationId)
      .reduce((sum, s) => sum + s.quantity, 0);
  }, [stock, ingredientId, locationId]);

  // Sync countedQty with current system stock as default starting point
  useEffect(() => {
    setCountedQty(String(currentStockAtLocation));
  }, [currentStockAtLocation, ingredientId, locationId]);

  const validLots = useMemo(
    () =>
      lots.filter(
        (lot) =>
          lot.ingredientId === ingredientId &&
          lot.locationId === locationId &&
          lot.quantity > 0,
      ),
    [lots, ingredientId, locationId],
  );

  const difference = Number(countedQty) - currentStockAtLocation;

  const presets = [
    'Kiểm kê định kỳ chốt số tồn cuối ngày',
    'Kiểm kê đột xuất đối chiếu thực tế',
    'Cân chỉnh hao hụt tự nhiên do bay hơi / rã đông',
    'Cân chỉnh sai số đóng gói từ nhà cung ứng',
  ];

  const recentAudits = useMemo(() => {
    return ledger.filter((r) => r.type === 'COUNT_ADJUSTMENT').slice(0, 15);
  }, [ledger]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/counts', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          ingredientId,
          lotId: lotId || undefined,
          locationId,
          countedQuantity: Number(countedQty),
          reason: reason.trim() || 'Kiểm kê định kỳ',
        }),
      });
    }, 'Đã cập nhật số đếm kiểm kê và cân đối kho thành công!');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Audit Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="size-5 text-indigo-600" />
              <span>Phiếu Kiểm Kê & Cân Đối Kho (Stock Count & Adjustment)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập số lượng đếm được thực tế để hệ thống tự động ghi nhận bút toán điều chỉnh thừa hoặc thiếu
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Vị trí kho kiểm kê <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Vị trí kho"
                  required
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.kind === 'STORAGE' ? 'Kho bảo quản' : 'Trạm sơ chế'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Mặt hàng kiểm đếm <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Nguyên vật liệu"
                  required
                  value={ingredientId}
                  onChange={(e) => setIngredientId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  {ingredients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({unitLabel[item.unit]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Chỉ định số lô (Tùy chọn)
                </label>
                <select
                  aria-label="Lô hàng"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Cân chỉnh tổng tồn kho tại vị trí này --</option>
                  {validLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lô: {lot.code} (Tồn phần mềm: {lot.quantity})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Theoretical vs Counted Comparison Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Tồn trên phần mềm
                </span>
                <p className="text-lg font-black text-slate-800">
                  {formatQuantity(
                    currentStockAtLocation,
                    selectedIngredient ? unitLabel[selectedIngredient.unit] : '',
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Thực tế kiểm đếm <span className="text-rose-500">*</span>
                </span>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    className="h-10 text-base font-extrabold pr-12 bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {selectedIngredient ? unitLabel[selectedIngredient.unit] : ''}
                  </span>
                </div>
              </div>

              <div className="space-y-1 sm:text-right">
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Chênh lệch (Lệch)
                </span>
                <p
                  className={`text-lg font-black ${
                    difference > 0
                      ? 'text-emerald-600'
                      : difference < 0
                        ? 'text-rose-600'
                        : 'text-slate-600'
                  }`}
                >
                  {difference > 0 ? `+${difference}` : difference}{' '}
                  <span className="text-xs font-normal">
                    {selectedIngredient ? unitLabel[selectedIngredient.unit] : ''}
                  </span>
                </p>
                <span className="text-[10px] text-slate-400 block">
                  {difference > 0
                    ? 'Thừa kho (Sẽ ghi tăng)'
                    : difference < 0
                      ? 'Thiếu kho (Sẽ ghi giảm)'
                      : 'Khớp số liệu'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Lý do kiểm kê / Diễn giải</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do kiểm kê..."
                className="h-9 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className="px-2 py-1 rounded-md text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !ingredientId || !locationId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10"
            >
              <ClipboardCheck className="size-4 mr-2" />
              {busy ? 'Đang lưu cân kho...' : 'Xác nhận Bút toán Cân đối kho'}
            </Button>
          </form>
        </div>

        {/* Right: History */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <History className="size-4 text-slate-400" />
              <span>Lịch Sử Kiểm Kê Gần Đây</span>
            </h3>
            <Link
              href="/admin/inventory/ledger"
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
            >
              Xem thẻ kho &rarr;
            </Link>
          </div>

          {recentAudits.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Chưa có bút toán kiểm kê nào.</p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {recentAudits.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{r.ingredient.name}</span>
                    <span
                      className={`font-mono font-bold ${
                        r.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {r.quantity >= 0 ? `+${r.quantity}` : r.quantity}{' '}
                      {unitLabel[r.ingredient.unit]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>{formatDateTime(r.occurredAt)}</span>
                    <span>{r.location.name}</span>
                  </div>
                  {r.note && (
                    <p className="text-[11px] text-slate-600 italic border-t border-slate-200/50 pt-1">
                      {r.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
