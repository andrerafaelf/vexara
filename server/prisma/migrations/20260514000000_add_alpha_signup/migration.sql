-- AlphaSignup: closed-alpha email collection
-- Stores emails of users who requested early access while registration is gated.

CREATE TABLE IF NOT EXISTS "AlphaSignup" (
  "id"        SERIAL PRIMARY KEY,
  "email"     VARCHAR(254) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invitedAt" TIMESTAMP(3),
  "source"    VARCHAR(64)
);

CREATE UNIQUE INDEX IF NOT EXISTS "AlphaSignup_email_key" ON "AlphaSignup"("email");
CREATE INDEX IF NOT EXISTS "AlphaSignup_createdAt_idx" ON "AlphaSignup"("createdAt");
