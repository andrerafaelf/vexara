import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Continuous pixel-space camera for the Starfield map.
 *
 * The old map moved in whole-cell steps: a drag did nothing until it crossed a
 * ~90px threshold, then jumped one cell. That ratcheting is what made panning
 * feel laggy even when no data was loading. This hook replaces that with a
 * camera in *continuous* world-pixel space:
 *
 *   - `pan`/`zoom` mutate refs and write the layer transform directly inside a
 *     requestAnimationFrame loop — NO React re-render happens during a gesture.
 *   - React state (`centerX`, `centerY`, `zoom`) is only reconciled at rest, so
 *     the existing fetch-buffer + coordinate-display logic keeps working off
 *     integer cell coordinates exactly as before.
 *
 * World space: cell (cx,cy) occupies a `cellPx`-sized square. World pixel of a
 * cell centre = (cx * cellPx, cy * cellPx). The camera holds the WORLD pixel
 * that sits under the viewport centre. We render a fixed window of cells once
 * and slide it with translate3d, so panning is pure GPU compositing.
 */

export interface MapCameraOptions {
	/** Logical size of one cell in CSS px at zoom 1. */
	cellPx: number;
	/** Inclusive map bounds in cell units (0..maxIndex on both axes). */
	maxIndex: number;
	/** Initial centre cell. */
	initialCenterX: number;
	initialCenterY: number;
	minZoom: number;
	maxZoom: number;
	/**
	 * Radius (in cells) of the rendered/fetched window around the centre. The
	 * hook derives a per-viewport min-zoom floor from this so the camera can
	 * never zoom out far enough to expose un-rendered cells beyond the window.
	 */
	renderRadius: number;
	/**
	 * When false, single-finger touch does NOT pan the map (the browser keeps
	 * its native vertical scroll) — used by the espionage map, where targets are
	 * selected by tapping and only pinch should zoom. Mouse drag and wheel are
	 * unaffected. Defaults to true.
	 */
	allowTouchPan?: boolean;
	/** Called (debounced by caller via state) when the integer centre settles. */
	onCenterSettled?: (cx: number, cy: number) => void;
}

