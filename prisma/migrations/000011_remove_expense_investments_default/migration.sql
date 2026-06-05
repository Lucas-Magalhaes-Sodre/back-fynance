DELETE FROM "FinancialCategory" category
WHERE category."type" = 'EXPENSE'
  AND category."name" = 'Investimentos'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialItem" item
    WHERE item."userId" = category."userId"
      AND item."type" = 'EXPENSE'
      AND item."category" = category."name"
  );
