-- Widen FactionMessage.content from VarChar(1000) to VarChar(4000) to match
-- FACTION_MSG_MAX in factionController. Sharing a combat report (~1.5-2.5k chars,
-- one block per allied contributor) passed the length validator but overflowed
-- the 1000-char column, throwing a Postgres "value too long" error -> HTTP 500.
ALTER TABLE "FactionMessage" ALTER COLUMN "content" TYPE VARCHAR(4000);
