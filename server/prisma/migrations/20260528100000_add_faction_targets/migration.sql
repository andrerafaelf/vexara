CREATE TABLE "FactionTarget" (
    "id"         SERIAL        NOT NULL,
    "factionId"  INTEGER       NOT NULL,
    "galaxyId"   INTEGER       NOT NULL,
    "nexusId"    INTEGER       NOT NULL,
    "markedById" INTEGER       NOT NULL,
    "note"       VARCHAR(128),
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FactionTarget_factionId_nexusId_key" ON "FactionTarget"("factionId", "nexusId");
CREATE INDEX "FactionTarget_factionId_galaxyId_idx" ON "FactionTarget"("factionId", "galaxyId");
CREATE INDEX "FactionTarget_nexusId_idx" ON "FactionTarget"("nexusId");

ALTER TABLE "FactionTarget" ADD CONSTRAINT "FactionTarget_factionId_fkey"
    FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
