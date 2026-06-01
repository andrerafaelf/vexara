'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

// URL-synced tab state. Replaces useState<Tab> in tabbed views so that:
//   - Browser back/forward steps through tab switches
//   - Bookmarks and shared links land on the same tab the sender saw
//   - Returning from a detail page (e.g. /u/<name>) restores the originating tab
//
// The tab lives in a query param (default `tab`). Switching tabs uses
// router.replace(), not push(), so a long tab-switching session doesn't bloat
// the history stack . only cross-page navigations should produce back entries.
//
// Allowed values are validated against the caller's list, so a garbage `?tab=xyz`
// from a stale link falls back to the default instead of rendering nothing.

export function useTabParam<T extends string>(
	allowed: readonly T[],
	defaultTab: T,
	paramName: string = 'tab'
): [T, (next: T) => void] {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const raw = searchParams?.get(paramName);
	const active: T = useMemo(() => {
		if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
		return defaultTab;
	}, [raw, allowed, defaultTab]);

	const setTab = useCallback(
		(next: T) => {
			if (next === active) return;
			const params = new URLSearchParams(searchParams?.toString() ?? '');
			if (next === defaultTab) {
				params.delete(paramName);
			} else {
				params.set(paramName, next);
			}
			const qs = params.toString();
			router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[active, defaultTab, paramName, pathname, router, searchParams]
	);

	return [active, setTab];
}
