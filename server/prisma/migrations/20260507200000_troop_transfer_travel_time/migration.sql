-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('traveling', 'stationed', 'returning');

-- AlterTable TroopTransfer: add travel-time fields
ALTER TABLE "TroopTransfer"
  ADD COLUMN "status"    "TransferStatus" NOT NULL DEFAULT 'stationed',
  ADD COLUMN "arrivesAt" TIMESTAMP(3),
  ADD COLUMN "returnsAt" TIMESTAMP(3);

-- Backfill existing rows as stationed (already arrived)
UPDATE "TroopTransfer" SET "status" = 'stationed' WHERE "status" = 'stationed';
