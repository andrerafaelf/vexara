-- CreateTable
CREATE TABLE "MarketTransaction" (
    "id" SERIAL NOT NULL,
    "sellerNexusId" INTEGER NOT NULL,
    "sellerUsername" TEXT NOT NULL,
    "buyerNexusId" INTEGER NOT NULL,
    "buyerUsername" TEXT NOT NULL,
    "offerResource" TEXT NOT NULL,
    "offerAmount" INTEGER NOT NULL,
    "wantResource" TEXT NOT NULL,
    "wantAmount" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTransaction_pkey" PRIMARY KEY ("id")
);