export interface MapCamera {
	/** Ref to attach to the moving layer (the element that gets transformed). */
	layerRef: React.RefObject<HTMLDivElement | null>;
	/** Ref to attach to the viewport (the clipping element gestures bind to). */
	viewportRef: React.RefObject<HTMLDivElement | null>;
	/** Integer centre cell, updated only at rest. Drives fetch + coord display. */
	centerX: number;
	centerY: number;
	/** Current zoom, updated only at rest (live zoom is written to the transform). */
	zoom: number;
	/** True while a drag/pinch/inertia gesture is in flight. */
	isPanning: boolean;
	/** Imperatively centre on a cell (used by Jump / Reset / event goto). */
	moveTo: (cx: number, cy: number, opts?: { animate?: boolean }) => void;
	/** Nudge zoom by a step toward the viewport centre (keyboard / buttons). */
	zoomBy: (delta: number) => void;
	setZoom: (z: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function useMapCamera(opts: MapCameraOptions): MapCamera {
	const {
		cellPx,
		maxIndex,
		initialCenterX,
		initialCenterY,
		minZoom,
		maxZoom,
		renderRadius,
		allowTouchPan = true,
		onCenterSettled
	} = opts;

	// ── Live camera state (refs — mutated at 60fps, never trigger renders) ──
	// camX/camY = world pixel under the viewport centre.
	const camX = useRef(initialCenterX * cellPx);
	const camY = useRef(initialCenterY * cellPx);
	const zoomRef = useRef(1);

	// Velocity for inertia (world px / ms).
	const velX = useRef(0);
	const velY = useRef(0);

	const layerRef = useRef<HTMLDivElement | null>(null);
	const viewportRef = useRef<HTMLDivElement | null>(null);

	const rafRef = useRef<number | null>(null);
	const dirtyRef = useRef(true);
	const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// True only while a finger/cursor is actively down and dragging. Distinct
	// from the `isPanning` React state (which lags a render and also stays true
	// during inertia): the rAF loop must read this real-time flag to decide when
	// to START applying inertia, otherwise the flick would never play.
	const draggingRef = useRef(false);

	// Effective min-zoom: never let the viewport show more cells than the
	// rendered window holds. Half the viewport, in cells, must stay within
	// renderRadius. Recomputed on resize.
	const effMinZoomRef = useRef(minZoom);
	const computeMinZoom = useCallback(() => {
		const vp = viewportRef.current;
		if (!vp) return minZoom;
		const maxCellsAcross = renderRadius * 2 + 1;
		const minByW = vp.clientWidth / (maxCellsAcross * cellPx);
		const minByH = vp.clientHeight / (maxCellsAcross * cellPx);
		// Pick the larger floor (the tighter constraint) but never above maxZoom.
		return Math.min(maxZoom, Math.max(minZoom, minByW, minByH));
	}, [cellPx, renderRadius, minZoom, maxZoom]);

	const [centerX, setCenterX] = useState(initialCenterX);
	const [centerY, setCenterY] = useState(initialCenterY);
	const [zoom, setZoomState] = useState(1);
	const [isPanning, setIsPanning] = useState(false);

	// Keep the latest callback without re-subscribing the rAF loop.
	const onSettledRef = useRef(onCenterSettled);
	useEffect(() => {
		onSettledRef.current = onCenterSettled;
	}, [onCenterSettled]);

	const worldBounds = useCallback(() => {
		// Camera centre is clamped so the *map* edge can reach the viewport edge
		// but no further (no infinite empty space beyond 0..maxIndex).
		return {
			minX: 0,
			maxX: maxIndex * cellPx,
			minY: 0,
			maxY: maxIndex * cellPx
		};
	}, [cellPx, maxIndex]);

	const clampCam = useCallback(() => {
		const b = worldBounds();
		camX.current = clamp(camX.current, b.minX, b.maxX);
		camY.current = clamp(camY.current, b.minY, b.maxY);
	}, [worldBounds]);

	// Write the current camera to the DOM. World→screen: the layer is rendered
	// with its own (0,0) at world (0,0); we translate so the camera world pixel
	// lands at the viewport centre, then scale around that same point.
	const applyTransform = useCallback(() => {
		const layer = layerRef.current;
		const vp = viewportRef.current;
		if (!layer || !vp) return;
		const z = zoomRef.current;
		const vw = vp.clientWidth;
		const vh = vp.clientHeight;
		// Screen position of world(0,0): viewportCentre - camera*zoom.
		const tx = vw / 2 - camX.current * z;
		const ty = vh / 2 - camY.current * z;
		layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
	}, []);

	// Reconcile integer centre + zoom into React state, debounced to rest.
	const scheduleSettle = useCallback(() => {
		if (settleTimer.current) clearTimeout(settleTimer.current);
		settleTimer.current = setTimeout(() => {
			const cx = clamp(Math.round(camX.current / cellPx), 0, maxIndex);
			const cy = clamp(Math.round(camY.current / cellPx), 0, maxIndex);
			setCenterX((prev) => (prev !== cx ? cx : prev));
			setCenterY((prev) => (prev !== cy ? cy : prev));
			setZoomState((prev) => (prev !== zoomRef.current ? zoomRef.current : prev));
			onSettledRef.current?.(cx, cy);
		}, 90);
	}, [cellPx, maxIndex]);

	// Single rAF pump: applies inertia, writes the transform when dirty.
	const ensureFrame = useCallback(() => {
		if (rafRef.current != null) return;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(now - last, 48); // cap long frames (tab refocus)
			last = now;

			// Inertia: once the pointer is released (draggingRef false), apply the
			// residual flick velocity and decay it exponentially.
			if (!draggingRef.current && (velX.current !== 0 || velY.current !== 0)) {
				camX.current -= velX.current * dt;
				camY.current -= velY.current * dt;
				clampCam();
				dirtyRef.current = true;
				const decay = Math.pow(0.0015, dt / 1000); // ~friction
				velX.current *= decay;
				velY.current *= decay;
				if (Math.hypot(velX.current, velY.current) < 0.002) {
					velX.current = 0;
					velY.current = 0;
					setIsPanning(false);
					scheduleSettle();
				}
			}

			if (dirtyRef.current) {
				applyTransform();
				dirtyRef.current = false;
			}

			// Keep pumping while a gesture or inertia is active; otherwise idle out.
			if (draggingRef.current || velX.current !== 0 || velY.current !== 0) {
				rafRef.current = requestAnimationFrame(tick);
			} else {
				rafRef.current = null;
			}
		};
		rafRef.current = requestAnimationFrame(tick);
	}, [applyTransform, clampCam, scheduleSettle]);

	const allowTouchPanRef = useRef(allowTouchPan);
	useEffect(() => {
		allowTouchPanRef.current = allowTouchPan;
	}, [allowTouchPan]);

	// ── Imperative API ──────────────────────────────────────────────────────
	const markDirty = useCallback(() => {
		dirtyRef.current = true;
		ensureFrame();
	}, [ensureFrame]);

	const moveTo = useCallback(
		(cx: number, cy: number) => {
			velX.current = 0;
			velY.current = 0;
			camX.current = clamp(cx, 0, maxIndex) * cellPx;
			camY.current = clamp(cy, 0, maxIndex) * cellPx;
			clampCam();
			markDirty();
			setCenterX(clamp(Math.round(cx), 0, maxIndex));
			setCenterY(clamp(Math.round(cy), 0, maxIndex));
			scheduleSettle();
		},
		[cellPx, maxIndex, clampCam, markDirty, scheduleSettle]
	);

	const setZoom = useCallback(
		(z: number) => {
			zoomRef.current = clamp(z, effMinZoomRef.current, maxZoom);
			markDirty();
			setZoomState(zoomRef.current);
			scheduleSettle();
		},
		[maxZoom, markDirty, scheduleSettle]
	);

	const zoomBy = useCallback(
		(delta: number) => setZoom(zoomRef.current * (1 + delta)),
		[setZoom]
	);

	// ── Gesture bindings ──────────────────────────────────────────────────────
	useEffect(() => {
		const vp = viewportRef.current;
		if (!vp) return;

		let dragging = false;
		let lastX = 0;
		let lastY = 0;
		let lastT = 0;
		let pinchStartDist = 0;
		let pinchStartZoom = 1;
		// World pixel under the pinch midpoint at pinch start, kept fixed so the
		// map zooms toward the fingers (not the viewport centre).
		let pinchAnchorWorld = { x: 0, y: 0 };

		const screenToWorld = (sx: number, sy: number) => {
			const rect = vp.getBoundingClientRect();
			const z = zoomRef.current;
			const localX = sx - rect.left;
			const localY = sy - rect.top;
			return {
				x: camX.current + (localX - rect.width / 2) / z,
				y: camY.current + (localY - rect.height / 2) / z
			};
		};

		const touchDist = (t: TouchList) => {
			const dx = t[0].clientX - t[1].clientX;
			const dy = t[0].clientY - t[1].clientY;
			return Math.hypot(dx, dy);
		};
		const touchMid = (t: TouchList) => ({
			x: (t[0].clientX + t[1].clientX) / 2,
			y: (t[0].clientY + t[1].clientY) / 2
		});

		// Re-anchor the camera so a fixed world point stays under a fixed screen
		// point after a zoom change (cursor- / pinch-anchored zoom).
		const zoomToward = (newZoom: number, screenX: number, screenY: number) => {
			const z = clamp(newZoom, effMinZoomRef.current, maxZoom);
			const rect = vp.getBoundingClientRect();
			const localX = screenX - rect.left - rect.width / 2;
			const localY = screenY - rect.top - rect.height / 2;
			// world under cursor before = camX + localX/oldZoom ; keep it equal after.
			const worldX = camX.current + localX / zoomRef.current;
			const worldY = camY.current + localY / zoomRef.current;
			camX.current = worldX - localX / z;
			camY.current = worldY - localY / z;
			zoomRef.current = z;
			clampCam();
			markDirty();
			setZoomState(z);
			scheduleSettle();
		};

		// ── Mouse ──
		const onMouseDown = (e: MouseEvent) => {
			if (e.button !== 0) return;
			e.preventDefault();
			dragging = true;
			draggingRef.current = true;
			velX.current = 0;
			velY.current = 0;
			lastX = e.clientX;
			lastY = e.clientY;
			lastT = performance.now();
			setIsPanning(true);
			ensureFrame();
		};
		const onMouseMove = (e: MouseEvent) => {
			if (!dragging) return;
			const z = zoomRef.current;
			const now = performance.now();
			const dx = (e.clientX - lastX) / z;
			const dy = (e.clientY - lastY) / z;
			camX.current -= dx;
			camY.current -= dy;
			clampCam();
			const dt = Math.max(1, now - lastT);
			// EMA velocity for a natural flick.
			velX.current = 0.8 * (dx / dt) + 0.2 * velX.current;
			velY.current = 0.8 * (dy / dt) + 0.2 * velY.current;
			lastX = e.clientX;
			lastY = e.clientY;
			lastT = now;
			dirtyRef.current = true;
		};
		const onMouseUp = () => {
			if (!dragging) return;
			dragging = false;
			draggingRef.current = false;
			// If the flick was slow, just settle; otherwise let inertia run.
			if (Math.hypot(velX.current, velY.current) < 0.01) {
				velX.current = 0;
				velY.current = 0;
				setIsPanning(false);
				scheduleSettle();
			}
			ensureFrame();
		};

		// ── Wheel: plain wheel = zoom toward cursor (feels native on a map). ──
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const factor = Math.exp(-e.deltaY * 0.0015);
			zoomToward(zoomRef.current * factor, e.clientX, e.clientY);
		};

		// ── Touch ──
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				// When touch-pan is disabled (espionage), leave single-finger gestures
				// to the browser so the page can scroll and taps still select.
				if (!allowTouchPanRef.current) return;
				dragging = true;
				draggingRef.current = true;
				velX.current = 0;
				velY.current = 0;
				lastX = e.touches[0].clientX;
				lastY = e.touches[0].clientY;
				lastT = performance.now();
				setIsPanning(true);
				ensureFrame();
			} else if (e.touches.length === 2) {
				e.preventDefault();
				dragging = false;
				draggingRef.current = false;
				pinchStartDist = touchDist(e.touches);
				pinchStartZoom = zoomRef.current;
				const mid = touchMid(e.touches);
				pinchAnchorWorld = screenToWorld(mid.x, mid.y);
			}
		};
		const onTouchMove = (e: TouchEvent) => {
			if (e.touches.length === 2 && pinchStartDist > 0) {
				e.preventDefault();
				const ratio = touchDist(e.touches) / pinchStartDist;
				const mid = touchMid(e.touches);
				const z = clamp(pinchStartZoom * ratio, effMinZoomRef.current, maxZoom);
				// Keep the original world anchor under the *current* finger midpoint.
				const rect = vp.getBoundingClientRect();
				const localX = mid.x - rect.left - rect.width / 2;
				const localY = mid.y - rect.top - rect.height / 2;
				camX.current = pinchAnchorWorld.x - localX / z;
				camY.current = pinchAnchorWorld.y - localY / z;
				zoomRef.current = z;
				clampCam();
				dirtyRef.current = true;
				ensureFrame();
				setZoomState(z);
				scheduleSettle();
			} else if (e.touches.length === 1 && dragging) {
				e.preventDefault();
				const z = zoomRef.current;
				const now = performance.now();
				const dx = (e.touches[0].clientX - lastX) / z;
				const dy = (e.touches[0].clientY - lastY) / z;
				camX.current -= dx;
				camY.current -= dy;
				clampCam();
				const dt = Math.max(1, now - lastT);
				velX.current = 0.8 * (dx / dt) + 0.2 * velX.current;
				velY.current = 0.8 * (dy / dt) + 0.2 * velY.current;
				lastX = e.touches[0].clientX;
				lastY = e.touches[0].clientY;
				lastT = now;
				dirtyRef.current = true;
				ensureFrame();
			}
		};
		const onTouchEnd = (e: TouchEvent) => {
			if (e.touches.length === 0) {
				pinchStartDist = 0;
				if (dragging) {
					dragging = false;
					draggingRef.current = false;
					if (Math.hypot(velX.current, velY.current) < 0.01) {
						velX.current = 0;
						velY.current = 0;
						setIsPanning(false);
						scheduleSettle();
					}
					ensureFrame();
				} else {
					setIsPanning(false);
					scheduleSettle();
				}
			} else if (e.touches.length === 1) {
				// Lifting one finger after a pinch → resume single-finger drag
				// (only where touch-pan is enabled).
				pinchStartDist = 0;
				if (!allowTouchPanRef.current) return;
				dragging = true;
				draggingRef.current = true;
				lastX = e.touches[0].clientX;
				lastY = e.touches[0].clientY;
				lastT = performance.now();
			}
		};

