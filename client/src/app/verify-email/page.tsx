'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { verifyEmail as verifyEmailApi } from '../../services/api';
import '../../styles/Auth.css';

type Status = 'pending' | 'success' | 'already' | 'error';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');
  const [errorMessage, setErrorMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setStatus('error');
      setErrorMessage('This link is missing a verification token.');
      return;
    }

    (async () => {
      try {
        const res = await verifyEmailApi(token);
        setStatus(res.data?.alreadyVerified ? 'already' : 'success');
      } catch (err) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'We could not verify this link.';
        setErrorMessage(message);
        setStatus('error');
      }
    })();
  }, [token]);

  return (
    <div className="auth-container">
      <div className="auth-panel-right" style={{ width: '100%' }}>
        <div className="auth-form-wrap">
          <Link href="/" className="auth-wordmark" aria-label="Vexara home">
            <Image src="/vexara-logo.png" alt="" width={32} height={32} className="auth-wordmark-logo" priority />
            <span className="auth-wordmark-name">Vexara</span>
          </Link>

          {status === 'pending' && (
            <>
              <h1 className="auth-form-heading">Verifying your email</h1>
              <p className="auth-form-subheading">One moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <h1 className="auth-form-heading">Email confirmed</h1>
              <p className="auth-form-subheading">Your account is active. You can sign in now.</p>
              <Link href="/login" className="auth-submit" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}>
                Sign in
              </Link>
            </>
          )}

          {status === 'already' && (
            <>
              <h1 className="auth-form-heading">Already verified</h1>
              <p className="auth-form-subheading">This email was already confirmed. You can sign in.</p>
              <Link href="/login" className="auth-submit" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}>
                Sign in
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="auth-form-heading">Verification failed</h1>
              <div className="auth-error" role="alert" style={{ marginTop: 12 }}>{errorMessage}</div>
              <p className="auth-secondary" style={{ marginTop: 16 }}>
                Need a new link?{' '}
                <Link href="/login" className="auth-link">Sign in</Link>{' '}
                and we&apos;ll prompt to resend it.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
