import { AuthProvider } from '@/context/AuthContext';
import ScrollToTop from '@/components/ScrollToTop';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Neon Dominion',
  description: 'Strategic conquest game in a neon-lit cyberpunk universe',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Suspense fallback={null}>
            <ScrollToTop />
          </Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
