import type { Response, NextFunction } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import {
	processAndUploadAvatar,
	deleteAvatarObjects,
	avatarUrl,
	avatarUrlSm,
	r2IsConfigured
} from '../lib/r2.js';
import { logError } from '../utils/logger.js';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB raw upload cap
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ELIGIBLE_TIERS = new Set(['officer', 'commander']);

/**
 * Multer middleware: accepts a single `avatar` file in memory.
 * Pre-decode size cap is 4 MB; sharp re-encodes to <15 KB regardless.
 */
export const avatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_MIME.has(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error('Only JPEG, PNG, or WebP images are allowed.'));
		}
	}
}).single('avatar');

/**
 * Gate to Officer + Commander supporter tiers. Used before the upload handler
 * so non-eligible users get a clean 403 without spending CPU on image decoding.
 */
export async function requireAvatarTier(
	req: AuthRequest,
	res: Response,
	next: NextFunction
): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { supporterTier: true }
		});
		if (!user || !user.supporterTier || !ELIGIBLE_TIERS.has(user.supporterTier)) {
			res
				.status(403)
				.json({ error: 'Custom avatars require Officer or Commander supporter tier.' });
			return;
		}
		next();
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'avatarController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function uploadAvatar(req: AuthRequest, res: Response): Promise<void> {
	try {
		if (!r2IsConfigured()) {
			res.status(503).json({ error: 'Avatar uploads are temporarily unavailable.' });
			return;
		}
		if (!req.file?.buffer || req.file.buffer.length === 0) {
			res.status(400).json({ error: 'No image file provided.' });
			return;
		}

		const userId = req.userId;
		const existing = await prisma.user.findUnique({
			where: { id: userId },
			select: { avatarKey: true }
		});

		let processed;
		try {
			processed = await processAndUploadAvatar(userId, req.file.buffer);
		} catch (err) {
			// sharp throws on invalid / corrupted / non-image payloads.
			logError('avatar_process_failed', {
				message: (err as Error).message,
				userId
			});
			res.status(400).json({ error: 'Could not process this image. Try a different file.' });
			return;
		}

		await prisma.user.update({
			where: { id: userId },
			data: { avatarKey: processed.avatarKey }
		});

		// Best-effort cleanup of the old avatar objects. Don't fail the request if
		// R2 hiccups - the stale objects are harmless and a later upload will hash
		// to a new key anyway.
		if (existing?.avatarKey && existing.avatarKey !== processed.avatarKey) {
			deleteAvatarObjects(userId, existing.avatarKey).catch((err) => {
				logError('avatar_delete_old_failed', {
					message: (err as Error).message,
					userId,
					oldKey: existing.avatarKey
				});
			});
		}

		res.json({
			avatarKey: processed.avatarKey,
			avatarUrl: avatarUrl(userId, processed.avatarKey),
			avatarUrlSm: avatarUrlSm(userId, processed.avatarKey)
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'avatarController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function deleteAvatar(req: AuthRequest, res: Response): Promise<void> {
	try {
		const userId = req.userId;
		const existing = await prisma.user.findUnique({
			where: { id: userId },
			select: { avatarKey: true }
		});

		if (!existing?.avatarKey) {
			res.json({ ok: true });
			return;
		}

		await prisma.user.update({
			where: { id: userId },
			data: { avatarKey: null }
		});

		deleteAvatarObjects(userId, existing.avatarKey).catch((err) => {
			logError('avatar_delete_failed', {
				message: (err as Error).message,
				userId,
				key: existing.avatarKey
			});
		});

		res.json({ ok: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'avatarController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
