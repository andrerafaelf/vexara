-- Snapshot of GalaxyPlayer.points at the moment a galaxy ends, for winning-faction members only.
-- Null = player did not win that galaxy (counts as 0 toward lifetime influence).
ALTER TABLE "GalaxyPlayer" ADD COLUMN "finalPoints" INTEGER;

-- Backfill: for galaxies that have already ended, freeze the current points of every
-- member of the winning faction. Everyone else stays null.
UPDATE "GalaxyPlayer" gp
SET "finalPoints" = gp."points"
FROM "Galaxy" g
JOIN "FactionMember" fm ON fm."factionId" = g."winnerFactionId" AND fm."galaxyId" = g."id"
WHERE gp."galaxyId" = g."id"
  AND g."status" = 'ended'
  AND g."winnerFactionId" IS NOT NULL
  AND gp."userId" = fm."userId";
