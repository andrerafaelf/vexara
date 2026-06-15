-- Add avatar border and username change tracking to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "avatarBorder"       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "usernameChangedAt"  TIMESTAMP(3);

-- Shop purchase ledger
CREATE TABLE IF NOT EXISTS "ShopPurchase" (
  "id"        SERIAL       NOT NULL,
  "userId"    INTEGER      NOT NULL,
  "itemKey"   VARCHAR(64)  NOT NULL,
  "itemType"  VARCHAR(32)  NOT NULL,
  "vpSpent"   INTEGER      NOT NULL,
  "meta"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShopPurchase_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShopPurchase"
  ADD CONSTRAINT "ShopPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ShopPurchase_userId_itemKey_idx" ON "ShopPurchase"("userId", "itemKey");
CREATE INDEX IF NOT EXISTS "ShopPurchase_userId_createdAt_idx" ON "ShopPurchase"("userId", "createdAt");
