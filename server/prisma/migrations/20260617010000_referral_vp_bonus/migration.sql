-- Referral VP bonus marker. Set the first time a referred user reaches the
-- referral VP-bonus influence threshold (5,000), triggering a one-time 250 VP
-- grant to both that user and their referrer. Null = not yet granted; the column
-- is the idempotency key so the bonus can never double-pay.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralVpBonusAt" TIMESTAMP(3);
