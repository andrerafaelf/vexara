import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vexara Admin',
  description: 'Administrative controls for Vexara',
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
