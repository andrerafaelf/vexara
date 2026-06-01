'use client';

import { useEffect, useState } from 'react';
import { useModalSlot } from '@/context/ModalQueueContext';
import PwaGuideModal from './PwaGuideModal';

const PWA_GUIDE_SEEN_KEY = 'pwa_guide_seen';

// First slot in the global modal queue. Stamps the localStorage flag the moment
// it becomes visible (not on mount) so a queued-but-never-shown player doesn't
// have it silently marked as "seen" if they navigate away before higher-priority
// modals release. Currently nothing has a higher priority, but the contract
// stays correct if one is added later.
export default function QueuedPwaGuideModal() {
	const [needsToShow, setNeedsToShow] = useState(false);
	const canShow = useModalSlot('pwa', needsToShow);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			if (!localStorage.getItem(PWA_GUIDE_SEEN_KEY)) setNeedsToShow(true);
		} catch {
			/* private mode */
		}
	}, []);

	useEffect(() => {
		if (!canShow) return;
		try {
			localStorage.setItem(PWA_GUIDE_SEEN_KEY, '1');
		} catch {
			/* ignore */
		}
	}, [canShow]);

	if (!canShow) return null;
	return <PwaGuideModal onClose={() => setNeedsToShow(false)} />;
}
