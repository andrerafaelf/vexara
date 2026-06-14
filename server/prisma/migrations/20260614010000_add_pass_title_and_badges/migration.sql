-- Add season pass title (per-galaxy, promoted to User at season end)
ALTER TABLE "GalaxyPlayer" ADD COLUMN "passTitle" VARCHAR(32);

-- Permanent pass title (best ever earned across all passes)
ALTER TABLE "User" ADD COLUMN "passTitle" VARCHAR(32);

-- Permanent badge collection (JSON array of tier strings: ["bronze", "silver", ...])
ALTER TABLE "User" ADD COLUMN "earnedBadges" JSONB NOT NULL DEFAULT '[]';
