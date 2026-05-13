'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../services/api';
import '../styles/Auth.css';

const Auth: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await loginApi(username, password);
      login(response.data.token, response.data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Vexara</h1>
        <p className="tagline">Build. Conquer. Dominate.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />

          {error && <div className="error">{error}</div>}

          <button type="submit">Login</button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
