'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.vexara.world');
  }, [router]);

  return null;
}
