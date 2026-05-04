import { PrismaPg } from '@prisma/adapter-pg';
import prismaClientPkg from '@prisma/client';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const PrismaClient = prismaClientPkg?.PrismaClient || prismaClientPkg?.default?.PrismaClient;
if (!PrismaClient) {
  throw new Error('PrismaClient export not found in @prisma/client');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
