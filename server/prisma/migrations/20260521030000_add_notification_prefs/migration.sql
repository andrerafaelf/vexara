ALTER TABLE "NotificationPreferences"
  ADD COLUMN "factionInvite"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "factionPromotion"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "factionWar"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "factionDiplomacy"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "friendRequest"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "friendMessage"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nearbyGalaxyEvent"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "protectionExpiring" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tokenGranted"       BOOLEAN NOT NULL DEFAULT true;
