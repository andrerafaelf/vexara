'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { requestPasswordReset } from '../../services/api';
import '../../styles/Auth.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-panel-right" style={{ width: '100%' }}>
        <div className="auth-form-wrap">
          <Link href="/" className="auth-wordmark" aria-label="Vexara home">
            <Image src="/vexara-logo.png" alt="" width={32} height={32} className="auth-wordmark-logo" priority />
            <span className="auth-wordmark-name">Vexara</span>
          </Link>

          {submitted ? (
            <>
              <h1 className="auth-form-heading">Check your email</h1>
              <p className="auth-form-subheading">
                If an account exists for <strong>{email.trim()}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <p className="auth-secondary" style={{ marginTop: 16 }}>
                <Link href="/login" className="auth-link">Back to sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="auth-form-heading">Reset your password</h1>
              <p className="auth-form-subheading">Enter your email and we&apos;ll send a reset link.</p>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <label className="auth-field">
                  <span className="auth-label">Email</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    spellCheck={false}
                    required
                  />
                </label>

                {error && <p className="auth-error" style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0 0 8px' }}>{error}</p>}

                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="auth-secondary" style={{ marginTop: 16 }}>
                <Link href="/login" className="auth-link">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
