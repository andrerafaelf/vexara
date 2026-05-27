-- CreateTable
CREATE TABLE "DailyStreak" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "galaxyId" INTEGER NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastClaimedAt" TIMESTAMP(3),
    "questsSeed" VARCHAR(32),
    "questsProgress" JSONB NOT NULL DEFAULT '{}',
    "questsClaimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyStreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyStreak_userId_galaxyId_key" ON "DailyStreak"("userId", "galaxyId");

-- CreateIndex
CREATE INDEX "DailyStreak_userId_idx" ON "DailyStreak"("userId");
