-- Global app config singleton. id is always 1.
-- seasonEndsAt: when set, all active galaxies end at this time.
CREATE TABLE IF NOT EXISTS "AppConfig" (
    "id"           INTEGER NOT NULL DEFAULT 1,
    "seasonEndsAt" TIMESTAMP(3),
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppConfig_single_row" CHECK ("id" = 1)
);
