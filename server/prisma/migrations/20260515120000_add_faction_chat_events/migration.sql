-- AlterTable: add motd to Faction
ALTER TABLE "Faction" ADD COLUMN "motd" VARCHAR(512);

-- CreateTable: FactionMessage
CREATE TABLE "FactionMessage" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FactionEvent
CREATE TABLE "FactionEvent" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "actorName" VARCHAR(64),
    "targetName" VARCHAR(64),
    "meta" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactionMessage_factionId_createdAt_idx" ON "FactionMessage"("factionId", "createdAt");

-- CreateIndex
CREATE INDEX "FactionEvent_factionId_createdAt_idx" ON "FactionEvent"("factionId", "createdAt");

-- AddForeignKey
ALTER TABLE "FactionMessage" ADD CONSTRAINT "FactionMessage_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionMessage" ADD CONSTRAINT "FactionMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionEvent" ADD CONSTRAINT "FactionEvent_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
