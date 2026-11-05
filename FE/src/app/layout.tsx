import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { AppShell } from '../components/app-shell';
import { StoreProvider } from '../lib/store-context';
import { Toaster } from '../components/ui/sonner';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chick Res | Quản trị Nhà hàng Gà Rán',
  description: 'Hệ thống vận hành và quản lý nhà hàng gà rán Chick Res',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
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
