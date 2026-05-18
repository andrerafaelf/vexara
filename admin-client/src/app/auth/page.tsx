'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import '@/styles/Admin.css';

export default function AuthPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setError('Enter username and password');
      return;
    }

    sessionStorage.setItem('admin_basic_auth', btoa(`${normalizedUsername}:${password}`));
    router.replace('/admin');
  };

  return (
    <main className="admin-auth">
      <div className="admin-auth-panel-left">
        <p className="admin-auth-eyebrow">Operations console</p>
        <h1 className="admin-auth-headline">Vexara Admin</h1>
        <p className="admin-auth-sub">Galaxy management. Player data. Live game state.</p>
      </div>

      <div className="admin-auth-panel-right">
        <form className="admin-auth-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-auth-brand">
            <span className="admin-auth-mark" aria-hidden="true">VX</span>
            <div>
              <p className="admin-auth-title">Vexara</p>
              <p className="admin-auth-subtitle">Operations console</p>
            </div>
          </div>

          <label className="admin-auth-field">
            <span className="admin-auth-label">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>

          <label className="admin-auth-field">
            <span className="admin-auth-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="admin-auth-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="admin-auth-submit">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
