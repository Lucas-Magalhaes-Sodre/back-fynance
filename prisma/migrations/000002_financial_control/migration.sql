ALTER TYPE "FinancialItemType" ADD VALUE IF NOT EXISTS 'INCOME';
ALTER TYPE "FinancialItemType" ADD VALUE IF NOT EXISTS 'EXPENSE';

CREATE TYPE "RecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

ALTER TABLE "FinancialItem"
ADD COLUMN "name" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "dueDay" INTEGER,
ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "month" INTEGER,
ADD COLUMN "year" INTEGER;

UPDATE "FinancialItem"
SET
  "name" = "title",
  "category" = CASE
    WHEN "type"::TEXT = 'FIXED_INCOME' THEN 'Receitas fixas'
    WHEN "type"::TEXT = 'EXTRA_INCOME' THEN 'Receitas extras'
    WHEN "type"::TEXT = 'FIXED_EXPENSE' THEN 'Despesas fixas'
    WHEN "type"::TEXT = 'EXTRA_EXPENSE' THEN 'Despesas extras'
    ELSE 'Outros'
  END,
  "dueDay" = CASE WHEN "dueDate" IS NOT NULL THEN EXTRACT(DAY FROM "dueDate")::INTEGER ELSE NULL END,
  "isFixed" = CASE WHEN "type"::TEXT IN ('FIXED_INCOME', 'FIXED_EXPENSE') THEN true ELSE false END,
  "recurrenceType" = CASE WHEN "type"::TEXT IN ('FIXED_INCOME', 'FIXED_EXPENSE') THEN 'MONTHLY'::"RecurrenceType" ELSE 'NONE'::"RecurrenceType" END,
  "month" = EXTRACT(MONTH FROM "date")::INTEGER,
  "year" = EXTRACT(YEAR FROM "date")::INTEGER;

ALTER TABLE "FinancialItem"
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "month" SET NOT NULL,
ALTER COLUMN "year" SET NOT NULL;

CREATE INDEX "FinancialItem_userId_year_idx" ON "FinancialItem"("userId", "year");
CREATE INDEX "FinancialItem_userId_year_month_idx" ON "FinancialItem"("userId", "year", "month");
CREATE INDEX "FinancialItem_userId_date_idx" ON "FinancialItem"("userId", "date");
