-- AlterTable
ALTER TABLE "User" ADD COLUMN "nexusGroups" JSONB NOT NULL DEFAULT '[]';
