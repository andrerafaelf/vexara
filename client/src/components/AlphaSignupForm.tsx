'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';
import { requestAlphaAccess } from '../services/api';
import '../styles/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AlphaSignupForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      await requestAlphaAccess(normalized);
      setSuccess(true);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <Link href="/" className="auth-logo-link" aria-label="Vexara home">
          <Image
            src="/vexara-logo.png"
            alt="Vexara"
            width={96}
            height={96}
            className="auth-logo"
            priority
          />
        </Link>
        <h1>Join the alpha</h1>
        <p className="tagline">Be among the first commanders.</p>

        {success ? (
          <div className="auth-success" role="status">
            <p>
              You&apos;re on the list. We&apos;ll email <strong>{email.trim()}</strong> as soon as alpha
              access opens.
            </p>
            <Link href="/login" className="auth-link auth-link-block">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="auth-description">
              Vexara is in closed alpha. Drop your email and we&apos;ll send your invite when the next
              wave opens.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  type="email"
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
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

              <button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Request access'}
              </button>
            </form>

            <p className="auth-secondary">
              Already have an account?{' '}
              <Link href="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AlphaSignupForm;
