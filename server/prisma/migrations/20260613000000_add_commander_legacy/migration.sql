-- AddColumn: permanent cross-galaxy commander stats on User
ALTER TABLE "User" ADD COLUMN "galaxiesWon"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "galaxiesPlayed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lifetimePoints" INTEGER NOT NULL DEFAULT 0;
