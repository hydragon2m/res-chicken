'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { AppSidebar } from '@/thanh-phan/app-sidebar';
import { SiteHeader } from '@/thanh-phan/site-header';
import { SidebarInset, SidebarProvider } from '@/thanh-phan/giao-dien/sidebar';
import { ApiError, getActor, type Actor } from '@/thu-vien/auth';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [actor, setActor] = useState<Actor | null>(null);
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/reservations') ||
    pathname.startsWith('/vouchers') ||
    pathname.startsWith('/table/');

  useEffect(() => {
    if (isPublicRoute) return;
    void getActor()
      .then(setActor)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
        setActor(null);
      });
  }, [isPublicRoute, pathname, router]);

  if (isPublicRoute) return <>{children}</>;
  if (!actor)
    return (
      <main className="grid min-h-screen place-items-center bg-muted text-sm text-muted-foreground">
        Đang mở không gian làm việc…
      </main>
    );

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '16rem', '--header-height': '3.5rem' } as CSSProperties}
    >
      <AppSidebar actor={actor} />
      <SidebarInset>
        <SiteHeader actor={actor} />
        <div className="min-w-0 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
