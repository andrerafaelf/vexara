-- Add tiered supporter fields to User.
-- supporterTier: 'recruit' | 'officer' | 'commander' (highest tier ever achieved).
-- isFounder: permanent flag granted on a Commander-tier (>= €25) donation during alpha.
ALTER TABLE "User"
  ADD COLUMN "supporterTier" VARCHAR(16),
  ADD COLUMN "supporterTierSince" TIMESTAMP(3),
  ADD COLUMN "isFounder" BOOLEAN NOT NULL DEFAULT false;
