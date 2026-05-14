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
    <main className="admin-page">
      <header className="admin-page-header">
        <div className="admin-page-brand">
          <span className="admin-page-mark" aria-hidden="true">
            VX
          </span>
          <span>
            <span className="admin-page-title">Vexara Admin</span>
            <span className="admin-page-subtitle">Operations console</span>
          </span>
        </div>
        <button className="admin-logout-btn" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <section className="admin-page-body">
        <Admin />
      </section>
    </main>
  );
}
