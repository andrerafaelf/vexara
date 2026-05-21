import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import QueryProvider from '@/context/QueryProvider';
import ScrollToTop from '@/components/ScrollToTop';
import NavigationProgress from '@/components/NavigationProgress';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vexara',
  description: 'Browser-based 4X strategy. A living galaxy shared by real players — build, conquer, and dominate 24/7. No resets. No pay-to-win.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Vexara',
    description: 'Browser-based 4X strategy. A living galaxy shared by real players — build, conquer, and dominate 24/7. No resets. No pay-to-win.',
    url: 'https://vexara.world',
    siteName: 'Vexara',
    images: [{ url: 'https://vexara.world/vexara-overview.png', width: 1280, height: 720, alt: 'Vexara nexus overview' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vexara',
    description: 'Browser-based 4X strategy. A living galaxy shared by real players — build, conquer, and dominate 24/7.',
    images: ['https://vexara.world/vexara-overview.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vexara',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F1326',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/logo192.png" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <QueryProvider>
            <ToastProvider>
              <Suspense fallback={null}>
                <ScrollToTop />
              </Suspense>
              <Suspense fallback={null}>
                <NavigationProgress>{children}</NavigationProgress>
              </Suspense>
            </ToastProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
