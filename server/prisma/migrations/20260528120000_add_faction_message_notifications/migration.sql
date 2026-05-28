ALTER TABLE "NotificationPreferences"
  ADD COLUMN "factionMessage" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FactionMember"
  ADD COLUMN "lastSeenFactionMessageId" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "FactionMember_factionId_lastSeenFactionMessageId_idx"
  ON "FactionMember"("factionId", "lastSeenFactionMessageId");
