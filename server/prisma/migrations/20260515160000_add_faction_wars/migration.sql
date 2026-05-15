-- CreateEnum
CREATE TYPE "FactionWarStatus" AS ENUM ('pending', 'active', 'ended');

-- CreateTable
CREATE TABLE "FactionWar" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "declarerFactionId" INTEGER NOT NULL,
    "targetFactionId" INTEGER NOT NULL,
    "status" "FactionWarStatus" NOT NULL DEFAULT 'pending',
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "FactionWar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactionWar_galaxyId_status_idx" ON "FactionWar"("galaxyId", "status");

-- AddForeignKey
ALTER TABLE "FactionWar" ADD CONSTRAINT "FactionWar_declarerFactionId_fkey" FOREIGN KEY ("declarerFactionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionWar" ADD CONSTRAINT "FactionWar_targetFactionId_fkey" FOREIGN KEY ("targetFactionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
