'use client';

import { Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
	LATEST_PATCH_HEADLINE,
	LATEST_PATCH_LABEL,
	LATEST_PATCH_VERSION
} from '@/data/latestPatch';
import '@/styles/NewPatchToast.css';

const STORAGE_KEY = 'lastSeenPatchVersion';

// Lives mounted in GameLayout. Compares the last patch version this browser
// has acknowledged against LATEST_PATCH_VERSION and surfaces a one-shot prompt
// when they diverge.
//
// "New player" detection uses token presence, not the absence of the
// lastSeenPatchVersion key. Using key-absence breaks the first deploy of this
// component: every existing player's browser has lastSeenPatchVersion = null
// because the key never existed before, so the toast would silently
// initialize the key and never fire for anyone. Token-based detection lines
// up with the real meaning of "new" . a brand new account that hasn't seen
// any prior patches yet . regardless of whether this code shipped before
// or after they signed up.
//
// Two ways to clear the toast:
//   - "Read" navigates to /patch-notes#v<version> (new tab so game session
//     is preserved) and marks the version seen
//   - "X" dismisses without navigating, also marks the version seen
//
// State lives in localStorage only . no backend round-trip, no per-user row,
// no analytics event for a player just dismissing a toast. If a user clears
// their storage they may see the prompt a second time; that cost is lower
// than the cost of a schema/migration for this feature.

export default function NewPatchToast() {
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let stored: string | null = null;
		let hasToken = false;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
			hasToken = !!localStorage.getItem('token');
		} catch {
			/* private mode / quota */
		}
		if (stored === LATEST_PATCH_VERSION) return;
		if (stored === null && !hasToken) {
			// Brand new visitor with no account yet. Silently stamp the current
			// version so once they sign up they won't be greeted by a "new!" prompt
			// for changes that shipped before they arrived.
			try {
				localStorage.setItem(STORAGE_KEY, LATEST_PATCH_VERSION);
			} catch {
				/* ignore */
			}
			return;
		}
		setShow(true);
	}, []);

	const markSeen = useCallback(() => {
		try {
			localStorage.setItem(STORAGE_KEY, LATEST_PATCH_VERSION);
		} catch {
			/* ignore */
		}
		setShow(false);
	}, []);

	if (!show) return null;

	return (
		<div
			className="new-patch-toast"
			role="dialog"
			aria-modal="true"
			aria-label="New patch available"
		>
			<div className="new-patch-toast-header">
				<div className="new-patch-toast-icon" aria-hidden="true">
					<Sparkles size={16} />
				</div>
				<div className="new-patch-toast-label">{LATEST_PATCH_LABEL} is live</div>
				<button
					type="button"
					className="new-patch-toast-close"
					onClick={markSeen}
					aria-label="Dismiss new patch notification"
				>
					<X size={16} />
				</button>
			</div>
			<div className="new-patch-toast-body">
				<div className="new-patch-toast-headline">{LATEST_PATCH_HEADLINE}</div>
				<div className="new-patch-toast-subtext">See what changed in this update.</div>
			</div>
			<div className="new-patch-toast-actions">
				<a
					href={`/patch-notes/${LATEST_PATCH_VERSION}`}
					target="_blank"
					rel="noopener noreferrer"
					className="new-patch-toast-cta"
					onClick={markSeen}
				>
					Read Patch Notes
				</a>
				<button type="button" className="new-patch-toast-dismiss" onClick={markSeen}>
					Dismiss
				</button>
			</div>
		</div>
	);
}
