import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { comparePassword, hashPassword } from '../models/User.js';
import * as authService from '../services/authService.js';
import {
	sendAlphaWelcome,
	sendPasswordReset,
	sendVerifyEmail,
	sendWelcome
} from '../services/emailService.js';
import { generateUniqueReferralCode } from '../services/referralService.js';
import { logError, logGameEvent } from '../utils/logger.js';
import {
	detectEmailTypo,
	validateEmail,
	validatePassword,
	validateUsernameForLogin
} from '../utils/validation.js';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateToken(): string {
	// 32 bytes → 64 hex chars (matches schema VarChar(64))
	return randomBytes(32).toString('hex');
}

function normalizeEmail(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().toLowerCase();
	return validateEmail(trimmed) ? trimmed : null;
}

function pickUtm(value: unknown): string | null {
	// UTM parameters are optional and have no strict format, but we want to enforce a reasonable max length
	return typeof value === 'string' && value.length > 0 ? value.slice(0, 64) : null;
}

export async function register(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as {
			username?: string;
			email?: string;
			password?: string;
			referralCode?: string;
			utm_source?: string;
			utm_medium?: string;
			utm_campaign?: string;
		};

		const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
		// Username format/length check
		if (!/^[a-zA-Z0-9_]{3,16}$/.test(rawUsername)) {
			res
				.status(400)
				.json({ error: 'Username must be 3-16 characters: letters, numbers, or underscores.' });
			return;
		}
		// Profanity/inappropriate check
		const { containsBlockedUsername } = await import('../utils/profanity.js');
		if (containsBlockedUsername(rawUsername)) {
			res.status(400).json({ error: 'Username is not allowed due to inappropriate content.' });
			return;
		}
		// Reserved usernames check (optional, for completeness)
		const RESERVED_USERNAMES = new Set([
			'vexara',
			'admin',
			'administrator',
			'moderator',
			'mod',
			'staff',
			'support',
			'root',
			'system',
			'bot',
			'official',
			'help',
			'info',
			'contact',
			'security',
			'null',
			'undefined',
			'anonymous',
			'guest',
			'superuser',
			'sysadmin',
			'webmaster',
			'postmaster',
			'hostmaster',
			'noreply',
			'no-reply'
		]);
		if (RESERVED_USERNAMES.has(rawUsername.toLowerCase())) {
			res.status(400).json({ error: 'Username is reserved or not allowed.' });
			return;
		}

		const email = normalizeEmail(body.email);
		if (!email) {
			const typoHint = typeof body.email === 'string' ? detectEmailTypo(body.email) : null;
			res.status(400).json({ error: typoHint ?? 'Please enter a valid email address.' });
			return;
		}

		if (!validatePassword(body.password)) {
			res.status(400).json({ error: 'Password must be 8-72 characters.' });
			return;
		}

		// Conflicts
		const [usernameClash, emailClash] = await Promise.all([
			prisma.user.findFirst({
				where: { username: { equals: rawUsername, mode: 'insensitive' } },
				select: { id: true }
			}),
			prisma.user.findUnique({ where: { email }, select: { id: true } })
		]);
		if (usernameClash) {
			res.status(409).json({ error: 'That username is already taken.' });
			return;
		}
		if (emailClash) {
			res.status(409).json({ error: 'An account with that email already exists.' });
			return;
		}

		// Disposable / throwaway email domain block.
		// Covers the most common temp-mail providers without maintaining a huge list.
		const DISPOSABLE_EMAIL_DOMAINS = new Set([
			'mailinator.com',
			'guerrillamail.com',
			'guerrillamail.net',
			'guerrillamail.org',
			'guerrillamail.biz',
			'guerrillamail.de',
			'guerrillamail.info',
			'sharklasers.com',
			'spam4.me',
			'yopmail.com',
			'yopmail.fr',
			'cool.fr.nf',
			'jetable.fr.nf',
			'nospam.ze.tc',
			'nomail.xl.cx',
			'mega.zik.dj',
			'speed.1s.fr',
			'courriel.fr.nf',
			'trashmail.com',
			'trashmail.at',
			'trashmail.io',
			'trashmail.me',
			'trashmail.net',
			'dispostable.com',
			'mailnull.com',
			'spamgourmet.com',
			'tempmail.com',
			'temp-mail.org',
			'throwam.com',
			'throwam.net',
			'fakeinbox.com',
			'maildrop.cc',
			'getnada.com',
			'tempinbox.com',
			'throwaway.email',
			'throwam.net',
			'spambox.us',
			'mailevery.com',
			'burnermail.io',
			'mintemail.com',
			'moakt.cc',
			'mohmal.com',
			'owlpic.com',
			'spamgourmet.net',
			'spamgourmet.org',
			'spamoff.de',
			'trbvm.com'
		]);
		const emailDomain = email.split('@')[1]?.toLowerCase() ?? '';
		if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
			res.status(400).json({ error: 'Disposable email addresses are not allowed.' });
			return;
		}

		// Optional referral code
		let referredById: number | null = null;
		if (typeof body.referralCode === 'string' && body.referralCode.trim().length > 0) {
			const code = body.referralCode.trim().toUpperCase();
			const referrer = await prisma.user.findUnique({
				where: { referralCode: code },
				select: { id: true, email: true, createdAt: true }
			});
			if (!referrer) {
				res.status(400).json({ error: 'That referral code is not valid.' });
				return;
			}
			// Cannot self-refer (the referrer's email matches the new account's email).
			if (referrer.email.toLowerCase() === email) {
				res.status(400).json({ error: "You can't use your own referral code." });
				return;
			}
			// Normalized email alias check: strip the `+tag` portion and compare base address.
			// e.g. user+smurf1@gmail.com and user@gmail.com resolve to the same mailbox.
			const stripAlias = (e: string) => {
				const [local, domain] = e.split('@');
				return `${(local ?? '').replace(/\+.*$/, '')}@${domain ?? ''}`.toLowerCase();
			};
			if (stripAlias(referrer.email) === stripAlias(email)) {
				res
					.status(400)
					.json({ error: 'You cannot use a referral code from the same email account.' });
				return;
			}
			// IP-based smurf guard: cap same-IP referrals at 2 to blunt coordinated
			// account farming even when different emails are used. Legitimate players
			// sometimes share a household IP, so a hard limit of 1 would be too strict.
			const registrationIp = req.ip ?? null;
			if (registrationIp) {
				const sameIpReferralCount = await prisma.user.count({
					where: { referredById: referrer.id, registrationIp }
				});
				if (sameIpReferralCount >= 2) {
					// Silently drop the referral link rather than blocking signup —
					// the new player shouldn't be punished, but the referrer gets no credit.
					referredById = null;
				} else {
					referredById = referrer.id;
				}
			} else {
				referredById = referrer.id;
			}
		}

		const hashed = await hashPassword(body.password!);
		const referralCode = await generateUniqueReferralCode();
		const verificationToken = generateToken();
		const verificationExpiry = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

		// 500 VP welcome grant for anyone who registers before 2028-06-30.
		const EARLY_ACCESS_DEADLINE = new Date('2028-07-01T23:59:59Z');
		const signupVp = new Date() <= EARLY_ACCESS_DEADLINE ? 500 : 0;

		const user = await prisma.user.create({
			data: {
				username: rawUsername,
				email,
				password: hashed,
				referralCode,
				referredById,
				registrationIp: req.ip ?? null,
				utmSource: pickUtm(body.utm_source),
				utmMedium: pickUtm(body.utm_medium),
				utmCampaign: pickUtm(body.utm_campaign),
				emailVerificationToken: verificationToken,
				emailVerificationTokenExpiresAt: verificationExpiry,
				avatarKey: 'preset:assaultTrooper',
				vexPoints: signupVp,
			},
			select: { id: true, username: true, email: true }
		});

		sendVerifyEmail(user.email, user.username, verificationToken).catch((err) =>
			console.error('[emailService] sendVerifyEmail failed:', err)
		);

		logGameEvent('user_registered', user.id, null, {
			utmSource: pickUtm(body.utm_source),
			referred: referredById != null
		});

		res.status(201).json({ ok: true, message: 'Check your email to confirm your account.' });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
	try {
		const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
		if (token.length === 0 || token.length > 64) {
			res.status(400).json({ error: 'Invalid verification link.' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { emailVerificationToken: token },
			select: {
				id: true,
				username: true,
				email: true,
				isSupporter: true,
				supporterTier: true,
				isFounder: true,
				referralCode: true,
				emailVerifiedAt: true,
				emailVerificationTokenExpiresAt: true
			}
		});

		if (!user) {
			res.status(400).json({ error: 'Invalid or already-used verification link.' });
			return;
		}

		if (user.emailVerifiedAt) {
			// Already verified, token should have been cleared, but be idempotent.
			res.json({ ok: true, alreadyVerified: true });
			return;
		}

		if (
			!user.emailVerificationTokenExpiresAt ||
			user.emailVerificationTokenExpiresAt.getTime() < Date.now()
		) {
			res.status(400).json({ error: 'This verification link has expired. Request a new one.' });
			return;
		}

		await prisma.user.update({
			where: { id: user.id },
			data: {
				emailVerifiedAt: new Date(),
				emailVerificationToken: null,
				emailVerificationTokenExpiresAt: null
			}
		});

		logGameEvent('user_verified', user.id);

		sendWelcome(user.email, user.username, user.referralCode).catch((err) =>
			console.error('[emailService] sendWelcome failed:', err)
		);

		const authToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
		res.json({
			ok: true,
			token: authToken,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				isSupporter: user.isSupporter,
				supporterTier: user.supporterTier ?? null,
				isFounder: user.isFounder ?? false
			}
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
	try {
		const email = normalizeEmail(req.body?.email);
		// Always return 200 to avoid leaking whether the email exists.
		if (!email) {
			res.json({ ok: true });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { email },
			select: { id: true, username: true, email: true, emailVerifiedAt: true }
		});

		if (user && !user.emailVerifiedAt) {
			const token = generateToken();
			await prisma.user.update({
				where: { id: user.id },
				data: {
					emailVerificationToken: token,
					emailVerificationTokenExpiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
				}
			});
			sendVerifyEmail(user.email, user.username, token).catch((err) =>
				console.error('[emailService] sendVerifyEmail (resend) failed:', err)
			);
		}

		res.json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
	try {
		const email = normalizeEmail(req.body?.email);
		if (!email) {
			res.status(400).json({ error: 'Please enter a valid email address.' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { email },
			select: { id: true, username: true, email: true, emailVerifiedAt: true }
		});

		if (!user) {
			res.status(404).json({ error: 'No account found with that email address.' });
			return;
		}

		const token = generateToken();
		await prisma.user.update({
			where: { id: user.id },
			data: {
				passwordResetToken: token,
				passwordResetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
			}
		});
		sendPasswordReset(user.email, user.username, token).catch((err) =>
			console.error('[emailService] sendPasswordReset failed:', err)
		);

		res.json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
	try {
		const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
		const newPassword = req.body?.newPassword;

		if (token.length === 0 || token.length > 64) {
			res.status(400).json({ error: 'Invalid reset link.' });
			return;
		}
		if (!validatePassword(newPassword)) {
			res.status(400).json({ error: 'Password must be 8-72 characters.' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { passwordResetToken: token },
			select: { id: true, passwordResetTokenExpiresAt: true, emailVerifiedAt: true }
		});

		if (
			!user ||
			!user.passwordResetTokenExpiresAt ||
			user.passwordResetTokenExpiresAt.getTime() < Date.now()
		) {
			res.status(400).json({ error: 'This reset link is invalid or has expired.' });
			return;
		}

		const hashed = await hashPassword(newPassword);
		await prisma.user.update({
			where: { id: user.id },
			data: {
				password: hashed,
				passwordResetToken: null,
				passwordResetTokenExpiresAt: null,
				// Clicking through a password reset link proves the user controls the
				// inbox we sent it to, which is the same proof email verification asks
				// for. Backfill it here so an unverified account isn't left stuck.
				...(user.emailVerifiedAt
					? {}
					: {
							emailVerifiedAt: new Date(),
							emailVerificationToken: null,
							emailVerificationTokenExpiresAt: null
						})
			}
		});

		res.json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function alphaSignupCount(_req: Request, res: Response): Promise<void> {
	try {
		const total = await prisma.alphaSignup.count();
		res.json({ total, limit: 150, remaining: Math.max(0, 150 - total) });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function alphaSignup(req: Request, res: Response): Promise<void> {
	try {
		const rawEmail = (req.body as { email?: string })?.email;
		if (!validateEmail(rawEmail)) {
			const typoHint = typeof rawEmail === 'string' ? detectEmailTypo(rawEmail) : null;
			res.status(400).json({ error: typoHint ?? 'Please enter a valid email address.' });
			return;
		}

		const email = String(rawEmail).trim().toLowerCase();
		const body = req.body as {
			source?: string;
			utm_source?: string;
			utm_medium?: string;
			utm_campaign?: string;
		};
		const source =
			typeof body?.source === 'string' && body.source.length <= 64 ? body.source : 'register';

		const record = await prisma.alphaSignup.upsert({
			where: { email },
			create: {
				email,
				source,
				utmSource: pickUtm(body?.utm_source),
				utmMedium: pickUtm(body?.utm_medium),
				utmCampaign: pickUtm(body?.utm_campaign),
				unsubscribeToken: randomBytes(32).toString('hex')
			},
			update: {},
			select: { createdAt: true, unsubscribedAt: true }
		});

		const isNew = Date.now() - record.createdAt.getTime() < 5_000;
		if (isNew && !record.unsubscribedAt) {
			sendAlphaWelcome(email).catch((err) =>
				console.error('[emailService] alphaWelcome failed:', err)
			);
		}

		res.status(202).json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function login(req: Request, res: Response): Promise<void> {
	try {
		const { username, password } = req.body as { username?: string; password?: string };
		const normalizedUsername = typeof username === 'string' ? username.trim() : '';

		if (
			!validateUsernameForLogin(normalizedUsername) ||
			typeof password !== 'string' ||
			password.length === 0
		) {
			res.status(400).json({ error: 'Invalid credentials' });
			return;
		}

		const user = await authService.findUserByUsername(normalizedUsername);
		if (!user) {
			res.status(400).json({ error: 'Invalid credentials' });
			return;
		}

		const isMatch = await comparePassword(password, user.password);
		if (!isMatch) {
			res.status(400).json({ error: 'Invalid credentials' });
			return;
		}

		if (!user.emailVerifiedAt) {
			res.status(403).json({
				error: 'Please confirm your email before logging in.',
				code: 'EMAIL_NOT_VERIFIED'
			});
			return;
		}

		const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

		if (user.activeGalaxyId) {
			try {
				const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
				void incrementQuestProgress(user.id, user.activeGalaxyId, 'login', 1);
			} catch {}
		}

		res.json({
			token,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				isSupporter: user.isSupporter,
				supporterTier: user.supporterTier ?? null,
				isFounder: user.isFounder ?? false,
				isAlphaFounder: user.isAlphaFounder ?? false
			}
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'authController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
