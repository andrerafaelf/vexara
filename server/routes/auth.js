import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { comparePassword } from '../models/User.js';
import { validateUsername } from '../utils/validation.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  return res.status(403).json({ error: 'Registration is disabled' });

  /*
  try {
    const { username, email, password } = req.body;
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!validateUsername(normalizedUsername)) {
      return res
        .status(400)
        .json({ error: 'Username must be 3-20 characters and use letters, numbers, or underscores' });
    }

    if (!validateEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be 8-72 characters' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username: normalizedUsername }] },
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await hashPassword(password);

    // Create user and starting nexus in a transaction
    const { user, nexus } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: normalizedUsername,
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      const newNexus = await tx.nexus.create({
        data: {
          name: `${username}'s Nexus`,
          ownerId: newUser.id,
          x: Math.floor(Math.random() * 25),
          y: Math.floor(Math.random() * 25),
          commandCore: 0,
          troopFabricator: 0,
          lifeSupport: 1,
          storageVault: 1,
          biomassFarm: 1,
          alloyForge: 1,
          oreExtractor: 1,
          shieldGrid: 0,
        },
      });

      return { user: newUser, nexus: newNexus };
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
  */
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';

    if (!validateUsername(normalizedUsername) || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
