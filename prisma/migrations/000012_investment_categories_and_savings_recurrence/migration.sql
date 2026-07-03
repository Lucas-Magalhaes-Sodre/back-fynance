ALTER TYPE "FinancialItemType" ADD VALUE IF NOT EXISTS 'INVESTMENT';

ALTER TABLE "Savings"
ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Outros',
ADD COLUMN IF NOT EXISTS "isFixed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "recurrenceGroupId" TEXT;

UPDATE "Savings"
SET "category" = COALESCE(NULLIF("category", ''), 'Outros');

UPDATE "Savings"
SET "recurrenceGroupId" = "userId" || ':INVESTMENT:' || "category" || ':' || "title"
WHERE "isFixed" = true OR "recurrenceType" <> 'NONE';

CREATE INDEX IF NOT EXISTS "Savings_recurrenceGroupId_idx" ON "Savings"("recurrenceGroupId");
