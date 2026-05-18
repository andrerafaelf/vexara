'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../services/api';
import '../styles/Auth.css';

const SCREENSHOTS = ['/vexara-overview.png', '/vexara-troops.png', '/vexara-buildings.png'];

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [zooming, setZooming] = useState(true);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setZooming(false);
      setTimeout(() => {
        setBgIndex(i => (i + 1) % SCREENSHOTS.length);
        setFading(false);
        setZooming(true);
      }, 800);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const response = await loginApi(username.trim(), password);
      login(response.data.token, response.data.user);
      router.push('/');
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-panel-left">
        <div
          className={`auth-panel-left-bg${fading ? ' fading' : ''}${zooming ? ' zooming' : ''}`}
          style={{ backgroundImage: `url(${SCREENSHOTS[bgIndex]})` }}
        />
        <div className="auth-panel-left-overlay" />
        <div className="auth-panel-left-copy">
          <p className="auth-panel-eyebrow">Live galaxy</p>
          <h2 className="auth-panel-headline">
            A persistent world.<br />Real opponents.<br />Every galaxy ends.
          </h2>
          <p className="auth-panel-sub">
            Build a nexus, control three resources, train twelve unit types,
            and conquer real players in a galaxy that never stops running.
          </p>
          <div className="auth-panel-stats">
            <div className="auth-panel-stat">
              <span className="auth-panel-stat-value">12</span>
              <span className="auth-panel-stat-label">Unit types</span>
            </div>
            <div className="auth-panel-stat">
              <span className="auth-panel-stat-value">8</span>
              <span className="auth-panel-stat-label">Buildings</span>
            </div>
            <div className="auth-panel-stat">
              <span className="auth-panel-stat-value">24/7</span>
              <span className="auth-panel-stat-label">Live economy</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-form-wrap">
          <Link href="/" className="auth-wordmark" aria-label="Vexara home">
            <Image
              src="/vexara-logo.png"
              alt=""
              width={32}
              height={32}
              className="auth-wordmark-logo"
              priority
            />
            <span className="auth-wordmark-name">Vexara</span>
          </Link>

          <h1 className="auth-form-heading">Sign in</h1>
          <p className="auth-form-subheading">Continue to your nexus.</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              <span className="auth-label">Username</span>
              <input
                type="text"
                placeholder="commander"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                spellCheck={false}
                required
                aria-invalid={Boolean(error)}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="current-password"
                spellCheck={false}
                required
                aria-invalid={Boolean(error)}
              />
            </label>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-secondary">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="auth-link">
              Request alpha access
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
