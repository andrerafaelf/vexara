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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
    } catch {
      // Endpoint always returns 200; even if it didn't, we show the same message to avoid leaking.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
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
                    onChange={(e) => setEmail(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    spellCheck={false}
                    required
                  />
                </label>

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
