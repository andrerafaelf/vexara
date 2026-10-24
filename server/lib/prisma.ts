import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

// One pool shared by HTTP handlers, ~16 background jobs and interactive
// transactions. pg's default max of 10 with no timeouts starves under a signup
// wave and hangs forever when the DB stalls, so size it explicitly and fail fast.
const poolMax = Number(process.env.DB_POOL_MAX);
const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL!,
	max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 20,
	connectionTimeoutMillis: 10_000,
	idleTimeoutMillis: 30_000
});
const prisma = new PrismaClient({ adapter });

export default prisma;
