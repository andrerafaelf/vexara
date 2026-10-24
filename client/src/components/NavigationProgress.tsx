'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	Suspense
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

/**
 * Reads usePathname/useSearchParams in isolation. useSearchParams opts its nearest Suspense
 * boundary out of static rendering, so this must live in its own boundary, NEVER around the
 * page children (otherwise every static page bails to client-side rendering and ships no HTML).
 */
function RouteListener({ onRoute }: { onRoute: (routeKey: string) => void }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const routeKey = `${pathname}?${searchParams?.toString() ?? ''}`;
	useEffect(() => {
		onRoute(routeKey);
	}, [routeKey, onRoute]);
	return null;
}

export default function NavigationProgress({ children }: { children?: React.ReactNode }) {
	const [progress, setProgress] = useState(0);
	const [visible, setVisible] = useState(false);
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const waitersRef = useRef<Set<string>>(new Set());
	const prevRouteRef = useRef<string | null>(null);
	const rafRef = useRef<number | null>(null);
	const routeCommittedRef = useRef(true);

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
	const handleRoute = useCallback(
		(routeKey: string) => {
			if (prevRouteRef.current === null) {
				prevRouteRef.current = routeKey;
				return;
			}
			if (routeKey === prevRouteRef.current) return;
			prevRouteRef.current = routeKey;
			routeCommittedRef.current = false;
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(() => {
				rafRef.current = requestAnimationFrame(() => {
					rafRef.current = null;
					routeCommittedRef.current = true;
					tryFinish();
				});
			});
		},
		[tryFinish]
	);

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

	useEffect(
		() => () => {
			clearTimers();
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		},
		[]
	);

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
			<Suspense fallback={null}>
				<RouteListener onRoute={handleRoute} />
			</Suspense>
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
