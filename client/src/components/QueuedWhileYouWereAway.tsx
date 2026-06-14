'use client';

import { useEffect, useState } from 'react';
import { useModalSlot } from '@/context/ModalQueueContext';
import { useOnboarding } from '@/context/OnboardingContext';
import WhileYouWereAway from './WhileYouWereAway';

const WYWA_SESSION_KEY = 'wywa_shown_session';

// Second slot — only wants the floor once the PWA guide is dismissed. We stamp
// the per-session flag at mount time so the slot doesn't re-arm on every tab
// switch within a single session, even if WhileYouWereAway internally decides
// it has nothing to surface.
//
// Suppressed while the player is still actively in onboarding — showing a
// "while you were away" summary before they understand the game just adds noise
// and buries the tutorial step they need to act on.
export default function QueuedWhileYouWereAway() {
	const [needsToShow, setNeedsToShow] = useState(false);
	const canShow = useModalSlot('wywa', needsToShow);
	const { isEnabled: onboardingEnabled, currentStep } = useOnboarding();

	// Still in onboarding: don't compete for the modal floor at all.
	const onboardingInProgress = onboardingEnabled && currentStep !== null;

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (onboardingInProgress) return;
		try {
			if (!localStorage.getItem('token')) return;
			if (sessionStorage.getItem(WYWA_SESSION_KEY)) return;
			sessionStorage.setItem(WYWA_SESSION_KEY, '1');
			setNeedsToShow(true);
		} catch {
			/* private mode */
		}
	}, [onboardingInProgress]);

	if (!canShow) return null;
	return <WhileYouWereAway onDismiss={() => setNeedsToShow(false)} />;
}
