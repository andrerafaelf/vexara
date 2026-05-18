import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { comparePassword } from '../models/User.js';
import * as authService from '../services/authService.js';
import { sendAlphaWelcome } from '../services/emailService.js';
import { detectEmailTypo, validateEmail, validateUsername } from '../utils/validation.js';

export async function register(_req: Request, res: Response): Promise<void> {
  // TODO(release): enable public registration. Required body fields:
  //   { username, email, password, referralCode }
  // - referralCode is MANDATORY (the only way to be referred is at signup)
  // - Look up the referrer via prisma.user.findUnique({ where: { referralCode } })
  // - Reject if: code is missing/invalid, referrer.id === self (cannot happen pre-create, but guard
  //   anyway), or req.ip matches referrer.registrationIp (same-network multi-account abuse)
  // - In a single transaction: hash password, generate the new user's own referralCode via
  //   referralService.generateUniqueReferralCode(), then prisma.user.create with
  //   { username, email, password, referredById, registrationIp: req.ip, referralCode }
  res.status(403).json({ error: 'Registration is disabled' });
}

export async function alphaSignupCount(_req: Request, res: Response): Promise<void> {
  try {
    const total = await prisma.alphaSignup.count();
    res.json({ total, limit: 150, remaining: Math.max(0, 150 - total) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function alphaSignup(req: Request, res: Response): Promise<void> {
  try {
    const rawEmail = (req.body as { email?: string })?.email;
    // Validate email format first to provide better feedback and avoid unnecessary DB operations
    if (!validateEmail(rawEmail)) {
      const typoHint = typeof rawEmail === 'string' ? detectEmailTypo(rawEmail) : null;
      res.status(400).json({ error: typoHint ?? 'Please enter a valid email address.' });
      return;
    }

    const email = String(rawEmail).trim().toLowerCase();
    const rawSource = (req.body as { source?: string })?.source;
    const source = typeof rawSource === 'string' && rawSource.length <= 64 ? rawSource : 'register';

    const record = await prisma.alphaSignup.upsert({
      where: { email },
      create: { email, source },
      update: {},
      select: { createdAt: true },
    });

    // Only send welcome email on first signup (createdAt within last 5s means just created)
    const isNew = Date.now() - record.createdAt.getTime() < 5_000;
    if (isNew) {
      sendAlphaWelcome(email).catch((err) => console.error('[emailService] alphaWelcome failed:', err));
    }

    res.status(202).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';

    if (!validateUsername(normalizedUsername) || typeof password !== 'string' || password.length === 0) {
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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
