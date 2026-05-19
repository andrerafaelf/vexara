'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi, resendVerification as resendVerificationApi } from '../services/api';
import '../styles/Auth.css';

const SCREENSHOTS = ['/vexara-overview.png', '/vexara-troops.png', '/vexara-buildings.png'];

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
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
    setNeedsVerification(false);
    setResendState('idle');
    setSubmitting(true);

    try {
      const response = await loginApi(username.trim(), password);
      login(response.data.token, response.data.user);
      router.push('/');
    } catch (err) {
      const data = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
      if (data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true);
        setError(data.error || 'Please confirm your email before logging in.');
      } else {
        setError(data?.error || 'Unable to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resendState === 'sending') return;
    setResendState('sending');
    try {
      await resendVerificationApi(resendEmail.trim());
      setResendState('sent');
    } catch {
      // Endpoint always returns 200 to avoid leaking which emails exist; treat any failure as a generic error.
      setResendState('sent');
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

          {needsVerification && (
            <div className="auth-resend-block" style={{ marginTop: 16 }}>
              {resendState === 'sent' ? (
                <p className="auth-secondary">
                  If an account exists for that email, we&apos;ve sent a new verification link. Check your inbox.
                </p>
              ) : (
                <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="auth-field">
                    <span className="auth-label">Email</span>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <button type="submit" className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }} disabled={resendState === 'sending'}>
                    {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="auth-secondary" style={{ marginTop: 16 }}>
            <Link href="/forgot-password" className="auth-link">
              Forgot your password?
            </Link>
          </p>

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
