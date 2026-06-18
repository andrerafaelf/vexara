-- Standing defensive orders (roadmap Phase 2). A persistent "if my nexus is
-- attacked, auto-send reserve troops from my other nexus" rule. Reuses the
-- existing troop-transfer rails (troopTransferService.sendTroopsTransaction)
-- rather than a new combat mechanic, so no Attack/TroopTransfer schema
-- changes are needed here.
CREATE TABLE IF NOT EXISTS "StandingOrder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "protectedNexusId" INTEGER NOT NULL,
    "sourceNexusId" INTEGER NOT NULL,
    "troops" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StandingOrder_protectedNexusId_sourceNexusId_key"
    ON "StandingOrder"("protectedNexusId", "sourceNexusId");

CREATE INDEX IF NOT EXISTS "StandingOrder_userId_galaxyId_idx"
    ON "StandingOrder"("userId", "galaxyId");

CREATE INDEX IF NOT EXISTS "StandingOrder_protectedNexusId_isActive_idx"
    ON "StandingOrder"("protectedNexusId", "isActive");

ALTER TABLE "StandingOrder"
    ADD CONSTRAINT "StandingOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StandingOrder"
    ADD CONSTRAINT "StandingOrder_galaxyId_fkey"
    FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StandingOrder"
    ADD CONSTRAINT "StandingOrder_protectedNexusId_fkey"
    FOREIGN KEY ("protectedNexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StandingOrder"
    ADD CONSTRAINT "StandingOrder_sourceNexusId_fkey"
    FOREIGN KEY ("sourceNexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
