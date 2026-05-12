import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { comparePassword } from '../models/User.js';
import * as authService from '../services/authService.js';
import { validateUsername } from '../utils/validation.js';

export async function register(_req: Request, res: Response): Promise<void> {
  res.status(403).json({ error: 'Registration is disabled' });
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
