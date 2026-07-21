UPDATE "FinancialItem"
SET "category" = 'Cartões de Crédito'
WHERE "type" = 'EXPENSE'
  AND "category" = 'Cartão de Crédito';

UPDATE "FinancialCategory" singular
SET "name" = 'Cartões de Crédito'
WHERE singular."type" = 'EXPENSE'
  AND singular."name" = 'Cartão de Crédito'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialCategory" plural
    WHERE plural."userId" = singular."userId"
      AND plural."type" = singular."type"
      AND plural."name" = 'Cartões de Crédito'
  );

DELETE FROM "FinancialCategory" singular
WHERE singular."type" = 'EXPENSE'
  AND singular."name" = 'Cartão de Crédito'
  AND EXISTS (
    SELECT 1 FROM "FinancialCategory" plural
    WHERE plural."userId" = singular."userId"
      AND plural."type" = singular."type"
      AND plural."name" = 'Cartões de Crédito'
  );

INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("id" || ':EXPENSE:Cartões de Crédito'), "id", 'Cartões de Crédito', 'EXPENSE'::"FinancialItemType", '#EA580C', CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "type", "name") DO NOTHING;
