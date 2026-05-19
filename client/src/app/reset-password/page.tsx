'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { resetPassword as resetPasswordApi } from '../../services/api';
import '../../styles/Auth.css';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const validate = (): string | null => {
    if (!token) return 'This link is missing a reset token.';
    if (password.length < 8 || password.length > 72) return 'Password must be 8-72 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordApi(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'We could not reset your password. The link may have expired.';
      setError(message);
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

          {done ? (
            <>
              <h1 className="auth-form-heading">Password updated</h1>
              <p className="auth-form-subheading">Redirecting you to sign in.</p>
            </>
          ) : (
            <>
              <h1 className="auth-form-heading">Choose a new password</h1>
              <p className="auth-form-subheading">8 to 72 characters.</p>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <label className="auth-field">
                  <span className="auth-label">New password</span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="new-password"
                    spellCheck={false}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-label">Confirm password</span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="new-password"
                    spellCheck={false}
                    required
                  />
                </label>

                {error && <div className="auth-error" role="alert">{error}</div>}

                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Update password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
