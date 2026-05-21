'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi, resendVerification as resendVerificationApi } from '../services/api';
import PasswordField from './PasswordField';
import '../styles/Auth.css';

const SCREENSHOTS: { src: string; label: string }[] = [
  { src: '/vexara-overview.png',     label: 'Overview' },
  { src: '/vexara-starfield.png',    label: 'Galaxy Map' },
  { src: '/vexara-factions.png',     label: 'Factions' },
  { src: '/vexara-diplomacy.png',    label: 'Diplomacy' },
  { src: '/vexara-combatreport.png', label: 'Combat Report' },
  { src: '/vexara-troops.png',       label: 'Troops' },
  { src: '/vexara-buildings.png',    label: 'Buildings' },
  { src: '/vexara-market.png',       label: 'Market' },
  { src: '/vexara-profile.png',      label: 'Profile' },
];

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  const goTo = (idx: number) => {
    if (transitioning || idx === activeIndex) return;
    setPrevIndex(activeIndex);
    setTransitioning(true);
    setActiveIndex(idx);
    setTimeout(() => { setPrevIndex(null); setTransitioning(false); }, 600);
  };

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      goTo((activeIndex + 1) % SCREENSHOTS.length);
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, paused, transitioning]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) goTo((activeIndex + 1) % SCREENSHOTS.length);
    else goTo((activeIndex - 1 + SCREENSHOTS.length) % SCREENSHOTS.length);
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

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
          className="lp-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="lp-carousel-track">
            {SCREENSHOTS.map((s, i) => (
              <div
                key={s.src}
                className={`lp-carousel-slide${i === activeIndex ? ' is-active' : ''}${i === prevIndex ? ' is-leaving' : ''}`}
                aria-hidden={i !== activeIndex}
              >
                <img src={s.src} alt={s.label} className="lp-carousel-img" draggable={false} />
              </div>
            ))}
          </div>
          <div className="carousel-label" key={activeIndex}>
            <span className="carousel-label-dot" />
            {SCREENSHOTS[activeIndex].label}
          </div>
          <button className="lp-carousel-arrow lp-carousel-arrow-prev" onClick={() => goTo((activeIndex - 1 + SCREENSHOTS.length) % SCREENSHOTS.length)} aria-label="Previous">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 12L6 8l4-4"/></svg>
          </button>
          <button className="lp-carousel-arrow lp-carousel-arrow-next" onClick={() => goTo((activeIndex + 1) % SCREENSHOTS.length)} aria-label="Next">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>
          </button>
        </div>

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
          <div className="carousel-dots" role="tablist" aria-label="Screenshot navigation">
            {SCREENSHOTS.map((s, i) => (
              <button
                key={s.src}
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={s.label}
                className={`carousel-dot${i === activeIndex ? ' is-active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
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

            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              ariaInvalid={Boolean(error)}
            />


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
              Create one
            </Link>
          </p>

          <p className="auth-secondary auth-support">
            Vexara runs on a small server.{' '}
            <a
              href="https://ko-fi.com/andrerfferreira"
              target="_blank"
              rel="noopener noreferrer"
              className="auth-link"
            >
              Support the project
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
