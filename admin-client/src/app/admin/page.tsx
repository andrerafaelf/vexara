'use client';

import Admin from '@/components/Admin';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    const token = sessionStorage.getItem('admin_basic_auth');
    if (!token) {
      router.replace('/auth');
    }
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_basic_auth');
    router.replace('/auth');
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0a1228', color: '#eaf0ff' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #1e315f',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#ff4f72' }}>Neon Dominion Admin</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '0.55rem 0.85rem',
            borderRadius: '8px',
            border: 'none',
            background: '#26457d',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </header>

      <section style={{ padding: '1rem' }}>
        <Admin />
      </section>
    </main>
  );
}
