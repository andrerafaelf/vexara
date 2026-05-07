-- CreateEnum
CREATE TYPE "AttackType" AS ENUM ('attack', 'support', 'scout');

-- CreateEnum
CREATE TYPE "AttackStatus" AS ENUM ('traveling', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(20) NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nexus" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" INTEGER,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "biomass" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "alloy" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "ore" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "commandCore" INTEGER NOT NULL DEFAULT 1,
    "recruitmentCore" INTEGER NOT NULL DEFAULT 0,
    "lifeSupport" INTEGER NOT NULL DEFAULT 1,
    "storageVault" INTEGER NOT NULL DEFAULT 1,
    "biomassFarm" INTEGER NOT NULL DEFAULT 1,
    "alloyForge" INTEGER NOT NULL DEFAULT 1,
    "oreExtractor" INTEGER NOT NULL DEFAULT 1,
    "shieldGrid" INTEGER NOT NULL DEFAULT 0,
    "lancerDrone" INTEGER NOT NULL DEFAULT 0,
    "assaultTrooper" INTEGER NOT NULL DEFAULT 0,
    "breakerUnit" INTEGER NOT NULL DEFAULT 0,
    "reconOperative" INTEGER NOT NULL DEFAULT 0,
    "skimmerBike" INTEGER NOT NULL DEFAULT 0,
    "siegeMech" INTEGER NOT NULL DEFAULT 0,
    "bulwarkGuard" INTEGER NOT NULL DEFAULT 0,
    "suppressorTeam" INTEGER NOT NULL DEFAULT 0,
    "disruptorUnit" INTEGER NOT NULL DEFAULT 0,
    "interceptorBike" INTEGER NOT NULL DEFAULT 0,
    "annihilatorPlatform" INTEGER NOT NULL DEFAULT 0,
    "overseer" INTEGER NOT NULL DEFAULT 0,
    "populationCurrent" INTEGER NOT NULL DEFAULT 5,
    "populationMax" INTEGER NOT NULL DEFAULT 24,
    "buildQueue" JSONB NOT NULL DEFAULT '[]',
    "trainingQueue" JSONB NOT NULL DEFAULT '[]',
    "lastResourceUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points" INTEGER NOT NULL DEFAULT 5,
    "controlLevel" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nexus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attack" (
    "id" SERIAL NOT NULL,
    "attackerUserId" INTEGER NOT NULL,
    "attackerNexusId" INTEGER NOT NULL,
    "defenderUserId" INTEGER,
    "defenderNexusId" INTEGER NOT NULL,
    "troops" JSONB NOT NULL,
    "arrivesAt" TIMESTAMP(3) NOT NULL,
    "type" "AttackType" NOT NULL DEFAULT 'attack',
    "status" "AttackStatus" NOT NULL DEFAULT 'traveling',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Nexus" ADD CONSTRAINT "Nexus_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attack" ADD CONSTRAINT "Attack_attackerNexusId_fkey" FOREIGN KEY ("attackerNexusId") REFERENCES "Nexus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attack" ADD CONSTRAINT "Attack_defenderNexusId_fkey" FOREIGN KEY ("defenderNexusId") REFERENCES "Nexus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
