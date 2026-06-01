import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
	title: 'Vexara Admin',
	description: 'Administrative controls for Vexara',
	icons: {
		icon: [
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
			{ url: '/favicon.ico' }
		],
		apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }]
	}
};

export const viewport: Viewport = {
	themeColor: '#0F1326',
	width: 'device-width',
	initialScale: 1
};

export default async function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Reading the nonce header forces Next to thread it through to its inline
	// bootstrap scripts so they match the CSP set by middleware.
	const nonce = (await headers()).get('x-nonce') ?? undefined;
	return (
		<html lang="en">
			<body data-nonce={nonce}>{children}</body>
		</html>
	);
}
