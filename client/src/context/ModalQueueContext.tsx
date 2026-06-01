'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Single source of truth for which one-shot overlay/modal is allowed to render
// at any given moment on the dashboard. Without this, PwaGuideModal, WYWA,
// OnboardingOverlay and NewPatchToast all decide independently whether to
// surface themselves and stack on top of each other on first load — disorienting
// for new players and outright broken for the tutorial (whose spotlight is
// drawn under a higher-z modal).
//
// Lower priority number renders first; the next slot only unblocks once the
// active one releases.

export type ModalSlotId = 'pwa' | 'wywa' | 'onboarding' | 'patch';

const PRIORITY: Record<ModalSlotId, number> = {
	pwa: 1,
	wywa: 2,
	onboarding: 3,
	patch: 4
};

interface ModalQueueContextValue {
	// Which slot, if any, currently has the floor.
	active: ModalSlotId | null;
	// A slot reports that it wants the floor. Returns whether it currently has it.
	// Components should still render their UI only when isActive() returns true.
	request: (id: ModalSlotId) => void;
	// A slot reports that it is done (dismissed / completed / not needed).
	release: (id: ModalSlotId) => void;
	isActive: (id: ModalSlotId) => boolean;
}

const ModalQueueContext = createContext<ModalQueueContextValue>({
	active: null,
	request: () => {},
	release: () => {},
	isActive: () => false
});

export function ModalQueueProvider({ children }: { children: React.ReactNode }) {
	const [pending, setPending] = useState<Set<ModalSlotId>>(new Set());

	const request = useCallback((id: ModalSlotId) => {
		setPending((prev) => {
			if (prev.has(id)) return prev;
			const next = new Set(prev);
			next.add(id);
			return next;
		});
	}, []);

	const release = useCallback((id: ModalSlotId) => {
		setPending((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const active = useMemo<ModalSlotId | null>(() => {
		let best: ModalSlotId | null = null;
		for (const id of pending) {
			if (best === null || PRIORITY[id] < PRIORITY[best]) best = id;
		}
		return best;
	}, [pending]);

	const isActive = useCallback((id: ModalSlotId) => active === id, [active]);

	const value = useMemo(
		() => ({ active, request, release, isActive }),
		[active, request, release, isActive]
	);

	return <ModalQueueContext.Provider value={value}>{children}</ModalQueueContext.Provider>;
}

export function useModalQueue() {
	return useContext(ModalQueueContext);
}

// Convenience hook: register a slot as "wanting the floor" while `wantsToShow`
// is true, automatically release when it goes false or the component unmounts.
// Returns whether this slot currently owns the floor.
export function useModalSlot(id: ModalSlotId, wantsToShow: boolean): boolean {
	const { request, release, isActive } = useModalQueue();

	useEffect(() => {
		if (wantsToShow) {
			request(id);
			return () => release(id);
		}
		release(id);
		return undefined;
	}, [id, wantsToShow, request, release]);

	return isActive(id);
}
