-- Ko-fi webhook idempotency ledger. The webhook inserts a row keyed by Ko-fi's
-- transaction id BEFORE crediting anything; a unique violation means the delivery
-- was already processed, so retries cannot double-credit Vex Points.
-- Additive only: new empty table, no backfill, no lock on existing tables.
-- userId is a plain scalar (no FK) on purpose: audit only, survives user deletion.

-- CreateTable
CREATE TABLE "KofiWebhookEvent" (
    "id"            SERIAL NOT NULL,
    "transactionId" VARCHAR(128) NOT NULL,
    "type"          VARCHAR(32) NOT NULL,
    "userId"        INTEGER,
    "amount"        VARCHAR(32),
    "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KofiWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KofiWebhookEvent_transactionId_key" ON "KofiWebhookEvent"("transactionId");

-- CreateIndex
CREATE INDEX "KofiWebhookEvent_userId_idx" ON "KofiWebhookEvent"("userId");
