'use client';

import '@/styles/Admin.css';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [totp, setTotp] = useState('');
	// Which step the two-step flow is on. 'credentials' collects username +
	// password; 'totp' is revealed only after the server confirms the credentials
	// were accepted AND that 2FA is required for this account.
	const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const totpInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (step === 'totp') {
			totpInputRef.current?.focus();
		}
	}, [step]);

	// Submit credentials (step 1). On success the server either signs us in
	// directly or replies { requiresTotp: true }, which advances us to step 2.
	const submitCredentials = async () => {
		const u = username.trim();
		if (!u || !password) {
			setError('Enter username and password');
			return;
		}
		setSubmitting(true);
		setError('');
		try {
			const res = await fetch(`${ADMIN_API_URL}/auth/login`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: u, password })
			});
			const data = await res.json().catch(() => null);
			if (data?.requiresTotp) {
				setStep('totp');
				return;
			}
			if (!res.ok) {
				setError(data?.error || 'Sign in failed');
				return;
			}
			router.replace('/admin');
		} catch {
			setError('Network error');
		} finally {
			setSubmitting(false);
		}
	};

	// Submit the 2FA code (step 2) together with the already-accepted credentials.
	const submitTotp = async () => {
		const code = totp.replace(/\s+/g, '');
		if (!/^\d{6}$/.test(code)) {
			setError('Enter the 6-digit code from your authenticator');
			return;
		}
		setSubmitting(true);
		setError('');
		try {
			const res = await fetch(`${ADMIN_API_URL}/auth/login`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: username.trim(), password, totp: code })
			});
			const data = await res.json().catch(() => null);
			if (!res.ok || data?.requiresTotp) {
				setError(data?.error || 'Invalid code — try again');
				return;
			}
			router.replace('/admin');
		} catch {
			setError('Network error');
		} finally {
			setSubmitting(false);
		}
	};

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (step === 'credentials') {
			void submitCredentials();
		} else {
			void submitTotp();
		}
	};

	// Return to step 1 to correct the username/password.
	const handleBack = () => {
		setStep('credentials');
		setTotp('');
		setError('');
	};

	return (
		<main className="auth-page">
			<div className="auth-left">
				<p className="auth-eyebrow">Operations console</p>
				<h1 className="auth-headline">Vexara Admin</h1>
				<p className="auth-sub">Galaxy management. Player data. Live game state.</p>
			</div>

			<div className="auth-right">
				<form className="auth-form-inner" onSubmit={handleSubmit} noValidate>
					<div className="auth-brand">
						<div className="auth-mark">
							<img src="/vexara-logo.png" alt="Vexara" />
						</div>
						<div>
							<p className="auth-title-text">Vexara</p>
							<p className="auth-subtitle-text">Operations console</p>
						</div>
					</div>

					{step === 'credentials' ? (
						<>
							<label className="auth-field">
								<span className="auth-label">Username</span>
								<input
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									autoComplete="username"
									autoCapitalize="none"
									spellCheck={false}
								/>
							</label>

							<label className="auth-field">
								<span className="auth-label">Password</span>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									autoComplete="current-password"
								/>
							</label>
						</>
					) : (
						<>
							{/* Step 2: credentials are confirmed — collapse them into a summary
							    with a way back, and ask only for the 2FA code. */}
							<div className="auth-step-account">
								<div className="auth-step-account-info">
									<span className="auth-step-account-label">Signed in as</span>
									<span className="auth-step-account-name">{username.trim()}</span>
								</div>
								<button type="button" className="auth-step-back" onClick={handleBack}>
									Change
								</button>
							</div>

							<label className="auth-field">
								<span className="auth-label">2FA code</span>
								<input
									ref={totpInputRef}
									value={totp}
									onChange={(e) => setTotp(e.target.value)}
									inputMode="numeric"
									autoComplete="one-time-code"
									maxLength={6}
									placeholder="123456"
								/>
								<span className="auth-hint">
									Enter the 6-digit code from your authenticator app to finish signing in.
								</span>
							</label>
						</>
					)}

					{error && (
						<div className="auth-error" role="alert">
							{error}
						</div>
					)}

					<button type="submit" className="auth-submit" disabled={submitting}>
						{submitting
							? 'Signing in…'
							: step === 'credentials'
								? 'Continue'
								: 'Verify & sign in'}
					</button>
				</form>
			</div>
		</main>
	);
}
