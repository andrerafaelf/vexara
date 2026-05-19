-- War Room: shared faction operation planning board

CREATE TYPE "WarOperationStatus" AS ENUM ('planning', 'locked', 'launched', 'completed', 'cancelled');

CREATE TABLE "WarOperation" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "targetNexusId" INTEGER NOT NULL,
    "targetX" INTEGER NOT NULL,
    "targetY" INTEGER NOT NULL,
    "targetName" VARCHAR(64) NOT NULL,
    "arrivalAt" TIMESTAMP(3) NOT NULL,
    "status" "WarOperationStatus" NOT NULL DEFAULT 'planning',
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WarOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WarOperation_factionId_status_idx" ON "WarOperation"("factionId", "status");
CREATE INDEX "WarOperation_galaxyId_idx" ON "WarOperation"("galaxyId");
CREATE INDEX "WarOperation_arrivalAt_idx" ON "WarOperation"("arrivalAt");

CREATE TABLE "WarOperationWave" (
    "id" SERIAL NOT NULL,
    "operationId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" VARCHAR(48),
    "arrivalOffsetMs" INTEGER NOT NULL DEFAULT 0,
    "troops" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarOperationWave_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WarOperationWave_operationId_ordinal_idx" ON "WarOperationWave"("operationId", "ordinal");

ALTER TABLE "WarOperationWave" ADD CONSTRAINT "WarOperationWave_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "WarOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WarOperationSlot" (
    "id" SERIAL NOT NULL,
    "waveId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromNexusId" INTEGER NOT NULL,
    "troops" JSONB NOT NULL DEFAULT '{}',
    "note" VARCHAR(128),
    "sentAttackId" INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarOperationSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarOperationSlot_waveId_userId_fromNexusId_key" ON "WarOperationSlot"("waveId", "userId", "fromNexusId");
CREATE INDEX "WarOperationSlot_userId_idx" ON "WarOperationSlot"("userId");
CREATE INDEX "WarOperationSlot_waveId_idx" ON "WarOperationSlot"("waveId");

ALTER TABLE "WarOperationSlot" ADD CONSTRAINT "WarOperationSlot_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "WarOperationWave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WarOperationMessage" (
    "id" SERIAL NOT NULL,
    "operationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarOperationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WarOperationMessage_operationId_createdAt_idx" ON "WarOperationMessage"("operationId", "createdAt");

ALTER TABLE "WarOperationMessage" ADD CONSTRAINT "WarOperationMessage_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "WarOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
