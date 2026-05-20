-- CreateTable
CREATE TABLE "DiplomacyMessage" (
    "id"        SERIAL NOT NULL,
    "treatyId"  INTEGER NOT NULL,
    "userId"    INTEGER NOT NULL,
    "content"   VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiplomacyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiplomacyMessage_treatyId_createdAt_idx" ON "DiplomacyMessage"("treatyId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiplomacyMessage" ADD CONSTRAINT "DiplomacyMessage_treatyId_fkey"
    FOREIGN KEY ("treatyId") REFERENCES "FactionTreaty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiplomacyMessage" ADD CONSTRAINT "DiplomacyMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
