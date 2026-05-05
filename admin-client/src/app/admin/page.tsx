'use client';

import Admin from '@/components/Admin';
import '@/styles/Admin.css';
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
      <header className="admin-page-header">
        <h1 className="admin-page-title">⚡ Neon Dominion Admin</h1>
        <button className="admin-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <section style={{ padding: '1.5rem 1rem' }}>
        <Admin />
      </section>
    </main>
  );
}
