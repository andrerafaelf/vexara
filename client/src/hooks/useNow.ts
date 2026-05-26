'use client';

import { useSyncExternalStore } from 'react';
import { serverNow } from '../realtime/serverClock';

// One shared 1Hz clock. Components opt in via useNow(), only subscribed components re-render
// each tick, instead of forcing a setState higher in the tree that cascades through everything.
// The clock pauses when the document is hidden so backgrounded PWAs/tabs don't burn CPU.
//
// The clock is server-anchored, not browser-anchored: serverNow() applies the
// observed (clientNow - serverDate) offset from the most recent API responses,
// so countdowns against server-issued timestamps (build/train queue
// completesAt, attack ETAs) stay accurate even when the local clock drifts.

let nowMs = serverNow();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

function tick() {
  nowMs = serverNow();
  for (const l of listeners) l();
}

function startInterval() {
  if (intervalId) return;
  // Snap to a fresh value immediately so subscribers don't see a stale `nowMs` on resume.
  nowMs = serverNow();
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

// Stable no-op subscribe used by useGatedNow when disabled, so the calling
// component is wired to a store that *never* notifies — re-renders only when
// `enabled` itself flips.
function noopSubscribe(): () => void {
  return () => {};
}

/**
 * Like useNow(), but only subscribes to the 1Hz clock when `enabled` is true.
 * Returns Date.now() at the most recent enabled-render; returns 0 when disabled.
 * Callers should treat the return value as "current tick time" and only use it
 * for code paths that are also gated on `enabled`.
 *
 * Why this exists: large lists of components (BuildingCard, TrainCard) only
 * need 1Hz re-renders when something on that card is *on* the boundary of
 * changing (e.g. resources about to cross a cost). For the other 90% of the
 * lifetime, the card can stay static. Conditionally subscribing keeps the
 * per-second render count proportional to "interesting" cards, not total cards.
 */
export function useGatedNow(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    enabled ? getSnapshot : () => 0,
    getServerSnapshot,
  );
}
