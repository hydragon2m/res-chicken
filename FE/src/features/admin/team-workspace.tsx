'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Store, RefreshCw, Search, Edit3, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, apiRequest, getActor, type Actor } from '../../lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type Role = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'INVENTORY_CLERK';
type Member = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  authVersion: number;
  memberships: { storeId: string }[];
};
type StoreItem = { id: string; name: string };

const roles: Array<{ id: Role; label: string; summary: string; color: string }> = [
  {
    id: 'ADMIN',
    label: 'Quản trị viên (ADMIN)',
    summary: 'Toàn quyền cấu hình hệ thống & phân quyền nhân sự',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'MANAGER',
    label: 'Quản lý cửa hàng (MANAGER)',
    summary: 'Vận hành ca, Menu, KDS, Kho & Báo cáo doanh thu',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'CASHIER',
    label: 'Thu ngân (CASHIER)',
    summary: 'Bán hàng tại quầy POS, tra cứu đơn & mở/đóng ca tiền mặt',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'KITCHEN',
    label: 'Điều phối bếp (KDS)',
    summary: 'Màn hình trạm chiên gà & đóng gói trả món',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    id: 'INVENTORY_CLERK',
    label: 'Nhân viên kho (INVENTORY)',
    summary: 'Quản lý sổ cái nguyên liệu, nhập xuất và hao hụt',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
  },
];

