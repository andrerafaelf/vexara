'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Returns true for a brief window after `value` changes, then false. Useful
 * for triggering a one-shot CSS animation/class on a value transition without
 * having to manage a timeout per component.
 *
 * Skips the very first render (initial mount doesn't count as a "change") so
 * components don't flash on first paint.
 *
 * The watched value is compared with Object.is, matching React's own
 * stale-state semantics. For object values, pass a stable identity (e.g. a
 * server timestamp / version number) rather than a fresh object each render.
 */
export function useFlashOnChange<T>(value: T, durationMs = 600): boolean {
  const [flashing, setFlashing] = useState(false);
  const previousRef = useRef<T>(value);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      previousRef.current = value;
      return;
    }
    if (Object.is(previousRef.current, value)) return;
    previousRef.current = value;
    setFlashing(true);
    const id = setTimeout(() => setFlashing(false), durationMs);
    return () => clearTimeout(id);
  }, [value, durationMs]);

  return flashing;
}

/**
 * Variant that fires only when `value` transitions from `false` to `true`.
 * Use for "became affordable" / "became available" gates where the
 * become-unavailable direction shouldn't trigger a celebration animation.
 */
export function useFlashOnTrue(value: boolean, durationMs = 600): boolean {
  const [flashing, setFlashing] = useState(false);
  const previousRef = useRef(value);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      previousRef.current = value;
      return;
    }
    const prev = previousRef.current;
    previousRef.current = value;
    if (prev || !value) return;
    setFlashing(true);
    const id = setTimeout(() => setFlashing(false), durationMs);
    return () => clearTimeout(id);
  }, [value, durationMs]);

  return flashing;
}
