'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import '@/styles/Admin.css';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [totp, setTotp] = useState('');
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const u = username.trim();
		const code = totp.replace(/\s+/g, '');
		if (!u || !password) {
			setError('Enter username and password');
			return;
		}
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
				body: JSON.stringify({ username: u, password, totp: code })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
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

					<label className="auth-field">
						<span className="auth-label">2FA code</span>
						<input
							value={totp}
							onChange={(e) => setTotp(e.target.value)}
							inputMode="numeric"
							autoComplete="one-time-code"
							maxLength={6}
							placeholder="123456"
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
			</div>
		</main>
	);
}
