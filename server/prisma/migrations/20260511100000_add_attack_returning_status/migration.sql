-- AlterEnum
ALTER TYPE "AttackStatus" ADD VALUE 'returning';

-- AlterTable
ALTER TABLE "Attack" ADD COLUMN "returnsAt" TIMESTAMP(3);
