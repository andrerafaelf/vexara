'use client';

// NOT MOUNTED YET. The /register page still renders AlphaSignupForm.
// On launch day, swap the import in client/src/app/register/page.tsx:
//   import RegistrationForm from '@/components/RegistrationForm';
//   return <RegistrationForm />;
// AND flip the server route in server/routes/auth.ts from `register` to `registerReal`.

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { registerReal as registerApi } from '../services/api';
import '../styles/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const REFERRAL_CODE_RE = /^[A-Z0-9]{4,12}$/;

const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cpm': 'gmail.com',
  'gmail.ocm': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com', 'hotmail.cm': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com', 'yahoo.cm': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com', 'outlook.cm': 'outlook.com', 'outlook.con': 'outlook.com',
};

function getEmailError(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return 'Please enter a valid email address.';
  const atIdx = normalized.lastIndexOf('@');
  const domain = normalized.slice(atIdx + 1);
  const correction = DOMAIN_TYPOS[domain];
  if (correction) return `Did you mean ${normalized.slice(0, atIdx + 1)}${correction}?`;
  return null;
}

function getUsernameError(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length === 0) return 'Choose a username.';
  if (!USERNAME_RE.test(trimmed)) return 'Username must be 3-20 characters: letters, numbers, or underscores.';
  return null;
}

function getPasswordError(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password is too long (max 72 characters).';
  return null;
}

function getReferralError(code: string): string | null {
  if (code.length === 0) return null;
  if (!REFERRAL_CODE_RE.test(code)) return 'Referral code looks invalid. Leave blank if you don\'t have one.';
  return null;
}

const SPAM_DOMAINS = new Set(['hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com']);
function isSpamRiskDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return SPAM_DOMAINS.has(domain);
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
type UtmKey = (typeof UTM_KEYS)[number];
type Utm = Partial<Record<UtmKey, string>>;
const UTM_STORAGE_KEY = 'vexara_utm';

function captureUtm(): Utm {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Utm = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) fromUrl[key] = v.slice(0, 64);
  }
  if (Object.keys(fromUrl).length > 0) {
    try { sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl)); } catch {}
    return fromUrl;
  }
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Utm;
  } catch {}
  return {};
}

const SCREENSHOTS = ['/vexara-overview.png', '/vexara-troops.png', '/vexara-buildings.png'];

const RegistrationForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [zooming, setZooming] = useState(true);
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

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

  // Pre-fill referral code from ?ref= query param so referrers can share links.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setReferralCode(ref.toUpperCase().slice(0, 12));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const usernameTrimmed = username.trim();
    const emailNormalized = email.trim().toLowerCase();
    const referralNormalized = referralCode.trim().toUpperCase();

    const usernameError = getUsernameError(usernameTrimmed);
    if (usernameError) { setError(usernameError); return; }
    const emailError = getEmailError(emailNormalized);
    if (emailError) { setError(emailError); return; }
    const passwordError = getPasswordError(password);
    if (passwordError) { setError(passwordError); return; }
    const referralError = getReferralError(referralNormalized);
    if (referralError) { setError(referralError); return; }

    setSubmitting(true);
    try {
      const utm = captureUtm();
      await registerApi({
        username: usernameTrimmed,
        email: emailNormalized,
        password,
        ...(referralNormalized.length > 0 ? { referralCode: referralNormalized } : {}),
        ...utm,
      });
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
      <div className="auth-panel-left">
        <div
          className={`auth-panel-left-bg${fading ? ' fading' : ''}${zooming ? ' zooming' : ''}`}
          style={{ backgroundImage: `url(${SCREENSHOTS[bgIndex]})` }}
        />
        <div className="auth-panel-left-overlay" />
        <div className="auth-panel-left-copy">
          <p className="auth-panel-eyebrow">Live galaxy</p>
          <h2 className="auth-panel-headline">
            Build.<br />Conquer.<br />Dominate.
          </h2>
          <p className="auth-panel-sub">
            Browser-based 4X strategy. A living galaxy shared by real players,
            running 24/7 with no resets and no pay-to-win.
          </p>
          <div className="auth-panel-stats">
            <div className="auth-panel-stat">
              <span className="auth-panel-stat-value">12</span>
              <span className="auth-panel-stat-label">Unit types</span>
            </div>
            <div className="auth-panel-stat">
              <span className="auth-panel-stat-value">3</span>
              <span className="auth-panel-stat-label">Resources</span>
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

          {success ? (
            <>
              <h1 className="auth-form-heading">Check your email</h1>
              <p className="auth-form-subheading">
                We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to activate your account, then sign in.
              </p>
              <div className="auth-success" role="status">
                {isSpamRiskDomain(email) && (
                  <p className="auth-success-note">
                    Hotmail and Outlook sometimes filter automated emails. If you don&apos;t see it,
                    check your <strong>Junk</strong> folder.
                  </p>
                )}
                <Link href="/login" className="auth-link auth-link-block">
                  Back to sign in
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-form-heading">Create your account</h1>
              <p className="auth-form-subheading">
                Pick a username, claim your nexus, command your first fleet.
              </p>

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
                    maxLength={20}
                    required
                    aria-invalid={Boolean(error)}
                  />
                </label>

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

                <label className="auth-field">
                  <span className="auth-label">Password</span>
                  <input
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="new-password"
                    spellCheck={false}
                    minLength={8}
                    maxLength={72}
                    required
                    aria-invalid={Boolean(error)}
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-label">Referral code <span style={{ color: 'var(--text-muted, #8a90a0)', fontWeight: 'normal' }}>(optional)</span></span>
                  <input
                    type="text"
                    placeholder="From a friend"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={12}
                  />
                </label>

                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p className="auth-secondary" style={{ marginTop: 16 }}>
                Already have an account?{' '}
                <Link href="/login" className="auth-link">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationForm;
