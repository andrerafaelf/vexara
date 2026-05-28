-- Idempotency key for client-triggered attack sends. Nullable so existing
-- attacks and older clients remain valid; PostgreSQL permits multiple NULLs
-- under a unique index.
ALTER TABLE "Attack" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Attack_clientRequestId_key" ON "Attack"("clientRequestId");
