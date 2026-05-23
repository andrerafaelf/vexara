-- pgcrypto provides gen_random_bytes(). Required for the backfill below;
-- safe to enable repeatedly on prod and fresh dev DBs alike.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add token column so unsubscribe links require a per-recipient secret
-- instead of allowing arbitrary `?email=` lookups.
ALTER TABLE "AlphaSignup" ADD COLUMN IF NOT EXISTS "unsubscribeToken" VARCHAR(64);

-- Backfill existing rows with a random token so any old links keep working
-- once they are re-issued by the next email send.
UPDATE "AlphaSignup"
SET "unsubscribeToken" = encode(gen_random_bytes(32), 'hex')
WHERE "unsubscribeToken" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AlphaSignup_unsubscribeToken_key" ON "AlphaSignup"("unsubscribeToken");
