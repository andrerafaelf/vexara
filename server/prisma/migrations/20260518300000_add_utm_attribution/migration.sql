-- Add minimal UTM attribution (source/medium/campaign) to AlphaSignup and User.
-- All columns nullable; populated at signup time from query params on the landing page.

ALTER TABLE "AlphaSignup"
  ADD COLUMN "utmSource"   VARCHAR(64),
  ADD COLUMN "utmMedium"   VARCHAR(64),
  ADD COLUMN "utmCampaign" VARCHAR(64);

ALTER TABLE "User"
  ADD COLUMN "utmSource"   VARCHAR(64),
  ADD COLUMN "utmMedium"   VARCHAR(64),
  ADD COLUMN "utmCampaign" VARCHAR(64);
