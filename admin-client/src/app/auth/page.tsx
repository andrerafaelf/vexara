'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import '@/styles/Admin.css';

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		const u = username.trim();
		if (!u || !password) {
			setError('Enter username and password');
			return;
		}
		sessionStorage.setItem('admin_basic_auth', btoa(`${u}:${password}`));
		router.replace('/admin');
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

					{error && (
						<div className="auth-error" role="alert">
							{error}
						</div>
					)}

					<button type="submit" className="auth-submit">
						Sign in
					</button>
				</form>
			</div>
		</main>
	);
}
