'use client';

import '@/styles/PublicNav.css';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import DiscordButton from './DiscordButton';

interface PublicNavProps {
	/** Optional section label that renders as "Vexara / LOC" — used by the codex. */
	loc?: string;
}

/**
 * Single header for every public page.
 *
 * Authenticated visitors get a short "← Back to game" CTA instead of the
 * register/login pair. This avoids dead-ending logged-in players on
 * marketing pages they reached via a deep link.
 */
export default function PublicNav({ loc }: PublicNavProps) {
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	useEffect(() => {
		setIsLoggedIn(!!localStorage.getItem('token'));
	}, []);

	const handleBack = (e: React.MouseEvent) => {
		if (window.history.length > 1) {
			e.preventDefault();
			window.history.back();
		}
	};

	return (
		<header className="vx-nav">
			<Link href={isLoggedIn ? '/play' : '/'} className="vx-nav-mark" aria-label="Vexara home">
				<Image src="/vexara-logo.png" alt="" width={26} height={26} priority />
				<span>Vexara</span>
				{loc && (
					<>
						<span className="vx-nav-sep">//</span>
						<span className="vx-nav-loc">{loc}</span>
					</>
				)}
			</Link>

			<nav className="vx-nav-links" aria-label="Primary">
				{isLoggedIn ? (
					<Link href="/play" className="vx-nav-cta" onClick={handleBack}>
						← Back to game
					</Link>
				) : (
					<>
						<Link href="/codex">Codex</Link>
						<Link href="/state-of-galaxy">Galaxy Status</Link>
						<Link href="/calculator">Calculator</Link>
						<DiscordButton variant="outline" label="Discord" utm="public_nav" />
						<Link href="/login" className="vx-nav-cta-outline">
							Login
						</Link>
						<Link href="/register" className="vx-nav-cta">
							Join live galaxy
						</Link>
					</>
				)}
			</nav>
		</header>
	);
}
