-- CreateTable
CREATE TABLE "FactionJoinRequest" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "message" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactionJoinRequest_factionId_userId_key" ON "FactionJoinRequest"("factionId", "userId");

-- CreateIndex
CREATE INDEX "FactionJoinRequest_factionId_idx" ON "FactionJoinRequest"("factionId");

-- CreateIndex
CREATE INDEX "FactionJoinRequest_userId_galaxyId_idx" ON "FactionJoinRequest"("userId", "galaxyId");

-- AddForeignKey
ALTER TABLE "FactionJoinRequest" ADD CONSTRAINT "FactionJoinRequest_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionJoinRequest" ADD CONSTRAINT "FactionJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
