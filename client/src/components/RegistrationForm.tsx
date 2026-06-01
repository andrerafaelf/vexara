'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { register as registerApi, trackReferralClick } from '../services/api';
import PasswordField from './PasswordField';
import '../styles/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const REFERRAL_CODE_RE = /^[A-Z0-9]{4,12}$/;

const KNOWN_EMAIL_DOMAINS = [
	'gmail.com',
	'googlemail.com',
	'hotmail.com',
	'hotmail.co.uk',
	'outlook.com',
	'outlook.co.uk',
	'live.com',
	'msn.com',
	'yahoo.com',
	'yahoo.co.uk',
	'icloud.com',
	'me.com',
	'mac.com',
	'protonmail.com',
	'proton.me',
	'aol.com'
];

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	let prev = new Array(b.length + 1);
	let curr = new Array(b.length + 1);
	for (let j = 0; j <= b.length; j++) prev[j] = j;
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length];
}

function suggestEmailDomain(domain: string): string | null {
	const lower = domain.trim().toLowerCase();
	if (!lower || KNOWN_EMAIL_DOMAINS.includes(lower)) return null;
	let best: { domain: string; distance: number } | null = null;
	for (const known of KNOWN_EMAIL_DOMAINS) {
		if (Math.abs(known.length - lower.length) > 2) continue;
		const distance = levenshtein(lower, known);
		if (distance === 0) return null;
		if (distance <= 2 && (!best || distance < best.distance)) {
			best = { domain: known, distance };
		}
	}
	return best?.domain ?? null;
}

function getEmailError(email: string): string | null {
	if (!EMAIL_RE.test(email.trim().toLowerCase())) return 'Please enter a valid email address.';
	return null;
}

function getEmailTypoWarning(email: string): string | null {
	const normalized = email.trim().toLowerCase();
	const atIdx = normalized.lastIndexOf('@');
	if (atIdx === -1) return null;
	const suggestion = suggestEmailDomain(normalized.slice(atIdx + 1));
	if (!suggestion) return null;
	return `Did you mean ${normalized.slice(0, atIdx + 1)}${suggestion}?`;
}

function getUsernameError(username: string): string | null {
	const trimmed = username.trim();
	if (trimmed.length === 0) return 'Choose a username.';
	if (!USERNAME_RE.test(trimmed))
		return 'Username must be 3-20 characters: letters, numbers, or underscores.';
	return null;
}

function getPasswordError(password: string): string | null {
	if (password.length < 8) return 'Password must be at least 8 characters.';
	if (password.length > 72) return 'Password is too long (max 72 characters).';
	return null;
}

function getReferralError(code: string): string | null {
	if (code.length === 0) return null;
	if (!REFERRAL_CODE_RE.test(code))
		return "Referral code looks invalid. Leave blank if you don't have one.";
	return null;
}

const SPAM_DOMAINS = new Set([
	'hotmail.com',
	'hotmail.co.uk',
	'outlook.com',
	'outlook.co.uk',
	'live.com',
	'msn.com'
]);
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
		try {
			sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl));
		} catch {}
		return fromUrl;
	}
	try {
		const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
		if (raw) return JSON.parse(raw) as Utm;
	} catch {}
	return {};
}

const SCREENSHOTS: { src: string; label: string; caption: string }[] = [
	{
		src: '/vexara-overview.png',
		label: 'Overview',
		caption: 'Your nexus at a glance - resources, buildings, and queues'
	},
	{
		src: '/vexara-starfield.png',
		label: 'Galaxy Map',
		caption: 'A living galaxy shared by real players, running 24/7'
	},
	{
		src: '/vexara-factions.png',
		label: 'Factions',
		caption: 'Join a faction, climb the leaderboard, and wage galaxy-wide wars'
	},
	{
		src: '/vexara-diplomacy.png',
		label: 'Diplomacy',
		caption: 'Sign treaties, declare war, or negotiate vassal terms in real time'
	},
	{
		src: '/vexara-combatreport.png',
		label: 'Combat Report',
		caption: 'Detailed blow-by-blow after every raid, strike, or conquest'
	},
	{
		src: '/vexara-troops.png',
		label: 'Troops',
		caption: 'Twelve unit types - each with attack, defense, speed, and carry'
	},
	{
		src: '/vexara-buildings.png',
		label: 'Buildings',
		caption: 'Eight core buildings drive your economy and military'
	},
	{
		src: '/vexara-market.png',
		label: 'Market',
		caption: 'Trade resources with other players at dynamic exchange rates'
	},
	{
		src: '/vexara-profile.png',
		label: 'Profile',
		caption: 'Track your stats, badges, and founder status'
	}
];

