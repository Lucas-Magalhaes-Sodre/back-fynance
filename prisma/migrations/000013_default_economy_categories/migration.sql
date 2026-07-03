INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("id" || ':INVESTMENT:Outros'), "id", 'Outros', 'INVESTMENT'::"FinancialItemType", '#D4A017', CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "type", "name") DO NOTHING;
