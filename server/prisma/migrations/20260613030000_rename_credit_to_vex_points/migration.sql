-- Rename supporterCreditCents → vexPoints (currency is Vex Points, not euro cents)
ALTER TABLE "User" RENAME COLUMN "supporterCreditCents" TO "vexPoints";
