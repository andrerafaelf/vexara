-- CreateTable: SpyMission (in-flight spy operations: embed / sabotage)
CREATE TABLE "SpyMission" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "fromNexusId" INTEGER NOT NULL,
    "toNexusId" INTEGER NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "operatives" INTEGER NOT NULL,
    "sabotageTarget" VARCHAR(32),
    "status" VARCHAR(16) NOT NULL DEFAULT 'traveling',
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "returnsAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpyMission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpyMission_galaxyId_idx" ON "SpyMission"("galaxyId");
CREATE INDEX "SpyMission_status_arrivesAt_idx" ON "SpyMission"("status", "arrivesAt");
CREATE INDEX "SpyMission_fromNexusId_status_idx" ON "SpyMission"("fromNexusId", "status");

ALTER TABLE "SpyMission" ADD CONSTRAINT "SpyMission_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
