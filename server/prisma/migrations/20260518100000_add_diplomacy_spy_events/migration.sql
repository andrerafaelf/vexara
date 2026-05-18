-- AddField: nexusTypeLockedAt on Nexus (for Feature 1 - specialization lock)
ALTER TABLE "Nexus" ADD COLUMN "nexusTypeLockedAt" TIMESTAMP(3);

-- AddField: nexusTypeDoubled on Nexus (tracks if conquered NPC nexus got doubled bonus)
ALTER TABLE "Nexus" ADD COLUMN "nexusTypeDoubled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: GalaxyEvent (Feature 3 - dynamic map events)
CREATE TABLE "GalaxyEvent" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "nexusId" INTEGER,
    "x" INTEGER,
    "y" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalaxyEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GalaxyEvent_galaxyId_idx" ON "GalaxyEvent"("galaxyId");
CREATE INDEX "GalaxyEvent_type_idx" ON "GalaxyEvent"("type");
CREATE INDEX "GalaxyEvent_expiresAt_idx" ON "GalaxyEvent"("expiresAt");

ALTER TABLE "GalaxyEvent" ADD CONSTRAINT "GalaxyEvent_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SpyAsset (Feature 5 - embedded operatives)
CREATE TABLE "SpyAsset" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "ownerNexusId" INTEGER NOT NULL,
    "targetNexusId" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "discoveredAt" TIMESTAMP(3),
    "lastReportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpyAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpyAsset_galaxyId_idx" ON "SpyAsset"("galaxyId");
CREATE INDEX "SpyAsset_targetNexusId_idx" ON "SpyAsset"("targetNexusId");
CREATE INDEX "SpyAsset_ownerUserId_idx" ON "SpyAsset"("ownerUserId");

ALTER TABLE "SpyAsset" ADD CONSTRAINT "SpyAsset_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum: FactionTreatyType
CREATE TYPE "FactionTreatyType" AS ENUM ('nap', 'trade', 'vassal');
CREATE TYPE "FactionTreatyStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled');

-- CreateTable: FactionTreaty (Feature 6 - diplomacy)
CREATE TABLE "FactionTreaty" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "type" "FactionTreatyType" NOT NULL,
    "status" "FactionTreatyStatus" NOT NULL DEFAULT 'pending',
    "proposerFactionId" INTEGER NOT NULL,
    "targetFactionId" INTEGER NOT NULL,
    "proposedByUserId" INTEGER NOT NULL,
    "acceptedByUserId" INTEGER,
    "durationDays" INTEGER,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "FactionTreaty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FactionTreaty_galaxyId_idx" ON "FactionTreaty"("galaxyId");
CREATE INDEX "FactionTreaty_proposerFactionId_idx" ON "FactionTreaty"("proposerFactionId");
CREATE INDEX "FactionTreaty_targetFactionId_idx" ON "FactionTreaty"("targetFactionId");
CREATE INDEX "FactionTreaty_status_idx" ON "FactionTreaty"("status");

ALTER TABLE "FactionTreaty" ADD CONSTRAINT "FactionTreaty_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactionTreaty" ADD CONSTRAINT "FactionTreaty_proposerFactionId_fkey" FOREIGN KEY ("proposerFactionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactionTreaty" ADD CONSTRAINT "FactionTreaty_targetFactionId_fkey" FOREIGN KEY ("targetFactionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
