-- AlterTable: add armory building + voidStalker + plasmaTurret troops to Nexus
ALTER TABLE "Nexus"
  ADD COLUMN IF NOT EXISTS "armory"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "voidStalker"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "plasmaTurret"    INTEGER NOT NULL DEFAULT 0;
