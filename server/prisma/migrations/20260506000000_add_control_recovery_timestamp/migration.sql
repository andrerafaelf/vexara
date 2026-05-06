-- Add lastControlRecovery timestamp to track gradual control level recovery after conquest
ALTER TABLE "Nexus" ADD COLUMN "lastControlRecovery" TIMESTAMP(3);