		vp.addEventListener('mousedown', onMouseDown);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		vp.addEventListener('wheel', onWheel, { passive: false });
		vp.addEventListener('touchstart', onTouchStart, { passive: false });
		vp.addEventListener('touchmove', onTouchMove, { passive: false });
		vp.addEventListener('touchend', onTouchEnd, { passive: false });
		vp.addEventListener('touchcancel', onTouchEnd, { passive: false });

		// Initial paint + reposition on viewport resize. Recompute the min-zoom
		// floor and re-clamp current zoom so a window resize can never leave the
		// camera zoomed out past the rendered window.
		const refreshZoomFloor = () => {
			effMinZoomRef.current = computeMinZoom();
			if (zoomRef.current < effMinZoomRef.current) {
				zoomRef.current = effMinZoomRef.current;
				setZoomState(zoomRef.current);
			}
		};
		refreshZoomFloor();
		applyTransform();
		const ro = new ResizeObserver(() => {
			refreshZoomFloor();
			clampCam();
			dirtyRef.current = true;
			applyTransform();
		});
		ro.observe(vp);

		return () => {
			vp.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			vp.removeEventListener('wheel', onWheel);
			vp.removeEventListener('touchstart', onTouchStart);
			vp.removeEventListener('touchmove', onTouchMove);
			vp.removeEventListener('touchend', onTouchEnd);
			vp.removeEventListener('touchcancel', onTouchEnd);
			ro.disconnect();
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			if (settleTimer.current) clearTimeout(settleTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		layerRef,
		viewportRef,
		centerX,
		centerY,
		zoom,
		isPanning,
		moveTo,
		zoomBy,
		setZoom
	};
}
