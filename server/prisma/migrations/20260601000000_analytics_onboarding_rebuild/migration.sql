-- Add analytics/onboarding fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "beginnerTipsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingStep" VARCHAR(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralClickCount" INTEGER NOT NULL DEFAULT 0;

-- Add rebuild bonus field to Nexus
ALTER TABLE "Nexus" ADD COLUMN IF NOT EXISTS "rebuildBonusEndsAt" TIMESTAMP(3);

-- GameEvent table for funnel analytics
CREATE TABLE IF NOT EXISTS "GameEvent" (
    "id"        SERIAL PRIMARY KEY,
    "userId"    INTEGER NOT NULL,
    "galaxyId"  INTEGER,
    "event"     VARCHAR(64) NOT NULL,
    "meta"      JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "GameEvent_userId_event_idx"           ON "GameEvent"("userId", "event");
CREATE INDEX IF NOT EXISTS "GameEvent_event_createdAt_idx"        ON "GameEvent"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "GameEvent_galaxyId_event_createdAt_idx" ON "GameEvent"("galaxyId", "event", "createdAt");
