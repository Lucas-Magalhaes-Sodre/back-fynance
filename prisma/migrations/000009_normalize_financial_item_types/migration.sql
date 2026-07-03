UPDATE "FinancialItem"
SET "type" = 'INCOME'::"FinancialItemType"
WHERE "type" IN ('FIXED_INCOME', 'EXTRA_INCOME');

UPDATE "FinancialItem"
SET "type" = 'EXPENSE'::"FinancialItemType"
WHERE "type" IN ('FIXED_EXPENSE', 'EXTRA_EXPENSE');