const RegistrationForm: React.FC = () => {
	const [username, setUsername] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [referralCode, setReferralCode] = useState('');
	const [error, setError] = useState('');
	const [emailWarning, setEmailWarning] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [success, setSuccess] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [prevIndex, setPrevIndex] = useState<number | null>(null);
	const [transitioning, setTransitioning] = useState(false);
	const [paused, setPaused] = useState(false);
	const { isAuthenticated } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (isAuthenticated) {
			router.replace('/play');
		}
	}, [isAuthenticated, router]);

	// Pre-fill referral code from ?ref= query param so referrers can share links.
	// Also fire a click event so referrers can see how many users their link brought in.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const ref = new URLSearchParams(window.location.search).get('ref');
		if (ref) {
			const code = ref.toUpperCase().slice(0, 12);
			setReferralCode(code);
			void trackReferralClick(code).catch(() => {});
		}
	}, []);

	const touchStartX = useRef<number | null>(null);

	const handleTouchStart = (e: React.TouchEvent) => {
		touchStartX.current = e.touches[0].clientX;
	};

	const handleTouchEnd = (e: React.TouchEvent) => {
		if (touchStartX.current === null) return;
		const delta = e.changedTouches[0].clientX - touchStartX.current;
		touchStartX.current = null;
		if (Math.abs(delta) < 40) return;
		if (delta < 0) goTo((activeIndex + 1) % SCREENSHOTS.length);
		else goTo((activeIndex - 1 + SCREENSHOTS.length) % SCREENSHOTS.length);
	};

	const goTo = (idx: number) => {
		if (transitioning || idx === activeIndex) return;
		setPrevIndex(activeIndex);
		setTransitioning(true);
		setActiveIndex(idx);
		setTimeout(() => {
			setPrevIndex(null);
			setTransitioning(false);
		}, 600);
	};

	useEffect(() => {
		if (paused) return;
		const interval = setInterval(() => {
			goTo((activeIndex + 1) % SCREENSHOTS.length);
		}, 5000);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeIndex, paused, transitioning]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (submitting) return;
		setError('');

		const usernameTrimmed = username.trim();
		const emailNormalized = email.trim().toLowerCase();
		const referralNormalized = referralCode.trim().toUpperCase();

		const usernameError = getUsernameError(usernameTrimmed);
		if (usernameError) {
			setError(usernameError);
			return;
		}
		const emailError = getEmailError(emailNormalized);
		if (emailError) {
			setError(emailError);
			return;
		}
		const typoWarning = getEmailTypoWarning(emailNormalized);
		if (typoWarning && !emailWarning) {
			setEmailWarning(typoWarning);
			return;
		}
		setEmailWarning('');
		const passwordError = getPasswordError(password);
		if (passwordError) {
			setError(passwordError);
			return;
		}
		if (password !== confirmPassword) {
			setError('Passwords do not match.');
			return;
		}
		const referralError = getReferralError(referralNormalized);
		if (referralError) {
			setError(referralError);
			return;
		}

		setSubmitting(true);
		try {
			const utm = captureUtm();
			await registerApi({
				username: usernameTrimmed,
				email: emailNormalized,
				password,
				...(referralNormalized.length > 0 ? { referralCode: referralNormalized } : {}),
				...utm
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
				{/* Screenshot carousel - images shown in full, no cropping */}
				<div
					className="lp-carousel"
					onMouseEnter={() => setPaused(true)}
					onMouseLeave={() => setPaused(false)}
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
				>
					<div className="lp-carousel-track">
						{SCREENSHOTS.map((s, i) => (
							<div
								key={s.src}
								className={`lp-carousel-slide${i === activeIndex ? ' is-active' : ''}${i === prevIndex ? ' is-leaving' : ''}`}
								aria-hidden={i !== activeIndex}
							>
								<img src={s.src} alt={s.caption} className="lp-carousel-img" draggable={false} />
							</div>
						))}
					</div>

					<div className="carousel-label" key={activeIndex}>
						<span className="carousel-label-dot" />
						{SCREENSHOTS[activeIndex].label}
					</div>

					<button
						className="lp-carousel-arrow lp-carousel-arrow-prev"
						onClick={() => goTo((activeIndex - 1 + SCREENSHOTS.length) % SCREENSHOTS.length)}
						aria-label="Previous screenshot"
					>
						<svg
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M10 12L6 8l4-4" />
						</svg>
					</button>
					<button
						className="lp-carousel-arrow lp-carousel-arrow-next"
						onClick={() => goTo((activeIndex + 1) % SCREENSHOTS.length)}
						aria-label="Next screenshot"
					>
						<svg
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M6 4l4 4-4 4" />
						</svg>
					</button>
				</div>

				<div className="auth-panel-left-copy">
					<p className="auth-panel-eyebrow">Live galaxy</p>
					<h2 className="auth-panel-headline">
						Build.
						<br />
						Conquer.
						<br />
						Dominate.
					</h2>
					<p className="auth-panel-sub">
						Browser-based 4X strategy. A living galaxy shared by real players, running 24/7 with no
						resets and no pay-to-win.
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

					<div className="carousel-dots" role="tablist" aria-label="Screenshot navigation">
						{SCREENSHOTS.map((s, i) => (
							<button
								key={s.src}
								role="tab"
								aria-selected={i === activeIndex}
								aria-label={s.label}
								className={`carousel-dot${i === activeIndex ? ' is-active' : ''}`}
								onClick={() => goTo(i)}
							/>
						))}
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
								We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to activate
								your account, then sign in.
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

								<PasswordField
									label="Password"
									value={password}
									onChange={setPassword}
									placeholder="At least 8 characters"
									autoComplete="new-password"
									minLength={8}
									maxLength={72}
									required
									ariaInvalid={Boolean(error)}
								/>

								<PasswordField
									label="Confirm password"
									value={confirmPassword}
									onChange={setConfirmPassword}
									placeholder="Repeat your password"
									autoComplete="new-password"
									minLength={8}
									maxLength={72}
									required
									ariaInvalid={Boolean(error)}
								/>

								<label className="auth-field">
									<span className="auth-label">
										Referral code{' '}
										<span style={{ color: 'var(--text-muted, #8a90a0)', fontWeight: 'normal' }}>
											(optional)
										</span>
									</span>
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

								{emailWarning && (
									<div className="auth-warning" role="alert">
										{emailWarning} Submit again to continue anyway.
									</div>
								)}

								<button type="submit" className="auth-submit" disabled={submitting}>
									{submitting ? 'Creating account…' : 'Create account'}
								</button>

								<p className="auth-tos-note">
									By creating an account you agree to the{' '}
									<Link href="/terms" className="auth-link">
										Terms of Service
									</Link>{' '}
									and{' '}
									<Link href="/privacy" className="auth-link">
										Privacy Policy
									</Link>
									.
								</p>
							</form>

							<p className="auth-secondary" style={{ marginTop: 'var(--space-6)' }}>
								Already have an account?{' '}
								<Link href="/login" className="auth-link">
									Sign in
								</Link>
							</p>

							<p
								className="auth-secondary auth-secondary-quiet"
								style={{ marginTop: 'var(--space-3)' }}
							>
								Want to know more first?{' '}
								<Link href="/codex" className="auth-link">
									Read the codex
								</Link>{' '}
								or{' '}
								<Link href="/" className="auth-link">
									see the overview
								</Link>
								.
							</p>
						</>
					)}
				</div>

				{/* Mobile-only screenshot carousel - below the form, hidden on desktop */}
				<div
					className="mobile-carousel"
					onMouseEnter={() => setPaused(true)}
					onMouseLeave={() => setPaused(false)}
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
				>
					{SCREENSHOTS.map((s, i) => (
						<div
							key={s.src}
							className={`lp-carousel-slide${i === activeIndex ? ' is-active' : ''}${i === prevIndex ? ' is-leaving' : ''}`}
							aria-hidden={i !== activeIndex}
						>
							<img src={s.src} alt={s.caption} className="lp-carousel-img" draggable={false} />
						</div>
					))}
					<div className="mobile-carousel-overlay" />
					<div className="carousel-label" key={activeIndex}>
						<span className="carousel-label-dot" />
						{SCREENSHOTS[activeIndex].label}
					</div>
					<div className="mobile-carousel-dots" role="tablist" aria-label="Screenshot navigation">
						{SCREENSHOTS.map((s, i) => (
							<button
								key={s.src}
								role="tab"
								aria-selected={i === activeIndex}
								aria-label={s.label}
								className={`carousel-dot${i === activeIndex ? ' is-active' : ''}`}
								onClick={() => goTo(i)}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default RegistrationForm;
