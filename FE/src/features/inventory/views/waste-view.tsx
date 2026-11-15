'use client';

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { Trash2, AlertTriangle, History, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/auth';
import { formatDateTime, formatQuantity, formatDate } from '@/lib/format';
import type { Location, Ingredient, StockRow, Lot, LedgerRow, InventoryAlerts } from '../types';
import { unitLabel, money } from '../types';

interface WasteViewProps {
  storeId: string;
  locations: Location[];
  ingredients: Ingredient[];
  stock: StockRow[];
  lots: Array<Lot & { ingredientId: string; locationId: string; quantity: number }>;
  alerts: InventoryAlerts;
  ledger: LedgerRow[];
  initialIngredientId?: string;
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}

export function WasteView({
  storeId,
  locations,
  ingredients,
  stock,
  lots,
  alerts,
  ledger,
  initialIngredientId,
  busy,
  run,
}: WasteViewProps) {
  const [ingredientId, setIngredientId] = useState(
    () => initialIngredientId || stock[0]?.ingredient.id || ingredients[0]?.id || '',
  );
  const [locationId, setLocationId] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('5');
  const [reason, setReason] = useState('Hết hạn sử dụng (FEFO) theo quy định');

  useEffect(() => {
    if (initialIngredientId) setIngredientId(initialIngredientId);
  }, [initialIngredientId]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId],
  );

  const currentIngredientStock = useMemo(
    () => stock.filter((s) => s.ingredient.id === ingredientId && s.quantity > 0),
    [stock, ingredientId],
  );

  const validLots = useMemo(
    () => lots.filter((lot) => lot.ingredientId === ingredientId && lot.quantity > 0),
    [lots, ingredientId],
  );

  // Set default location and quantity
  useEffect(() => {
    const defaultLoc =
      currentIngredientStock[0]?.location.id ??
      locations.find((l) => l.kind === 'STORAGE')?.id ??
      locations[0]?.id ??
      '';
    setLocationId(defaultLoc);

    const avail = currentIngredientStock
      .filter((s) => s.location.id === defaultLoc)
      .reduce((sum, s) => sum + s.quantity, 0);

    setQuantity(String(avail > 0 ? Math.max(1, Math.round(avail * 0.1)) : 5));
  }, [ingredientId, currentIngredientStock, locations]);

  const selectedLot = useMemo(() => lots.find((l) => l.id === lotId), [lots, lotId]);

  const estimatedLoss = useMemo(() => {
    const q = Number(quantity) || 0;
    const cost = selectedLot?.unitCost ?? 0;
    return q * cost;
  }, [quantity, selectedLot]);

  const presets = [
    'Hết hạn sử dụng (FEFO) theo quy chuẩn an toàn',
    'Rách bao bì / Hỏng điều kiện bảo quản mát',
    'Rơi vãi / Nhiễm bẩn trong quá trình sơ chế',
    'Cháy khét / Hỏng nhiệt trong quá trình chiên nấu bếp',
    'Mẫu thử nghiệm kiểm định chất lượng',
  ];

  const recentWastes = useMemo(() => {
    return ledger.filter((r) => r.type === 'WASTE').slice(0, 15);
  }, [ledger]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/wastes', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          ingredientId,
          lotId: lotId || undefined,
          locationId,
          quantity: Number(quantity),
          reason: reason.trim() || 'Hao hụt chế biến',
        }),
      });
    }, 'Đã ghi nhận phiếu xuất hủy / hao hụt thành công!');
  };

  return (
    <div className="space-y-6">
      {/* Expiry Alert Callout if any */}
      {alerts.nearExpiry.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Clock className="size-5 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-rose-900">
                Phát hiện {alerts.nearExpiry.length} lô hàng cận / quá hạn sử dụng
              </h4>
              <p className="text-[11px] text-rose-700">
                Hãy ưu tiên kiểm tra hoặc lập phiếu xuất hủy để đảm bảo an toàn vệ sinh thực phẩm.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alerts.nearExpiry.slice(0, 3).map((item) => (
              <button
                key={item.lot.id}
                type="button"
                onClick={() => {
                  setIngredientId(item.ingredient.id);
                  setLotId(item.lot.id);
                  setQuantity(String(item.quantity));
                  setReason('Hết hạn sử dụng (FEFO) theo quy định');
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 cursor-pointer"
              >
                Hủy lô {item.lot.code} ({item.ingredient.name})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Waste Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Trash2 className="size-5 text-rose-600" />
              <span>Phiếu Báo Hỏng & Xuất Hủy Hao Hụt (Waste / Spoilage)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ghi giảm tồn kho và ghi nhận chi phí hao hụt đối với nguyên liệu hết hạn, rơi vỡ hoặc lỗi bếp
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nguyên vật liệu xuất hủy <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Nguyên vật liệu"
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
                  Kho chứa mặt hàng hư hỏng <span className="text-rose-500">*</span>
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

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Chỉ định mã lô hàng hư hỏng
                </label>
                <select
                  aria-label="Lô hàng"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">⚡ Tự động trừ theo lô FEFO cận hạn nhất</option>
                  {validLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lô: {lot.code} (Còn {lot.quantity}){' '}
                      {lot.expiresAt ? `• HSD: ${formatDate(lot.expiresAt)}` : ''} • Giá:{' '}
                      {money.format(lot.unitCost)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Số lượng xuất hủy <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.001"
                    step="any"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-10 text-base font-extrabold pr-12 bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {selectedIngredient ? unitLabel[selectedIngredient.unit] : ''}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                  Giá trị hao hụt ước tính
                </span>
                <p className="text-lg font-black text-rose-600">
                  {estimatedLoss > 0 ? money.format(estimatedLoss) : '—'}
                </p>
                <span className="text-[10px] text-slate-400 block">
                  Dựa trên đơn giá vốn của lô hàng
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Lý do xuất hủy / Phân loại</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do xuất hủy..."
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
              disabled={busy || !ingredientId}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-10"
            >
              <Trash2 className="size-4 mr-2" />
              {busy ? 'Đang ghi nhận hủy...' : 'Xác nhận Xuất hủy & Trừ kho'}
            </Button>
          </form>
        </div>

        {/* Right: History */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <History className="size-4 text-slate-400" />
              <span>Nhật Ký Xuất Hủy Gần Đây</span>
            </h3>
            <Link
              href="/admin/inventory/ledger"
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
            >
              Xem thẻ kho &rarr;
            </Link>
          </div>

          {recentWastes.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Chưa có phiếu xuất hủy nào.</p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {recentWastes.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-xl border border-rose-100 bg-rose-50/40 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{r.ingredient.name}</span>
                    <span className="font-bold text-rose-600">
                      -{formatQuantity(r.quantity, unitLabel[r.ingredient.unit])}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>{formatDateTime(r.occurredAt)}</span>
                    <span>{r.location.name}</span>
                  </div>
                  {r.note && (
                    <p className="text-[11px] text-slate-700 italic border-t border-rose-100 pt-1">
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
