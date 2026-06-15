import {
	S3Client,
	PutObjectCommand,
	DeleteObjectsCommand,
	type ObjectIdentifier
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

export function r2IsConfigured(): boolean {
	return Boolean(accountId && accessKeyId && secretAccessKey && bucket && publicUrl);
}

let _client: S3Client | null = null;
function client(): S3Client {
	if (!r2IsConfigured()) {
		throw new Error('R2 is not configured (missing R2_* env vars)');
	}
	if (!_client) {
		_client = new S3Client({
			region: 'auto',
			endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: accessKeyId!,
				secretAccessKey: secretAccessKey!
			}
		});
	}
	return _client;
}

const LARGE_SIZE = 256;
const SMALL_SIZE = 64;
const WEBP_QUALITY = 82;
const CACHE_HEADER = 'public, max-age=31536000, immutable';

export interface ProcessedAvatar {
	/** Short content hash, stored in DB. */
	avatarKey: string;
	/** R2 object keys (large + small). */
	largeKey: string;
	smallKey: string;
	largeBytes: number;
	smallBytes: number;
}

/**
 * Re-encode a raw uploaded image into two square webp variants (256×256 and
 * 64×64), strip metadata, and upload both to R2 under a content-hashed key.
 * Returns the short hash (avatarKey) to persist on the user row.
 */
export async function processAndUploadAvatar(
	userId: number,
	input: Buffer
): Promise<ProcessedAvatar> {
	const pipeline = sharp(input, { failOn: 'truncated' }).rotate();

	const large = await pipeline
		.clone()
		.resize(LARGE_SIZE, LARGE_SIZE, { fit: 'cover', position: 'centre' })
		.webp({ quality: WEBP_QUALITY })
		.toBuffer();

	const small = await pipeline
		.clone()
		.resize(SMALL_SIZE, SMALL_SIZE, { fit: 'cover', position: 'centre' })
		.webp({ quality: WEBP_QUALITY })
		.toBuffer();

	// Hash the encoded large buffer so the key changes whenever the visible
	// output changes. 16 hex chars = 64 bits of entropy, plenty for collision
	// avoidance scoped to a single user's avatar history.
	const avatarKey = createHash('sha256').update(large).digest('hex').slice(0, 16);

	const largeKey = `avatars/${userId}/${avatarKey}.webp`;
	const smallKey = `avatars/${userId}/${avatarKey}-sm.webp`;

	const c = client();
	await Promise.all([
		c.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: largeKey,
				Body: large,
				ContentType: 'image/webp',
				CacheControl: CACHE_HEADER
			})
		),
		c.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: smallKey,
				Body: small,
				ContentType: 'image/webp',
				CacheControl: CACHE_HEADER
			})
		)
	]);

	return {
		avatarKey,
		largeKey,
		smallKey,
		largeBytes: large.length,
		smallBytes: small.length
	};
}

/** Delete a user's avatar objects from R2. No-op if the key is null or a preset. */
export async function deleteAvatarObjects(userId: number, avatarKey: string | null): Promise<void> {
	if (!avatarKey || avatarKey.startsWith('preset:')) return;
	const objects: ObjectIdentifier[] = [
		{ Key: `avatars/${userId}/${avatarKey}.webp` },
		{ Key: `avatars/${userId}/${avatarKey}-sm.webp` }
	];
	await client().send(
		new DeleteObjectsCommand({
			Bucket: bucket,
			Delete: { Objects: objects, Quiet: true }
		})
	);
}

const GAME_CDN = 'https://cdn.vexara.world';

/** Compose the public URL for a given user + avatarKey.
 *  Keys prefixed with "preset:" point to CDN troop art, not R2 uploads. */
export function avatarUrl(userId: number, avatarKey: string | null): string | null {
	if (!avatarKey) return null;
	if (avatarKey.startsWith('preset:')) {
		const troopKey = avatarKey.slice('preset:'.length);
		return `${GAME_CDN}/troops/${troopKey}.webp`;
	}
	if (!publicUrl) return null;
	return `${publicUrl}/avatars/${userId}/${avatarKey}.webp`;
}

/** Compose the small (64×64) URL. Presets use the same CDN image (no separate sm variant). */
export function avatarUrlSm(userId: number, avatarKey: string | null): string | null {
	if (!avatarKey) return null;
	if (avatarKey.startsWith('preset:')) {
		const troopKey = avatarKey.slice('preset:'.length);
		return `${GAME_CDN}/troops/${troopKey}.webp`;
	}
	if (!publicUrl) return null;
	return `${publicUrl}/avatars/${userId}/${avatarKey}-sm.webp`;
}
