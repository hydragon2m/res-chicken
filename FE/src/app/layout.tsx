import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AppShell } from '@/thanh-phan/app-shell';
import { StoreProvider } from '@/thu-vien/store-context';
import { Toaster } from '@/thanh-phan/giao-dien/sonner';

export const metadata: Metadata = {
  title: 'Chick Res | Quản trị Nhà hàng Gà Rán',
  description: 'Hệ thống vận hành và quản lý nhà hàng gà rán Chick Res',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900 selection:bg-amber-100 selection:text-amber-900">
        <Suspense fallback={null}>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </Suspense>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
