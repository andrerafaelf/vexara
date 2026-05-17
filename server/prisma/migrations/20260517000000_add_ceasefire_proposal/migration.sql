-- AlterEnum
ALTER TYPE "FactionWarStatus" ADD VALUE 'ceasefire_pending';

-- AlterTable
ALTER TABLE "FactionWar" ADD COLUMN "ceasefireProposerFactionId" INTEGER;
