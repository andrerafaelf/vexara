-- NAP break enforcement (Diplomacy Teeth Phase 1).
-- Adds the 'broken' status and three breach-lifecycle columns so the combat
-- launch gate in attackService.ts can query betrayalEndsAt on the hot path.
--
-- Enum note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
-- PostgreSQL < 12. This project runs PostgreSQL 12+ (confirmed by the existing
-- identical pattern in 20260511100000_add_attack_returning_status). On PG 12+
-- ADD VALUE is allowed inside a transaction provided the new value is not
-- consumed in the same transaction - which is true here (the three new columns
-- are TIMESTAMP / INTEGER, not FactionTreatyStatus). Safe as-is.

-- AlterEnum
ALTER TYPE "FactionTreatyStatus" ADD VALUE 'broken';

-- AlterTable: breach-lifecycle columns - all nullable, no default, no table
-- rewrite, no backfill lock. Online-safe against a live populated table.
ALTER TABLE "FactionTreaty"
    ADD COLUMN "brokenAt"       TIMESTAMP(3),
    ADD COLUMN "betrayalEndsAt" TIMESTAMP(3),
    ADD COLUMN "brokenByUserId" INTEGER;
