-- Add account-bound, cross-galaxy unique referral code to User.
-- Step 1 of 2: add the column as nullable so existing rows survive.
-- After this migration runs, manually backfill before applying the follow-up migration:
--   UPDATE "User" SET "referralCode" = 'K7Q3M9XR' WHERE id = 1;
-- Then apply 20260518000001_enforce_user_referral_code.

ALTER TABLE "User" ADD COLUMN "referralCode" VARCHAR(12);
