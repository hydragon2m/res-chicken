'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest, getActor, type Actor } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Store = {
  id: string;
  name: string;
  timezone: string;
  cashRegisters: Array<{ id: string; code: string; name: string; isActive: boolean }>;
};
type User = { id: string; email: string; role: string; isActive: boolean };

export default function PlatformStoresPage() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const currentActor = await getActor();
      setActor(currentActor);
      if (!currentActor.isPlatformAdmin) return;
      const [storeList, userList] = await Promise.all([
        apiRequest<Store[]>('/stores'),
        apiRequest<User[]>('/users'),
      ]);
      setStores(storeList);
      setUsers(userList.filter((user) => user.isActive && user.role === 'ADMIN'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu nền tảng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const createStore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !ownerUserId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest('/stores', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), timezone, ownerUserId }),
      });
      setName('');
      setOwnerUserId('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo cửa hàng.');
    } finally {
      setSaving(false);
    }
  };

  if (!loading && !actor?.isPlatformAdmin) {
    return (
      <main className="p-6 text-sm text-destructive">Bạn không có quyền quản trị nền tảng.</main>
    );
  }

  return (
    <main className="w-full space-y-6 p-4 sm:p-6 lg:px-8 font-sans">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Platform administration
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Cửa hàng & chủ cửa hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chỉ Super Admin được tạo cửa hàng, gán chủ sở hữu và xem toàn bộ chi nhánh.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 size-4" />
          Làm mới
        </Button>
      </header>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5" />
            Tạo cửa hàng
          </CardTitle>
          <CardDescription>
            Chủ cửa hàng phải là tài khoản nhân sự đã tồn tại; tài khoản đó chỉ có scope tại chi
            nhánh được gán.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={createStore}>
            <div className="space-y-2">
              <Label htmlFor="store-name">Tên cửa hàng</Label>
              <Input
                id="store-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-timezone">Múi giờ</Label>
              <Input
                id="store-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Chủ cửa hàng</Label>
              <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn tài khoản" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email} · {user.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={saving || !ownerUserId}>
                {saving ? 'Đang tạo...' : 'Tạo cửa hàng và quầy MAIN'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => (
          <Card key={store.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-amber-600" />
                {store.name}
              </CardTitle>
              <CardDescription>{store.timezone}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">Quầy thu ngân</p>
              {store.cashRegisters.map((register) => (
                <p key={register.id} className="rounded bg-muted px-2 py-1 text-xs">
                  {register.code} · {register.name}{' '}
                  {register.isActive ? '· Hoạt động' : '· Tạm ngưng'}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
        {!loading && stores.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có cửa hàng.</p>
        )}
      </section>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Platform Admin khác với Store Admin: không cấp tự động quyền toàn hệ thống cho chủ cửa hàng.
      </p>
    </main>
  );
}
