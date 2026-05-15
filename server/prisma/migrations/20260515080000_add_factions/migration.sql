-- CreateEnum
CREATE TYPE "FactionRole" AS ENUM ('leader', 'officer', 'member');

-- AlterTable
ALTER TABLE "Galaxy" ADD COLUMN "winnerFactionId" INTEGER;

-- CreateTable
CREATE TABLE "Faction" (
    "id" SERIAL NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "tag" VARCHAR(6) NOT NULL,
    "description" VARCHAR(256),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dominanceSince" TIMESTAMP(3),

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactionMember" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "role" "FactionRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactionInvite" (
    "id" SERIAL NOT NULL,
    "factionId" INTEGER NOT NULL,
    "invitedUserId" INTEGER NOT NULL,
    "invitedByUserId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Faction_galaxyId_name_key" ON "Faction"("galaxyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Faction_galaxyId_tag_key" ON "Faction"("galaxyId", "tag");

-- CreateIndex
CREATE INDEX "Faction_galaxyId_idx" ON "Faction"("galaxyId");

-- CreateIndex
CREATE UNIQUE INDEX "FactionMember_userId_galaxyId_key" ON "FactionMember"("userId", "galaxyId");

-- CreateIndex
CREATE INDEX "FactionMember_factionId_idx" ON "FactionMember"("factionId");

-- CreateIndex
CREATE INDEX "FactionMember_galaxyId_idx" ON "FactionMember"("galaxyId");

-- CreateIndex
CREATE UNIQUE INDEX "FactionInvite_factionId_invitedUserId_key" ON "FactionInvite"("factionId", "invitedUserId");

-- CreateIndex
CREATE INDEX "FactionInvite_invitedUserId_galaxyId_idx" ON "FactionInvite"("invitedUserId", "galaxyId");

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_galaxyId_fkey" FOREIGN KEY ("galaxyId") REFERENCES "Galaxy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionMember" ADD CONSTRAINT "FactionMember_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionMember" ADD CONSTRAINT "FactionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionInvite" ADD CONSTRAINT "FactionInvite_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
