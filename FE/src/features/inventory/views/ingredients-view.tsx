'use client';

import { useState, useMemo, type FormEvent } from 'react';
import { Layers, Plus, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/auth';
import { formatQuantity } from '@/lib/format';
import type { Ingredient, Location } from '../types';
import { unitLabel, slugToSku } from '../types';

interface IngredientsViewProps {
  storeId: string;
  ingredients: Ingredient[];
  locations: Location[];
  busy: boolean;
  run: (operation: () => Promise<void>, successMessage?: string) => Promise<void>;
}

export function IngredientsView({
  storeId,
  ingredients,
  locations,
  busy,
  run,
}: IngredientsViewProps) {
  const [ingName, setIngName] = useState('');
  const [ingSku, setIngSku] = useState('');
  const [ingUnit, setIngUnit] = useState<Ingredient['unit']>('GRAM');
  const [ingLowStock, setIngLowStock] = useState('1000');
  const [search, setSearch] = useState('');

  const [locName, setLocName] = useState('');
  const [locKind, setLocKind] = useState<Location['kind']>('STORAGE');

  const filteredIngredients = useMemo(() => {
    if (!search.trim()) return ingredients;
    const q = search.trim().toLowerCase();
    return ingredients.filter(
      (i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q),
    );
  }, [ingredients, search]);

  const submitIngredient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          sku: ingSku.trim() || slugToSku(ingName) || undefined,
          name: ingName.trim(),
          unit: ingUnit,
          lowStockQuantity: ingLowStock === '' ? undefined : Number(ingLowStock),
        }),
      });
      setIngName('');
      setIngSku('');
      setIngLowStock(ingUnit === 'EACH' ? '50' : '1000');
    }, 'Đã lưu nguyên vật liệu mới thành công!');
  };

  const submitLocation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await apiRequest('/inventory/locations', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          name: locName.trim(),
          kind: locKind,
        }),
      });
      setLocName('');
    }, 'Đã lưu vị trí kho mới thành công!');
  };

  return (
    <div className="space-y-6">
      {/* 2-Column Layout: Left Ingredients Master | Right Storage Locations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ingredients Section */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="size-5 text-amber-600" />
              <span>Danh Mục Nguyên Vật Liệu (Raw Materials Master)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khai báo nguyên vật liệu, đơn vị đo lường và ngưỡng tồn kho tối thiểu để kích hoạt cảnh báo tự động
            </p>
          </div>

          {/* Add Ingredient Form */}
          <form
            onSubmit={submitIngredient}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-4"
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              + Thêm nguyên vật liệu mới
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-600">
                  Tên nguyên vật liệu <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  value={ingName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIngName(val);
                    if (!ingSku) setIngSku(slugToSku(val));
                  }}
                  placeholder="Ví dụ: Đùi gà góc tư CP, Xà lách xoăn..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Mã SKU</label>
                <Input
                  value={ingSku}
                  onChange={(e) => setIngSku(e.target.value)}
                  placeholder="ING-DUI-GA"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Đơn vị đo</label>
                <select
                  aria-label="Đơn vị đo"
                  value={ingUnit}
                  onChange={(e) => {
                    const u = e.target.value as Ingredient['unit'];
                    setIngUnit(u);
                    setIngLowStock(u === 'EACH' ? '50' : '1000');
                  }}
                  className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="GRAM">Gram (g) - Khối lượng</option>
                  <option value="MILLILITER">Mililit (ml) - Thể tích</option>
                  <option value="EACH">Cái / Miếng / Quả / Hộp</option>
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-600">
                  Ngưỡng tồn tối thiểu (Báo thiếu hụt khi dưới mức này)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={ingLowStock}
                    onChange={(e) => setIngLowStock(e.target.value)}
                    className="h-9 text-xs font-bold pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">
                    {unitLabel[ingUnit]}
                  </span>
                </div>
              </div>

              <div className="sm:col-span-2 flex items-end">
                <Button
                  type="submit"
                  disabled={busy || !ingName.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 text-xs"
                >
                  <Plus className="size-3.5 mr-1" />
                  {busy ? 'Đang lưu...' : 'Thêm vào danh mục'}
                </Button>
              </div>
            </div>
          </form>

          {/* List of Ingredients */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Danh sách nguyên liệu hiện có ({filteredIngredients.length})
              </h3>
              <div className="relative w-full sm:w-60">
                <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm nguyên liệu, SKU..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Nguyên vật liệu</th>
                    <th className="px-3 py-2.5">Mã SKU</th>
                    <th className="px-3 py-2.5">Đơn vị</th>
                    <th className="px-4 py-2.5 text-right">Mức cảnh báo tồn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIngredients.map((ing) => (
                    <tr key={ing.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{ing.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{ing.sku}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700 text-[10px]">
                          {unitLabel[ing.unit]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-600">
                        {ing.lowStockQuantity != null
                          ? formatQuantity(ing.lowStockQuantity, unitLabel[ing.unit])
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Storage Locations Section */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin className="size-5 text-blue-600" />
              <span>Vị Trí Kho Lưu Trữ</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân chia khu vực Kho bảo quản và Trạm sơ chế bếp
            </p>
          </div>

          <form
            onSubmit={submitLocation}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3"
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              + Tạo vị trí kho mới
            </h3>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">
                Tên vị trí kho <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                placeholder="Ví dụ: Kho lạnh -18°C, Trạm chiên..."
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">Phân loại khu vực</label>
              <select
                aria-label="Phân loại khu vực"
                value={locKind}
                onChange={(e) => setLocKind(e.target.value as Location['kind'])}
                className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="STORAGE">Kho lưu trữ bảo quản (Storage)</option>
                <option value="PREP">Trạm sơ chế / Bếp chế biến (Prep/Line)</option>
              </select>
            </div>

            <Button
              type="submit"
              disabled={busy || !locName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              Thêm vị trí kho
            </Button>
          </form>

          {/* List of locations */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              Vị trí hiện hoạt ({locations.length})
            </h3>

            <div className="space-y-2">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 block">{loc.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {loc.kind === 'STORAGE'
                        ? 'Kho lưu trữ bảo quản chính'
                        : 'Trạm sơ chế & Chế biến'}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      loc.kind === 'STORAGE'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {loc.kind === 'STORAGE' ? 'STORAGE' : 'PREP'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
