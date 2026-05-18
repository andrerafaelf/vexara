-- Step 2 of 2: enforce NOT NULL + UNIQUE on User.referralCode.
-- Prereq: all existing User rows have been backfilled with a non-null referralCode
-- (see 20260518000000_add_user_referral_code).

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
