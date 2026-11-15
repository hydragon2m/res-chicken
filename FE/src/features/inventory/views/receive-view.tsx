'use client';

import { useState, useMemo, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  History,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/auth';
import { formatDate, formatDateTime, formatQuantity } from '@/lib/format';
import type { Supplier, Location, Ingredient, Lot, InventoryAlerts, LedgerRow } from '../types';
import { unitLabel, money, localIso, idempotencyKey } from '../types';

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

interface ReceiveViewProps {
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
}

export function ReceiveView({
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
}: ReceiveViewProps) {
  const defaultStorageLocationId = useMemo(
    () => locations.find((l) => l.kind === 'STORAGE')?.id ?? locations[0]?.id ?? '',
    [locations],
  );
  const [locationId, setLocationId] = useState(defaultStorageLocationId);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [receivedAt, setReceivedAt] = useState(() => localIso());
  const [reference, setReference] = useState(() => makePoRef());
  const [note, setNote] = useState('Đã kiểm tra chất lượng cảm quan và bao bì đạt chuẩn');

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
    () => ledger.filter((row) => row.type === 'RECEIPT').slice(0, 15),
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
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
          <span>
            Hệ thống chưa có đủ Nguyên vật liệu hoặc Vị trí kho lưu trữ để tiếp nhận phiếu nhập.
          </span>
          <Button asChild size="sm" variant="outline" className="text-xs">
            <Link href="/admin/inventory/ingredients">Đến cài đặt Nguyên liệu & Vị trí</Link>
          </Button>
        </div>
      )}

      {/* Main PO Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ArrowDownToLine className="size-5 text-emerald-600" />
              <span>Lập Phiếu Nhập Kho Theo Lô (Goods Receipt / PO)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tạo số lô tự động, gán hạn sử dụng chuẩn FEFO và lưu đơn giá để tính giá vốn chuẩn xác
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFillLowStock}
              className="text-xs border-amber-300 text-amber-800 bg-amber-50/70 hover:bg-amber-100"
            >
              <Sparkles className="size-3.5 mr-1 text-amber-600" />
              Điền nhanh mặt hàng thiếu
            </Button>
            <Button asChild variant="outline" size="sm" className="text-xs">
              <Link href="/admin/inventory/suppliers">
                <Building2 className="size-3.5 mr-1" />
                Quản lý NCC
              </Link>
            </Button>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* General PO Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Nhà cung cấp đối tác</label>
              <select
                aria-label="Nhà cung cấp"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Nhập lẻ / Nội bộ --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Vị trí kho tiếp nhận <span className="text-rose-500">*</span>
              </label>
              <select
                aria-label="Vị trí kho tiếp nhận"
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.kind === 'STORAGE' ? 'Kho bảo quản' : 'Trạm sơ chế'})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Số PO / Chứng từ hóa đơn</label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PO-YYMMDD-HHMM"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Thời điểm nhập hàng</label>
              <Input
                type="datetime-local"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Ghi chú phiếu nhập hàng</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Lô hàng đạt chuẩn độ lạnh, nguyên niêm phong..."
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Line items table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Chi tiết danh sách nguyên liệu nhập theo lô ({lines.length} dòng)
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    getDefaultsForIngredient(ingredients[0]?.id ?? '', prev.length),
                  ])
                }
                className="text-xs h-8"
              >
                <Plus className="size-3.5 mr-1" />
                Thêm nguyên liệu
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Nguyên vật liệu</th>
                    <th className="px-3 py-2.5">Mã lô (Lot)</th>
                    <th className="px-3 py-2.5">Hạn dùng (FEFO)</th>
                    <th className="px-3 py-2.5 text-right">Số lượng nhập</th>
                    <th className="px-3 py-2.5 text-right">Đơn giá vốn</th>
                    <th className="px-4 py-2.5 text-right">Thành tiền</th>
                    <th className="px-2 py-2.5 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const ing = ingredients.find((i) => i.id === line.ingredientId);
                    const qtyNum = Number(line.quantity) || 0;
                    const costNum = Number(line.unitCost) || 0;
                    const subtotal = qtyNum * costNum;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <select
                            aria-label="Chọn nguyên vật liệu"
                            value={line.ingredientId}
                            onChange={(e) => {
                              const newIngId = e.target.value;
                              const def = getDefaultsForIngredient(newIngId, idx);
                              setLines((prev) =>
                                prev.map((l, i) =>
                                  i === idx ? { ...l, ...def, ingredientId: newIngId } : l,
                                ),
                              );
                            }}
                            className="w-full h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                          >
                            {ingredients.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({unitLabel[item.unit]})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            value={line.lotCode}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, lotCode: e.target.value } : l)),
                              )
                            }
                            className="h-8 text-xs font-mono"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="date"
                            value={line.expiresAt}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l, i) =>
                                  i === idx ? { ...l, expiresAt: e.target.value } : l,
                                ),
                              )
                            }
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              min="0.001"
                              step="any"
                              value={line.quantity}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, quantity: e.target.value } : l,
                                  ),
                                )
                              }
                              className="h-8 w-24 text-right text-xs font-bold"
                            />
                            <span className="text-slate-400 font-medium text-[11px] w-6">
                              {ing ? unitLabel[ing.unit] : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitCost}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l, i) =>
                                  i === idx ? { ...l, unitCost: e.target.value } : l,
                                ),
                              )
                            }
                            className="h-8 w-28 text-right text-xs font-semibold"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                          {money.format(subtotal)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PO Footer with Total and Submit */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-500 block">Tổng giá trị phiếu nhập (VND)</span>
              <span className="text-xl font-black text-slate-900">
                {money.format(totalReceiptCost)}
              </span>
            </div>

            <Button
              type="submit"
              disabled={busy || !lines.length}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 h-10"
            >
              <ArrowDownToLine className="size-4 mr-2" />
              {busy ? 'Đang ghi nhận phiếu nhập...' : 'Xác nhận Nhập kho & Lưu lô hàng'}
            </Button>
          </div>
        </form>
      </div>

      {/* Recent Receipts Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-slate-400" />
            <h3 className="font-extrabold text-slate-900 text-sm">
              Lịch Sử Các Đợt Nhập Hàng Gần Đây
            </h3>
          </div>
          <Link
            href="/admin/inventory/ledger"
            className="text-xs font-bold text-amber-600 hover:text-amber-700"
          >
            Xem toàn bộ sổ cái thẻ kho &rarr;
          </Link>
        </div>

        {recentReceipts.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">Chưa có giao dịch nhập kho nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-4 py-3">Nguyên liệu</th>
                  <th className="px-4 py-3">Vị trí nhập</th>
                  <th className="px-4 py-3">Lô & Hạn sử dụng</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                  <th className="px-5 py-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReceipts.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 text-slate-500 font-mono text-[11px]">
                      {formatDateTime(row.occurredAt)}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{row.ingredient.name}</td>
                    <td className="px-4 py-3">{row.location.name}</td>
                    <td className="px-4 py-3">
                      {row.lot ? (
                        <div>
                          <span className="font-mono text-slate-700">{row.lot.code}</span>
                          {row.lot.expiresAt && (
                            <span className="text-[10px] text-slate-400 block">
                              HSD: {formatDate(row.lot.expiresAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-emerald-700">
                      +{formatQuantity(row.quantity, unitLabel[row.ingredient.unit])}
                    </td>
                    <td className="px-5 py-3 text-slate-500 truncate max-w-xs">{row.note ?? '—'}</td>
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
