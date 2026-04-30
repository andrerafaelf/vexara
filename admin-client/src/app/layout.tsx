import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Neon Dominion Admin',
  description: 'Administrative controls for Neon Dominion',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