export function TeamWorkspace() {
  const router = useRouter();
  const [actor, setActor] = useState<Actor | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Create Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');
  const [createScopes, setCreateScopes] = useState<string[]>([]);

  // Edit Dialog state
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState<Role>('CASHIER');
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextMembers, nextStores] = await Promise.all([
        apiRequest<Member[]>('/auth/users'),
        apiRequest<StoreItem[]>('/auth/stores'),
      ]);
      const validStores = nextStores || [];
      setMembers(nextMembers || []);
      setStores(validStores);
      if (validStores.length > 0) {
        setCreateScopes((prev) => (prev.length > 0 ? prev : [validStores[0].id]));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace('/login');
      } else {
        toast.error('Không thể tải danh sách nhân sự.');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void getActor()
      .then((curr) => {
        setActor(curr);
        if (curr.storeIds.length > 0) {
          setCreateScopes(curr.storeIds);
        }
        if (curr.permissions.includes('identity.read')) {
          void load();
        } else {
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
        else setLoading(false);
      });
  }, [load, router]);

  const canManage = actor?.permissions.includes('identity.manage') ?? false;
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const handleCreate = async () => {
    if (!email.trim() || !password.trim()) return toast.warning('Nhập email và mật khẩu.');
    if (password.length < 12) return toast.warning('Mật khẩu tối thiểu 12 ký tự.');
    if (createScopes.length === 0) return toast.warning('Chọn ít nhất 1 chi nhánh.');

    setBusy(true);
    try {
      await apiRequest('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          role,
          storeIds: createScopes,
        }),
      });
      setEmail('');
      setPassword('');
      setCreateOpen(false);
      toast.success('Đã tạo tài khoản nhân viên mới.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const openEditDialog = (member: Member) => {
    setEditingMember(member);
    setEditRole(member.role);
    setEditScopes(member.memberships.map((m) => m.storeId));
    setEditPassword('');
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    if (editScopes.length === 0) return toast.warning('Phải gán ít nhất 1 chi nhánh làm việc.');
    if (editPassword && editPassword.length < 12) {
      return toast.warning('Mật khẩu mới phải từ 12 ký tự trở lên.');
    }
    setBusy(true);
    try {
      await apiRequest(`/auth/users/${editingMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: editRole,
          storeIds: editScopes,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      toast.success(`Đã cập nhật phân quyền cho ${editingMember.email}`);
      setEditingMember(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (member: Member) => {
    setBusy(true);
    try {
      await apiRequest(`/auth/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      toast.success(
        member.isActive
          ? `Đã khoá tài khoản ${member.email}`
          : `Đã kích hoạt lại tài khoản ${member.email}`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể đổi trạng thái tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  if (!actor || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
        <RefreshCw className="size-5 animate-spin mr-2 text-amber-600" />
        Đang tải danh sách nhân sự…
      </div>
    );
  }

  const filteredMembers = members.filter((m) => {
    if (roleFilter && m.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      return m.email.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
  });

  return (
    <div className="w-full p-4 sm:p-6 lg:px-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
            <Users className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Quản Lý Nhân Sự & Phân Quyền (RBAC)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Quản lý tài khoản nhân viên, vai trò nghiệp vụ và phạm vi chi nhánh làm việc
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={busy}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin text-amber-600' : ''}`} />
            <span>Làm mới</span>
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
            >
              <UserPlus className="size-4" />
              <span>Thêm nhân viên mới</span>
            </Button>
          )}
        </div>
      </div>

      {/* Role Summary Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {roles.map((r) => {
          const count = members.filter((m) => m.role === r.id).length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleFilter((prev) => (prev === r.id ? '' : r.id))}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                roleFilter === r.id
                  ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-400'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.color}`}
                >
                  {r.id}
                </span>
                <span className="text-lg font-black font-mono text-slate-900">{count}</span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-2 truncate">{r.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Tìm kiếm nhân viên theo địa chỉ email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <select
            aria-label="Lọc theo vai trò"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-56 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="">Tất cả vai trò ({members.length})</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Structured Staff Members Table */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs overflow-hidden">
        <CardHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-sm font-bold text-slate-900">
            Danh sách tài khoản nhân sự ({filteredMembers.length})
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Nhấn &quot;Chỉnh sửa&quot; để cập nhật vai trò, chi nhánh được phép truy cập hoặc cấp
            lại mật khẩu
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3.5 px-6">Nhân viên (Email)</th>
                  <th className="py-3.5 px-4">Vai trò & Chức trách</th>
                  <th className="py-3.5 px-4">Chi nhánh làm việc</th>
                  <th className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th className="py-3.5 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      Không tìm thấy tài khoản nhân sự nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => {
                    const roleCfg = roles.find((r) => r.id === member.role) ?? {
                      id: member.role,
                      label: member.role,
                      summary: '',
                      color: 'bg-slate-100 text-slate-700 border-slate-200',
                    };
                    const isSelf = member.id === actor.id;
                    return (
                      <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-slate-900 text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                              {member.email.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{member.email}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                    Bạn
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Phiên bảo mật v{member.authVersion}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${roleCfg.color}`}
                          >
                            {roleCfg.label}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-1">{roleCfg.summary}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {member.memberships.length > 0 ? (
                              member.memberships.map((m) => (
                                <span
                                  key={m.storeId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px]"
                                >
                                  <Store className="size-3 text-amber-600" />
                                  <span>{storeMap[m.storeId] ?? m.storeId.slice(0, 8)}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic">Toàn hệ thống</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              member.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {member.isActive ? 'Đang hoạt động' : 'Đã khoá'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          {canManage && (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => openEditDialog(member)}
                                className="gap-1 cursor-pointer"
                              >
                                <Edit3 className="size-3.5" />
                                <span>Chỉnh sửa</span>
                              </Button>
                              {!isSelf && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={busy}
                                  onClick={() => void handleToggleActive(member)}
                                  className={`gap-1 cursor-pointer ${
                                    member.isActive
                                      ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                                      : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                                  }`}
                                >
                                  {member.isActive ? (
                                    <>
                                      <Lock className="size-3.5" />
                                      <span>Khoá</span>
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="size-3.5" />
                                      <span>Mở khoá</span>
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Member Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Thêm tài khoản nhân viên mới</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nhân viên sẽ dùng thông tin này để đăng nhập vào ca làm việc tại quầy hoặc bếp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Email đăng nhập</label>
              <Input
                type="email"
                placeholder="nhanvien@chickres.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Mật khẩu ban đầu (tối thiểu 12 ký tự)
              </label>
              <Input
                type="password"
                placeholder="Ví dụ: ChickResDev!2026"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Vai trò trong nhà hàng</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {r.summary}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Chi nhánh được phép làm việc:
              </label>
              <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 max-h-36 overflow-y-auto">
                {stores.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={createScopes.includes(s.id)}
                      onChange={(e) =>
                        setCreateScopes((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <Store className="size-3.5 text-amber-600" />
                    <span className="font-medium">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handleCreate()}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            >
              Tạo tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => !open && setEditingMember(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Chỉnh sửa nhân sự: {editingMember?.email}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Thay đổi vai trò, chi nhánh làm việc hoặc đặt lại mật khẩu đăng nhập
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Vai trò trong nhà hàng</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as Role)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Đặt lại mật khẩu mới (Để trống nếu giữ nguyên)
              </label>
              <Input
                type="password"
                placeholder="Tối thiểu 12 ký tự..."
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Chi nhánh được phép truy cập:
              </label>
              <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 max-h-36 overflow-y-auto">
                {stores.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={editScopes.includes(s.id)}
                      onChange={(e) =>
                        setEditScopes((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <Store className="size-3.5 text-amber-600" />
                    <span className="font-medium">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingMember(null)}>
              Huỷ
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handleSaveEdit()}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            >
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
