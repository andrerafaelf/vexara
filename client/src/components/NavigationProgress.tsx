'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type Ctx = {
	/** Mark a waiter as pending (data not yet ready). Lets the bar know when to finish. */
	setWaiting: (key: string, waiting: boolean) => void;
	/** Manually start the bar (e.g. link click intercept). */
	start: () => void;
};

const LoadingBarCtx = createContext<Ctx | null>(null);

/**
 * Register a per-page "is this view ready" signal so the top progress bar can finish at the
 * right moment. This NEVER blanks the page, pages render their own content (or skeletons)
 * synchronously; this hook only drives the bar.
 */
export function usePageReady(isReady: boolean, key: string = 'page') {
	const ctx = useContext(LoadingBarCtx);
	useEffect(() => {
		if (!ctx) return;
		ctx.setWaiting(key, !isReady);
		return () => ctx.setWaiting(key, false);
	}, [ctx, isReady, key]);
}

export default function NavigationProgress({ children }: { children?: React.ReactNode }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [progress, setProgress] = useState(0);
	const [visible, setVisible] = useState(false);
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const waitersRef = useRef<Set<string>>(new Set());
	const routeKey = `${pathname}?${searchParams?.toString() ?? ''}`;
	const prevRouteRef = useRef(routeKey);
	const routeCommittedRef = useRef(true);
	const isFirstRouteEffectRef = useRef(true);

	const clearTimers = () => {
		if (tickRef.current) {
			clearInterval(tickRef.current);
			tickRef.current = null;
		}
		if (fadeRef.current) {
			clearTimeout(fadeRef.current);
			fadeRef.current = null;
		}
	};

	const tryFinish = useCallback(() => {
		if (waitersRef.current.size > 0) return;
		if (!routeCommittedRef.current) return;
		clearTimers();
		setProgress(100);
		fadeRef.current = setTimeout(() => {
			setVisible(false);
			setProgress(0);
		}, 180);
	}, []);

	const start = useCallback(() => {
		clearTimers();
		setVisible(true);
		setProgress((p) => (p > 0 && p < 90 ? p : 8));
		tickRef.current = setInterval(() => {
			setProgress((p) => {
				const cap = waitersRef.current.size > 0 || !routeCommittedRef.current ? 88 : 95;
				if (p >= cap) return cap;
				return p + (cap - p) * 0.08;
			});
		}, 120);
	}, []);

	const setWaiting = useCallback(
		(key: string, waiting: boolean) => {
			const had = waitersRef.current.size;
			if (waiting) waitersRef.current.add(key);
			else waitersRef.current.delete(key);

			if (waiting && had === 0) {
				start();
			} else if (!waiting && waitersRef.current.size === 0) {
				tryFinish();
			}
		},
		[start, tryFinish]
	);

	// Route change: bar runs until route is committed AND waiters drain.
	// Crucially we do NOT blank the page, the shell stays visible at all times. Pages
	// already render skeletons or `null` while their data loads.
	useEffect(() => {
		if (isFirstRouteEffectRef.current) {
			isFirstRouteEffectRef.current = false;
			return;
		}
		if (routeKey === prevRouteRef.current) return;
		prevRouteRef.current = routeKey;
		routeCommittedRef.current = false;
		const raf = requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				routeCommittedRef.current = true;
				tryFinish();
			});
		});
		return () => cancelAnimationFrame(raf);
	}, [routeKey, tryFinish]);

	// Link click interception, bar starts immediately, before Next.js begins routing
	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
				return;
			const anchor = (e.target as Element).closest('a');
			if (!anchor) return;
			const href = anchor.getAttribute('href');
			if (
				!href ||
				href.startsWith('#') ||
				href.startsWith('http') ||
				href.startsWith('mailto:') ||
				anchor.target === '_blank'
			)
				return;
			if (href === window.location.pathname + window.location.search) return;
			routeCommittedRef.current = false;
			start();
		};
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	}, [start]);

	useEffect(() => () => clearTimers(), []);

	const ctxValue = useMemo<Ctx>(() => ({ setWaiting, start }), [setWaiting, start]);

	return (
		<LoadingBarCtx.Provider value={ctxValue}>
			{visible && (
				<div
					aria-hidden
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						height: '2px',
						zIndex: 9999,
						pointerEvents: 'none'
					}}
				>
					<div
						style={{
							height: '100%',
							width: `${progress}%`,
							background: 'var(--color-cyan-500)',
							transition: progress === 100 ? 'width 0.18s ease-out' : 'width 0.12s linear',
							boxShadow: '0 0 6px var(--color-cyan-500)',
							willChange: 'width'
						}}
					/>
				</div>
			)}
			{children}
		</LoadingBarCtx.Provider>
	);
}

/**
 * Programmatic navigation helper. Use instead of `router.push` from in-app buttons so the
 * top progress bar shows immediately (the link-click interceptor only catches real <a> tags).
 */
export function useStartProgress() {
	const ctx = useContext(LoadingBarCtx);
	return useCallback(() => {
		ctx?.start();
	}, [ctx]);
}
