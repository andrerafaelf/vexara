-- Coordinated Assault, PR1: schema + plumbing, no resolver behavior change.
-- Adds the WavePlan grouping table (solo-player coordination), the two
-- coordination pointers on Attack (wavePlanId / warOperationWaveId), the
-- coordination pointer on ScheduledAttack, and a CHECK constraint that an
-- Attack carries AT MOST one coordination pointer. PR2 will read these in the
-- resolver to merge same-coordination waves into one combat.

-- WavePlan: a solo player's wave plan against one target. Server-side glue.
-- No lifecycle status column - a plan is "active" as long as it has any
-- pending ScheduledAttacks or unresolved Attacks; otherwise it's historical
-- metadata kept for combat-log lineage.
CREATE TABLE "WavePlan" (
    "id"            SERIAL PRIMARY KEY,
    "userId"        INTEGER NOT NULL,
    "galaxyId"      INTEGER NOT NULL,
    "targetNexusId" INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WavePlan_userId_fkey"
        FOREIGN KEY ("userId")        REFERENCES "User"("id")  ON DELETE CASCADE,
    CONSTRAINT "WavePlan_galaxyId_fkey"
        FOREIGN KEY ("galaxyId")      REFERENCES "Galaxy"("id") ON DELETE CASCADE,
    CONSTRAINT "WavePlan_targetNexusId_fkey"
        FOREIGN KEY ("targetNexusId") REFERENCES "Nexus"("id")  ON DELETE CASCADE
);

CREATE INDEX "WavePlan_userId_galaxyId_targetNexusId_idx"
    ON "WavePlan"("userId", "galaxyId", "targetNexusId");
CREATE INDEX "WavePlan_createdAt_idx"
    ON "WavePlan"("createdAt");

-- ScheduledAttack: stamp the plan at schedule time; propagated to Attack at
-- launch by attackService.launchAttack.
ALTER TABLE "ScheduledAttack"
    ADD COLUMN "wavePlanId" INTEGER;

ALTER TABLE "ScheduledAttack"
    ADD CONSTRAINT "ScheduledAttack_wavePlanId_fkey"
    FOREIGN KEY ("wavePlanId") REFERENCES "WavePlan"("id") ON DELETE SET NULL;

CREATE INDEX "ScheduledAttack_wavePlanId_idx"
    ON "ScheduledAttack"("wavePlanId");

-- Attack: the two coordination pointers. Resolver groups by these in PR2.
ALTER TABLE "Attack"
    ADD COLUMN "wavePlanId"         INTEGER,
    ADD COLUMN "warOperationWaveId" INTEGER;

ALTER TABLE "Attack"
    ADD CONSTRAINT "Attack_wavePlanId_fkey"
    FOREIGN KEY ("wavePlanId") REFERENCES "WavePlan"("id") ON DELETE SET NULL;

ALTER TABLE "Attack"
    ADD CONSTRAINT "Attack_warOperationWaveId_fkey"
    FOREIGN KEY ("warOperationWaveId") REFERENCES "WarOperationWave"("id") ON DELETE SET NULL;

-- Invariant: an Attack belongs to AT MOST one coordination. The resolver
-- depends on this to group cleanly without conflict-resolution rules.
ALTER TABLE "Attack"
    ADD CONSTRAINT "attack_one_coordination"
    CHECK (NUM_NONNULLS("wavePlanId", "warOperationWaveId") <= 1);

-- Resolver hot path: pull arriving attacks grouped by coordination key
-- without a sequential scan. Mirrors the existing (status, arrivesAt) index.
CREATE INDEX "Attack_arrivesAt_status_wavePlanId_idx"
    ON "Attack"("arrivesAt", "status", "wavePlanId");
CREATE INDEX "Attack_arrivesAt_status_warOperationWaveId_idx"
    ON "Attack"("arrivesAt", "status", "warOperationWaveId");
