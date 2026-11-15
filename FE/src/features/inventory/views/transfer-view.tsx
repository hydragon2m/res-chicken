'use client';

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Check, History, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/auth';
import { formatDateTime, formatQuantity } from '@/lib/format';
import type { Location, Ingredient, StockRow, Lot, LedgerRow } from '../types';
import { unitLabel } from '../types';

interface TransferViewProps {
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

export function TransferView({
  storeId,
  locations,
  ingredients,
  stock,
  lots,
  ledger,
  initialIngredientId,
  busy,
  run,
}: TransferViewProps) {
  const [ingredientId, setIngredientId] = useState(
    () => initialIngredientId || stock[0]?.ingredient.id || ingredients[0]?.id || '',
  );
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [note, setNote] = useState('Xuất nguyên liệu sang trạm sơ chế bếp');

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

  // Set default from/to locations based on available stock
  useEffect(() => {
    const sorted = [...currentIngredientStock].sort((a, b) => b.quantity - a.quantity);
    const bestStorage =
      sorted[0]?.location.id ??
      locations.find((l) => l.kind === 'STORAGE')?.id ??
      locations[0]?.id ??
      '';
    const bestPrep =
      locations.find((l) => l.id !== bestStorage && l.kind === 'PREP')?.id ??
      locations.find((l) => l.id !== bestStorage)?.id ??
      '';

    setFromLocationId(bestStorage);
    setToLocationId(bestPrep);
    setLotId('');

    const avail = currentIngredientStock
      .filter((s) => s.location.id === bestStorage)
      .reduce((sum, s) => sum + s.quantity, 0);

    setQuantity(String(avail > 0 ? Math.max(1, Math.round(avail * 0.5)) : 10));
  }, [ingredientId, currentIngredientStock, locations]);

  const availableAtSource = useMemo(() => {
    return currentIngredientStock
      .filter((s) => s.location.id === fromLocationId)
      .reduce((sum, s) => sum + s.quantity, 0);
  }, [currentIngredientStock, fromLocationId]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredients, ingredientId],
  );

  const presets = [
    'Xuất nguyên liệu sang trạm sơ chế bếp ca sáng',
    'Bổ sung nguyên liệu trạm bếp ca tối',
    'Hoàn trả nguyên liệu dư về kho bảo quản chính',
  ];

  const recentTransfers = useMemo(() => {
    return ledger
      .filter((r) => r.type === 'TRANSFER_IN' || r.type === 'TRANSFER_OUT')
      .slice(0, 15);
  }, [ledger]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/transfers', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          ingredientId,
          lotId: lotId || undefined,
          fromLocationId,
          toLocationId,
          quantity: Number(quantity),
          note: note.trim() || undefined,
        }),
      });
    }, 'Đã thực hiện xuất chuyển vị trí kho thành công!');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Transfer Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ArrowLeftRight className="size-5 text-blue-600" />
              <span>Phiếu Điều Chuyển Vị Trí Kho Nội Bộ</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chuyển nguyên liệu từ Kho bảo quản mát/khô sang Trạm sơ chế hoặc Quầy bar để sẵn sàng chế biến
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nguyên vật liệu điều chuyển <span className="text-rose-500">*</span>
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
                  Chỉ định lô hàng (FEFO tự động)
                </label>
                <select
                  aria-label="Lô hàng"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">⚡ Tự động trừ lô hạn gần nhất (Khuyên dùng)</option>
                  {validLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lô: {lot.code} (Còn {lot.quantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Từ kho xuất (Kho nguồn) <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Kho nguồn"
                  required
                  value={fromLocationId}
                  onChange={(e) => setFromLocationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.kind === 'STORAGE' ? 'Kho bảo quản' : 'Trạm sơ chế'})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500 block">
                  Khả dụng tại đây:{' '}
                  <strong className="text-slate-900">
                    {formatQuantity(
                      availableAtSource,
                      selectedIngredient ? unitLabel[selectedIngredient.unit] : '',
                    )}
                  </strong>
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Đến kho nhận (Kho đích) <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Kho đích"
                  required
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.kind === 'STORAGE' ? 'Kho bảo quản' : 'Trạm sơ chế'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Số lượng chuyển <span className="text-rose-500">*</span>
                </label>
                {availableAtSource > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">Chọn nhanh:</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.round(availableAtSource * 0.25)))}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-semibold cursor-pointer"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.round(availableAtSource * 0.5)))}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-semibold cursor-pointer"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuantity(String(availableAtSource))}
                      className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 hover:bg-amber-200 font-bold cursor-pointer"
                    >
                      Toàn bộ (100%)
                    </button>
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-10 text-sm font-bold pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {selectedIngredient ? unitLabel[selectedIngredient.unit] : ''}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Lý do / Diễn giải điều chuyển</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nhập lý do điều chuyển..."
                className="h-9 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNote(preset)}
                    className="px-2 py-1 rounded-md text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !ingredientId || fromLocationId === toLocationId}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10"
            >
              <ArrowLeftRight className="size-4 mr-2" />
              {busy ? 'Đang chuyển kho...' : 'Xác nhận Chuyển vị trí kho'}
            </Button>
          </form>
        </div>

        {/* Right Info: Tồn hiện tại của nguyên liệu & Lịch sử */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Layers className="size-4 text-slate-400" />
              <span>Phân Bổ Tồn Kho Của: {selectedIngredient?.name ?? '—'}</span>
            </h3>

            {currentIngredientStock.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">Mặt hàng này hiện chưa có số dư tồn kho.</p>
            ) : (
              <div className="space-y-2">
                {currentIngredientStock.map((s) => (
                  <div
                    key={`${s.location.id}-${s.lot?.id ?? 'none'}`}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{s.location.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {s.lot ? `Lô: ${s.lot.code}` : 'Tồn chung'}
                      </span>
                    </div>
                    <span className="font-extrabold text-sm text-slate-900">
                      {formatQuantity(
                        s.quantity,
                        selectedIngredient ? unitLabel[selectedIngredient.unit] : '',
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <History className="size-4 text-slate-400" />
                <span>Điều Chuyển Gần Đây</span>
              </h3>
              <Link
                href="/admin/inventory/ledger"
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
              >
                Sổ cái &rarr;
              </Link>
            </div>

            {recentTransfers.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">Chưa có giao dịch chuyển kho nào.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {recentTransfers.map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-800 block">{r.ingredient.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDateTime(r.occurredAt)} • {r.location.name}
                      </span>
                    </div>
                    <span
                      className={`font-bold ${
                        r.type === 'TRANSFER_IN' ? 'text-blue-700' : 'text-amber-700'
                      }`}
                    >
                      {r.type === 'TRANSFER_IN' ? '+' : '-'}
                      {formatQuantity(r.quantity, unitLabel[r.ingredient.unit])}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
