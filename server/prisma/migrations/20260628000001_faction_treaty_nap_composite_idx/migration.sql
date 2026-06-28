-- Composite index to accelerate the NAP enforcement gate in attackService.ts.
-- The factionTreaty.findFirst at ~line 215 always filters on (galaxyId, type,
-- status), plus the faction-pair OR clauses. Without this index Postgres falls
-- back to the single-column galaxyId index and then filters the whole-galaxy
-- treaty set in memory - a galaxy-wide scan that grows linearly with treaty
-- volume. The composite eliminates that by scoping to the exact (galaxy, nap,
-- active/broken) slice up front; the faction-pair OR is then applied against a
-- tiny subset.
--
-- Plain CREATE INDEX (not CONCURRENTLY) - rationale: Prisma migrate deploy
-- wraps each migration in a transaction, and CREATE INDEX CONCURRENTLY is
-- forbidden inside a transaction block. Using CONCURRENTLY here would require
-- either a separate non-transactional migration or an out-of-band PSQL step.
-- At beta launch the FactionTreaty table is tiny (days old, small player base),
-- so the table-level share lock held during a plain CREATE INDEX will resolve in
-- microseconds and imposes zero practical downtime. Revisit with CONCURRENTLY
-- only when the table has grown to a scale where the lock window matters.

CREATE INDEX IF NOT EXISTS "FactionTreaty_galaxyId_type_status_idx"
    ON "FactionTreaty"("galaxyId", "type", "status");
