-- Supporter credit balance on User (euro cents)
ALTER TABLE "User" ADD COLUMN "supporterCreditCents" INTEGER NOT NULL DEFAULT 0;

-- Battle pass fields on GalaxyPlayer
ALTER TABLE "GalaxyPlayer" ADD COLUMN "seasonXp"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GalaxyPlayer" ADD COLUMN "passLevel"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GalaxyPlayer" ADD COLUMN "hasPaidPass" BOOLEAN NOT NULL DEFAULT false;

-- Permanent per-user season history for Hall of Champions
CREATE TABLE "SeasonRecord" (
    "id"          SERIAL PRIMARY KEY,
    "userId"      INTEGER      NOT NULL,
    "galaxyId"    INTEGER      NOT NULL,
    "galaxyName"  VARCHAR(64)  NOT NULL,
    "endedAt"     TIMESTAMP(3) NOT NULL,
    "points"      INTEGER      NOT NULL,
    "won"         BOOLEAN      NOT NULL,
    "factionName" VARCHAR(32),
    "factionTag"  VARCHAR(6),
    CONSTRAINT "SeasonRecord_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SeasonRecord_userId_idx"    ON "SeasonRecord"("userId");
CREATE INDEX "SeasonRecord_galaxyId_idx"  ON "SeasonRecord"("galaxyId");
CREATE INDEX "SeasonRecord_endedAt_idx"   ON "SeasonRecord"("endedAt");
