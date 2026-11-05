'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  CreditCard,
  ChefHat,
  Lock,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { getDefaultRouteForActor, login } from '../../lib/auth';
import { useActiveStore } from '../../lib/store-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const QUICK_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'ChickResDev!2026';

const QUICK_ACCOUNTS = [
  {
    role: 'Super Admin',
    description: 'Toàn quyền hệ thống & đa chi nhánh',
    email: 'superadmin@chickres.local',
    icon: ShieldCheck,
    badge: 'ADMIN',
  },
  {
    role: 'Quản lý cửa hàng',
    description: 'Thực đơn, kho, báo cáo, khuyến mãi',
    email: 'manager@chickres.local',
    icon: Briefcase,
    badge: 'MANAGER',
  },
  {
    role: 'Thu ngân (POS)',
    description: 'Mở ca, bán hàng tại quầy, thu tiền',
    email: 'cashier@chickres.local',
    icon: CreditCard,
    badge: 'CASHIER',
  },
  {
    role: 'Điều phối Bếp (KDS)',
    description: 'Trạm chiên gà, đóng gói, trả món',
    email: 'kitchen@chickres.local',
    icon: ChefHat,
    badge: 'KITCHEN',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { refreshStores } = useActiveStore();
  const [email, setEmail] = useState('superadmin@chickres.local');
  const [password, setPassword] = useState(QUICK_PASSWORD);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function performLogin(targetEmail: string, targetPassword: string) {
    setPending(true);
    setError('');

    try {
      const actor = await login(targetEmail.trim(), targetPassword);
      await refreshStores();
      const target = getDefaultRouteForActor(actor);
      router.replace(target);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Không thể đăng nhập. Vui lòng kiểm tra lại email hoặc mật khẩu.',
      );
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performLogin(email, password);
  }

  function selectQuickAccount(targetEmail: string) {
    setEmail(targetEmail);
    setPassword(QUICK_PASSWORD);
    setError('');
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-center bg-gradient-to-br from-amber-50/70 via-slate-50 to-orange-50/40 font-sans px-4 sm:px-8 lg:px-14 xl:px-20 py-8">
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Brand Hero & 4 Quick Accounts */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-bold">
              <Flame className="size-4 text-amber-600 fill-amber-500" />
              <span>Hệ thống Điều hành Nhà hàng Gà Rán Thông minh</span>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="inline-flex items-center justify-center size-13 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/25 ring-4 ring-amber-100 shrink-0">
                <Flame className="size-7 fill-current" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  Chick Res System
                </h1>
                <p className="text-sm text-slate-600 font-medium mt-0.5">
                  Đồng bộ thời gian thực: Quầy POS • Bếp KDS • Kho BOM • Đa chi nhánh
                </p>
              </div>
            </div>
          </div>

          {/* 4 Quick Accounts Grid */}
          <div className="bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-md space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  4 Tài khoản phân quyền thao tác nhanh
                </h2>
                <p className="text-xs text-slate-500">
                  Chọn nhanh vai trò để kiểm thử hoặc vận hành theo ca trực
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                Click chọn • Nhấp đúp vào thẳng
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                const isSelected = email === acc.email;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => selectQuickAccount(acc.email)}
                    onDoubleClick={() => void performLogin(acc.email, QUICK_PASSWORD)}
                    className={`flex flex-col justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/90 text-slate-900 ring-2 ring-amber-400/30 shadow-xs'
                        : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-white hover:border-amber-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200/80 text-slate-600'
                          }`}
                        >
                          <Icon className="size-4" />
                        </div>
                        <span className="text-sm font-bold text-slate-900">{acc.role}</span>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="size-4 text-amber-600 shrink-0" />
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-600">
                          {acc.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mb-1.5">
                      {acc.description}
                    </p>
                    <span className="text-xs font-medium text-amber-700 truncate w-full">
                      {acc.email}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Login Card */}
        <div className="lg:col-span-5">
          <Card className="border border-slate-200/90 shadow-xl shadow-slate-200/60 bg-white rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 pt-7 px-6 sm:px-8">
              <CardTitle className="text-2xl font-extrabold text-slate-900">
                Đăng nhập phiên làm việc
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-500 mt-1">
                Nhập tài khoản nhân sự đã được cấp quyền hoặc chọn nhanh ở bảng bên trái
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 px-6 sm:px-8 pb-8 pt-3">
              {error && (
                <div className="rounded-xl bg-red-50 p-3.5 text-xs text-red-700 font-medium border border-red-200 flex items-start gap-2">
                  <span className="font-bold">•</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold text-slate-700">
                    Email tài khoản
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@chickres.local"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 pr-4 h-11 text-sm border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-700">
                    Mật khẩu
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
                    <Input
                      id="password"
                      type="password"
                      required
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 pr-4 h-11 text-sm border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all mt-2"
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4.5 animate-spin" />
                      <span>Đang xác thực thông tin...</span>
                    </>
                  ) : (
                    <>
                      <span>Đăng nhập vào hệ thống</span>
                      <ArrowRight className="size-4.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-4 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">
                  Hệ thống Quản trị Nhà hàng Gà Rán Chick Res • Bảo mật RBAC & Audit Log
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
