'use client';

import { useSyncExternalStore } from 'react';

// One shared 1Hz clock. Components opt in via useNow(), only subscribed components re-render
// each tick, instead of forcing a setState higher in the tree that cascades through everything.
// The clock pauses when the document is hidden so backgrounded PWAs/tabs don't burn CPU.

let nowMs = Date.now();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

function tick() {
  nowMs = Date.now();
  for (const l of listeners) l();
}

function startInterval() {
  if (intervalId) return;
  // Snap to a fresh value immediately so subscribers don't see a stale `nowMs` on resume.
  nowMs = Date.now();
  intervalId = setInterval(tick, 1000);
}

function stopInterval() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}

function ensureVisibilityBinding() {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (listeners.size === 0) return;
    if (document.visibilityState === 'visible') {
      tick();
      startInterval();
    } else {
      stopInterval();
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureVisibilityBinding();
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    startInterval();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopInterval();
  };
}

const getSnapshot = () => nowMs;
// Stable SSR value so React's hydration check doesn't trip on a real Date.now().
const getServerSnapshot = () => 0;

/**
 * Subscribes the calling component to a shared 1Hz clock. Returns the current time as a number
 * of milliseconds since the epoch. Only components that call this hook re-render on each tick .
 * not their parents or siblings. The clock auto-pauses when the document is hidden.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
