'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi, register as registerApi } from '../services/api';
import '../styles/Auth.css';

const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        const response = await loginApi(email, password);
        login(response.data.token, response.data.user);
        router.push('/');
      } else {
        const response = await registerApi(username, email, password);
        login(response.data.token, response.data.user);
        router.push('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Neon Dominion</h1>
        <p className="tagline">Build. Conquer. Dominate.</p>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={!isLogin}
            />
          )}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="error">{error}</div>}

          <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
        </form>

        <button className="toggle-btn" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Need an account? Register' : 'Have an account? Login'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
