-- AddColumn: user flagging system
ALTER TABLE "User" ADD COLUMN "isFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "flagReason" VARCHAR(200);
ALTER TABLE "User" ADD COLUMN "flaggedAt" TIMESTAMP(3);
