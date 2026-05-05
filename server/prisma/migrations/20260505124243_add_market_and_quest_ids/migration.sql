-- AlterTable
ALTER TABLE "Nexus" ADD COLUMN     "completedQuestIds" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "commandCore" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" SERIAL NOT NULL,
    "sellerNexusId" INTEGER NOT NULL,
    "offerResource" TEXT NOT NULL,
    "offerAmount" INTEGER NOT NULL,
    "wantResource" TEXT NOT NULL,
    "wantAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerNexusId_fkey" FOREIGN KEY ("sellerNexusId") REFERENCES "Nexus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
