ALTER TABLE "FinancialReminder" ALTER COLUMN "financialItemId" DROP NOT NULL;

ALTER TABLE "FinancialReminder" ADD COLUMN "savingId" TEXT;

CREATE INDEX "FinancialReminder_savingId_idx" ON "FinancialReminder"("savingId");

ALTER TABLE "FinancialReminder"
ADD CONSTRAINT "FinancialReminder_savingId_fkey"
FOREIGN KEY ("savingId") REFERENCES "Savings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialReminder"
ADD CONSTRAINT "FinancialReminder_target_check"
CHECK ("financialItemId" IS NOT NULL OR "savingId" IS NOT NULL);
