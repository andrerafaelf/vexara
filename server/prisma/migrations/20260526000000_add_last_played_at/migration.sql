-- Add lastPlayedAt to User for activity tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPlayedAt" TIMESTAMP(3);
