ALTER TABLE "FinancialItem"
ADD COLUMN "recurrenceGroupId" TEXT;

UPDATE "FinancialItem"
SET "recurrenceGroupId" = "userId" || ':' || "category" || ':' || "name"
WHERE "isFixed" = true OR "recurrenceType" <> 'NONE';

CREATE INDEX "FinancialItem_recurrenceGroupId_idx" ON "FinancialItem"("recurrenceGroupId");
