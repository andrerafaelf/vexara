'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

export default function NexusIndexPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }
    // Fast path: jump straight to the last-used nexus without bouncing through "/".
    const storedId = localStorage.getItem(SELECTED_NEXUS_KEY);
    if (storedId) {
      router.replace(`/nexus/${storedId}`);
      return;
    }
    // Slow path: "/" already resolves preferred nexus (or shows create-nexus / galaxy picker).
    router.replace('/');
  }, [router]);

  return null;
}
