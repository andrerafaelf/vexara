'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

// The /patch-notes page is a server-rendered marketing page with a PublicNav
// (Login / Enlist) aimed at logged-out visitors. Authenticated players reach it
// from the in-game "new patch" toast and the in-game footer, and previously had
// no way back to the game — the only nav was the marketing header. This client
// island detects an existing session (token in localStorage) and surfaces a
// sticky "Back to game" bar that routes straight back to the player's last
// selected nexus (or /play, which redirects appropriately).
export default function PatchNotesBackToGame() {
	const [href, setHref] = useState<string | null>(null);

	useEffect(() => {
		try {
			if (!localStorage.getItem('token')) return;
			const nexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
			setHref(nexusId ? `/nexus/${nexusId}` : '/play');
		} catch {
			/* private mode / quota — leave the bar hidden */
		}
	}, []);

	if (!href) return null;

	return (
		<div className="pn-back-bar">
			<Link href={href} className="pn-back-btn">
				<ArrowLeft size={16} aria-hidden="true" />
				<span>Back to game</span>
			</Link>
		</div>
	);
}
