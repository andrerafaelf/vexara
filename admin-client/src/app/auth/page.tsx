'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function AuthPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (username === 'andre' && password === 'andre') {
      sessionStorage.setItem('admin_basic_auth', btoa('andre:andre'));
      router.replace('/admin');
      return;
    }

    setError('Invalid credentials');
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '360px',
          background: '#0b1733',
          border: '1px solid #1e315f',
          borderRadius: '12px',
          padding: '1.25rem',
          color: '#eaf0ff',
        }}
      >
        <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem' }}>Admin Login</h1>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: '100%', marginBottom: '0.9rem', padding: '0.6rem', borderRadius: '8px' }}
          autoComplete="username"
        />
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: '0.9rem', padding: '0.6rem', borderRadius: '8px' }}
          autoComplete="current-password"
        />
        {error && <p style={{ color: '#ff5e7e', margin: '0 0 0.8rem' }}>{error}</p>}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '0.65rem',
            borderRadius: '8px',
            border: 'none',
            background: '#ff4f72',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Login
        </button>
      </form>
    </main>
  );
}
