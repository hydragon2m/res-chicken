'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Boxes,
  ClipboardList,
  CookingPot,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ReceiptText,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getActor, logout, ROLE_LABELS, type Actor } from '@/lib/auth';
import { useActiveStore } from '@/lib/store-context';
import { cn } from '@/lib/utils';

type NavigationEntry = {
  href: string;
  label: string;
  permission: string;
  icon: ComponentType<{ className?: string }>;
};

const entries: NavigationEntry[] = [
  { href: '/admin', label: 'Điều hành', permission: 'reports.read', icon: LayoutDashboard },
  { href: '/pos', label: 'Bán hàng', permission: 'orders.create', icon: ReceiptText },
  { href: '/orders', label: 'Đơn hàng', permission: 'orders.read', icon: ClipboardList },
  { href: '/kds/frying', label: 'Bếp', permission: 'fulfillment.read', icon: CookingPot },
  { href: '/admin/inventory', label: 'Kho hàng', permission: 'inventory.read', icon: Boxes },
  {
    href: '/admin/catalog/categories',
    label: 'Thực đơn',
    permission: 'catalog.manage',
    icon: UtensilsCrossed,
  },
  { href: '/admin/team', label: 'Nhân sự', permission: 'identity.read', icon: UsersRound },
];

function isActiveRoute(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== '/admin' && pathname.startsWith(`${href}/`)) ||
    (href === '/kds/frying' && pathname.startsWith('/kds/'))
  );
}

export function OperationsNav({ actor, compact = false }: { actor: Actor; compact?: boolean }) {
  const pathname = usePathname();
  const visible = entries.filter((entry) => actor.permissions.includes(entry.permission));
  return (
    <nav
      className={cn('app-navigation', compact && 'app-navigation-compact')}
      aria-label="Phân hệ được cấp quyền"
    >
      {visible.map((entry) => {
        const Icon = entry.icon;
        const active = isActiveRoute(pathname, entry.href);
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={cn('app-navigation-link', active && 'app-navigation-link-active')}
            key={entry.href}
            href={entry.href}
          >
            <Icon className="size-4 shrink-0" />
            <span>{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function GlobalOperationsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [actor, setActor] = useState<Actor | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState('');
  const { stores, currentStoreId, currentStore, setCurrentStoreId } = useActiveStore();

  useEffect(() => {
    getActor()
      .then(setActor)
      .catch(() => setActor(null));
  }, [pathname]);
  useEffect(() => {
    const updateTime = () =>
      setClock(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setActor(null);
      router.replace('/login');
      setBusy(false);
    }
  };

  if (!actor || pathname === '/login') return null;
  const visibleModules = entries.filter((entry) => actor.permissions.includes(entry.permission));
  const homeHref = visibleModules[0]?.href ?? '/';
  const initials = actor.email.slice(0, 1).toUpperCase();

  return (
    <header className="app-shellbar">
      <div className="app-shellbar-inner">
        <div className="app-shellbar-primary">
          <Link className="app-brand" href={homeHref} aria-label="Chick Res điều hành">
            <span className="app-brand-mark">
              <UtensilsCrossed className="size-4" />
            </span>
            <span className="app-brand-copy">
              <b>CHICK RES</b>
              <small>Restaurant operations</small>
            </span>
          </Link>
          {currentStore && (
            <label className="app-store-switcher">
              <MapPin className="size-3.5 text-orange-600" />
              {stores.length > 1 ? (
                <select
                  aria-label="Chọn chi nhánh hoạt động"
                  value={currentStoreId}
                  onChange={(event) => setCurrentStoreId(event.target.value)}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{currentStore.name}</span>
              )}
            </label>
          )}
          <OperationsNav actor={actor} />
        </div>
        <div className="app-shellbar-actions">
          <span className="app-clock" aria-label="Giờ hệ thống">
            {clock}
          </span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="outline" size="sm" className="app-account-trigger">
                <span className="app-avatar">{initials}</span>
                <span className="app-account-email">{actor.email}</span>
                <Menu className="size-4 text-slate-500" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="app-account-menu" align="end" sideOffset={8}>
                <div className="app-account-menu-head">
                  <span className="app-avatar app-avatar-lg">{initials}</span>
                  <div>
                    <strong>{actor.email}</strong>
                    <Badge variant="secondary">{ROLE_LABELS[actor.role] ?? actor.role}</Badge>
                  </div>
                </div>
                <div className="app-account-menu-context">
                  <span>Chi nhánh đang làm việc</span>
                  <b>{currentStore?.name ?? 'Chưa chọn chi nhánh'}</b>
                </div>
                <DropdownMenu.Separator className="app-menu-separator" />
                <DropdownMenu.Item asChild>
                  <button
                    className="app-logout-action"
                    disabled={busy}
                    onClick={() => void signOut()}
                  >
                    <LogOut className="size-4" />
                    {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
                  </button>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
