-- CreateTable TroopTransfer
CREATE TABLE "TroopTransfer" (
    "id" SERIAL NOT NULL,
    "ownerNexusId" INTEGER NOT NULL,
    "hostNexusId" INTEGER NOT NULL,
    "troops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TroopTransfer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TroopTransfer" ADD CONSTRAINT "TroopTransfer_ownerNexusId_fkey"
    FOREIGN KEY ("ownerNexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TroopTransfer" ADD CONSTRAINT "TroopTransfer_hostNexusId_fkey"
    FOREIGN KEY ("hostNexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ReportRead (persistent read/unread per user per attack)
CREATE TABLE "ReportRead" (
    "userId" INTEGER NOT NULL,
    "attackId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRead_pkey" PRIMARY KEY ("userId", "attackId")
);
