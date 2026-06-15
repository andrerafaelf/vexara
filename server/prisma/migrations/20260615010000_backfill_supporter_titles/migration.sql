-- Backfill earnedTitles for existing supporters who never went through the
-- updated webhook flow. Rules mirror the webhook: each tier gets its own title
-- plus all titles below it (Officer gets Recruit + Officer, Commander gets all three).

-- Recruit tier: grant ['Recruit'] if not already present
UPDATE "User"
SET "earnedTitles" = (
  SELECT jsonb_agg(DISTINCT val)
  FROM jsonb_array_elements_text(
    COALESCE("earnedTitles", '[]'::jsonb) || '["Recruit"]'::jsonb
  ) AS val
)
WHERE "supporterTier" = 'recruit'
  AND NOT ("earnedTitles" @> '["Recruit"]'::jsonb);

-- Officer tier: grant ['Recruit', 'Officer'] if missing either
UPDATE "User"
SET "earnedTitles" = (
  SELECT jsonb_agg(DISTINCT val)
  FROM jsonb_array_elements_text(
    COALESCE("earnedTitles", '[]'::jsonb) || '["Recruit","Officer"]'::jsonb
  ) AS val
)
WHERE "supporterTier" = 'officer'
  AND NOT ("earnedTitles" @> '["Recruit","Officer"]'::jsonb);

-- Commander tier: grant ['Recruit', 'Officer', 'Commander'] if missing any
UPDATE "User"
SET "earnedTitles" = (
  SELECT jsonb_agg(DISTINCT val)
  FROM jsonb_array_elements_text(
    COALESCE("earnedTitles", '[]'::jsonb) || '["Recruit","Officer","Commander"]'::jsonb
  ) AS val
)
WHERE "supporterTier" = 'commander'
  AND NOT ("earnedTitles" @> '["Recruit","Officer","Commander"]'::jsonb);
