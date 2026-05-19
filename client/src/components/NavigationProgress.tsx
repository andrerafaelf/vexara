'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);

  const complete = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    completeTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  };

  useEffect(() => {
    const current = `${pathname}?${searchParams}`;
    if (current === prevRouteRef.current) return;
    prevRouteRef.current = current;
    complete();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Intercept link clicks to start the bar before navigation begins
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || anchor.target === '_blank') return;

      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);

      setProgress(10);
      setVisible(true);

      timerRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 85) {
            clearInterval(timerRef.current!);
            return 85;
          }
          return p + (85 - p) * 0.08;
        });
      }, 100);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--color-cyan-500)',
          transition: progress === 100 ? 'width 0.1s ease-out' : 'width 0.1s linear',
          boxShadow: '0 0 6px var(--color-cyan-500)',
        }}
      />
    </div>
  );
}
