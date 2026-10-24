'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { resendVerification, verifyEmail as verifyEmailApi } from '../../services/api';
import '../../styles/Auth.css';

// 'ready' waits for an explicit click: mail clients and link scanners prefetch
// links, and a prefetch must not consume the one-time token.
type Status = 'ready' | 'confirming' | 'success' | 'already' | 'used' | 'error';

function VerifyEmailInner() {
	const params = useSearchParams();
	const router = useRouter();
	const { login } = useAuth();
	const token = params.get('token') ?? '';
	const [status, setStatus] = useState<Status>(token ? 'ready' : 'error');
	const [errorMessage, setErrorMessage] = useState(
		token ? '' : 'This link is missing a verification token.'
	);
	const [resendEmail, setResendEmail] = useState('');
	const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
	const [resendError, setResendError] = useState('');

	async function handleConfirm() {
		if (status === 'confirming') return;
		setStatus('confirming');
		try {
			const res = await verifyEmailApi(token);
			if (res.data?.alreadyVerified) {
				setStatus('already');
				return;
			}
			if (res.data?.token && res.data?.user) {
				login(res.data.token, res.data.user);
				setStatus('success');
				// Brief pause so the user sees the confirmation before the redirect.
				setTimeout(() => router.replace('/play'), 1200);
				return;
			}
			setStatus('success');
		} catch (err) {
			const e = err as { response?: { status?: number; data?: { error?: string } } };
			if (e?.response?.status === 400) {
				setStatus('used');
				return;
			}
			setErrorMessage(e?.response?.data?.error || 'We could not verify this link.');
			setStatus('error');
		}
	}

	async function handleResend(e: React.FormEvent) {
		e.preventDefault();
		if (resendState === 'sending' || !resendEmail.trim()) return;
		setResendState('sending');
		setResendError('');
		try {
			await resendVerification(resendEmail.trim().toLowerCase());
			setResendState('sent');
		} catch (err) {
			setResendError(
				(err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
					'Could not resend the email. Please try again shortly.'
			);
			setResendState('error');
		}
	}

	const resendBlock = (
		<div style={{ marginTop: 16 }}>
			{resendState === 'sent' ? (
				<div className="auth-success" role="status">
					<p className="auth-success-note">
						If that address has an unconfirmed account, a new link is on its way.
					</p>
				</div>
			) : (
				<form className="auth-form" onSubmit={handleResend}>
					<label className="auth-field">
						<span className="auth-label">Need a new link? Enter your email</span>
						<input
							type="email"
							placeholder="you@example.com"
							value={resendEmail}
							onChange={(e) => setResendEmail(e.target.value)}
							autoComplete="email"
							required
						/>
					</label>
					{resendState === 'error' && (
						<div className="auth-error" role="alert">
							{resendError}
						</div>
					)}
					<button
						type="submit"
						className="auth-submit"
						disabled={resendState === 'sending' || !resendEmail.trim()}
					>
						{resendState === 'sending' ? 'Sending...' : 'Resend verification email'}
					</button>
				</form>
			)}
		</div>
	);

	const signInButton = (
		<Link
			href="/login"
			className="auth-submit"
			style={{
				display: 'inline-block',
				textAlign: 'center',
				textDecoration: 'none',
				marginTop: 16
			}}
		>
			Sign in
		</Link>
	);

	return (
		<div className="auth-container">
			<div className="auth-panel-right" style={{ width: '100%' }}>
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

					{(status === 'ready' || status === 'confirming') && (
						<>
							<h1 className="auth-form-heading">Confirm your email</h1>
							<p className="auth-form-subheading">
								One last step. Confirm your email to activate your account.
							</p>
							<button
								type="button"
								className="auth-submit"
								onClick={handleConfirm}
								disabled={status === 'confirming'}
								style={{ marginTop: 16 }}
							>
								{status === 'confirming' ? 'Confirming...' : 'Confirm my email'}
							</button>
						</>
					)}

					{status === 'success' && (
						<>
							<h1 className="auth-form-heading">Email confirmed</h1>
							<p className="auth-form-subheading">Signing you in…</p>
						</>
					)}

					{status === 'already' && (
						<>
							<h1 className="auth-form-heading">Already verified</h1>
							<p className="auth-form-subheading">
								This email was already confirmed. You can sign in.
							</p>
							{signInButton}
						</>
					)}

					{status === 'used' && (
						<>
							<h1 className="auth-form-heading">Link already used</h1>
							<p className="auth-form-subheading">
								This link was already used or has expired. If you already confirmed, just sign in.
							</p>
							{signInButton}
							{resendBlock}
						</>
					)}

					{status === 'error' && (
						<>
							<h1 className="auth-form-heading">Verification failed</h1>
							<div className="auth-error" role="alert" style={{ marginTop: 12 }}>
								{errorMessage}
							</div>
							{resendBlock}
							<p className="auth-secondary" style={{ marginTop: 16 }}>
								Already confirmed?{' '}
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
}

export default function VerifyEmailPage() {
	return (
		<Suspense fallback={null}>
			<VerifyEmailInner />
		</Suspense>
	);
}
