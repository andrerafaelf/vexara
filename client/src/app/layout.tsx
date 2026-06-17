import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import QueryProvider from '@/context/QueryProvider';
import ScrollToTop from '@/components/ScrollToTop';
import NavigationProgress from '@/components/NavigationProgress';
import CookieConsent from '@/components/CookieConsent';
import { DISCORD_URL } from '@/constants/social';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';

const SITE_URL = 'https://vexara.world';
const SITE_NAME = 'Vexara';
const DEFAULT_TITLE = 'Vexara - Free Browser MMO RTS | 4X Strategy Game';
const DEFAULT_DESCRIPTION =
	'Vexara is a free browser MMO RTS. Galaxies run to a winner. Your commander record, titles, and Vex Points carry forward permanently. Build your nexus, command 12 unit types, forge alliances, and wage real-time war with players worldwide. No download. No account wipes. No pay-to-win.';
const DEFAULT_OG_IMAGE = 'https://cdn.vexara.world/screenshots/overview.webp';

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: DEFAULT_TITLE,
		template: '%s | Vexara'
	},
	description: DEFAULT_DESCRIPTION,
	applicationName: SITE_NAME,
	generator: 'Next.js',
	keywords: [
		'Vexara',
		'mmo rts',
		'browser mmo rts',
		'browser strategy game',
		'multiplayer rts online',
		'free browser rts game',
		'online rts no download',
		'free 4X strategy',
		'sci-fi MMO strategy',
		'persistent galaxy game',
		'browser-based MMO',
		'real-time strategy browser',
		'no pay-to-win strategy game',
		'multiplayer browser strategy'
	],
	authors: [{ name: 'Vexara', url: SITE_URL }],
	creator: 'Vexara',
	publisher: 'Vexara',
	category: 'games',
	classification: 'Strategy Game',
	manifest: '/manifest.json',
	referrer: 'origin-when-cross-origin',
	formatDetection: { email: false, address: false, telephone: false },
	alternates: {
		canonical: '/',
		languages: { 'en-US': '/' }
	},
	openGraph: {
		title: DEFAULT_TITLE,
		description: DEFAULT_DESCRIPTION,
		url: SITE_URL,
		siteName: SITE_NAME,
		locale: 'en_US',
		type: 'website',
		images: [
			{
				url: DEFAULT_OG_IMAGE,
				width: 1280,
				height: 720,
				alt: 'Vexara - a persistent sci-fi 4X galaxy',
				type: 'image/png'
			}
		]
	},
	twitter: {
		card: 'summary_large_image',
		title: DEFAULT_TITLE,
		description:
			'Free browser-based 4X strategy in a living sci-fi galaxy. Galaxies run to a winner. Your record carries forever. No pay-to-win.',
		images: [DEFAULT_OG_IMAGE]
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Vexara'
	},
	robots: {
		index: true,
		follow: true,
		nocache: false,
		googleBot: {
			index: true,
			follow: true,
			'max-image-preview': 'large',
			'max-snippet': -1,
			'max-video-preview': -1
		}
	},
	icons: {
		icon: [
			{ url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
			{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
			{ url: '/favicon.ico' },
			{ url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
			{ url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
		],
		apple: [{ url: '/apple-touch-icon.png', type: 'image/png' }]
	}
};

export const viewport: Viewport = {
	themeColor: '#0b0c0c',
	width: 'device-width',
	initialScale: 1,
	minimumScale: 1,
	viewportFit: 'cover',
	userScalable: false
};

const videoGameSchema = {
	'@context': 'https://schema.org',
	'@type': 'VideoGame',
	name: 'Vexara',
	alternateName: 'Vexara: A Persistent Galaxy',
	description: DEFAULT_DESCRIPTION,
	url: SITE_URL,
	image: DEFAULT_OG_IMAGE,
	genre: ['4X', 'Strategy', 'Massively Multiplayer Online', 'Science Fiction'],
	gamePlatform: ['Web Browser', 'PWA'],
	applicationCategory: 'GameApplication',
	operatingSystem: 'Any (web browser)',
	inLanguage: 'en',
	playMode: 'MultiPlayer',
	numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2 },
	publisher: { '@type': 'Organization', name: 'Vexara', url: SITE_URL },
	offers: {
		'@type': 'Offer',
		price: '0',
		priceCurrency: 'USD',
		availability: 'https://schema.org/InStock',
		url: `${SITE_URL}/register`
	}
};

const organizationSchema = {
	'@context': 'https://schema.org',
	'@type': 'Organization',
	name: 'Vexara',
	url: SITE_URL,
	logo: `${SITE_URL}/vexara-logo.png`,
	sameAs: [DISCORD_URL]
};

const websiteSchema = {
	'@context': 'https://schema.org',
	'@type': 'WebSite',
	name: SITE_NAME,
	url: SITE_URL,
	potentialAction: {
		'@type': 'SearchAction',
		target: `${SITE_URL}/codex?q={search_term_string}`,
		'query-input': 'required name=search_term_string'
	}
};

export default function RootLayout({
	children
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(videoGameSchema) }}
				/>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
				/>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
				/>
			</head>
			<body suppressHydrationWarning>
				{/* Reads CVD preference from localStorage and applies it before first paint
				    to avoid a colour flash. dangerouslySetInnerHTML is intentional — this
				    must be an inline blocking script, not a module. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var m=localStorage.getItem('vx-cvd');if(m&&m!=='none')document.body.setAttribute('data-cvd',m);}catch(e){}})();`
					}}
				/>
				<AuthProvider>
					<QueryProvider>
						<ToastProvider>
							<Suspense fallback={null}>
								<ScrollToTop />
							</Suspense>
							<Suspense fallback={null}>
								<NavigationProgress>{children}</NavigationProgress>
							</Suspense>
							<CookieConsent />
						</ToastProvider>
					</QueryProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
