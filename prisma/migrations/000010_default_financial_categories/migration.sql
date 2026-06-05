UPDATE "FinancialItem"
SET "category" = 'Salário'
WHERE "type" = 'INCOME' AND "category" = 'Salario';

UPDATE "FinancialItem"
SET "category" = 'Cartão de Crédito'
WHERE "type" = 'EXPENSE' AND "category" IN ('Cartoes', 'Cartões');

UPDATE "FinancialItem"
SET "category" = 'Alimentação'
WHERE "type" = 'EXPENSE' AND "category" = 'Alimentacao';

UPDATE "FinancialItem"
SET "category" = 'Saúde'
WHERE "type" = 'EXPENSE' AND "category" = 'Saude';

UPDATE "FinancialCategory" old
SET "name" = 'Salário'
WHERE old."type" = 'INCOME'
  AND old."name" = 'Salario'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Salário'
  );

UPDATE "FinancialCategory" old
SET "name" = 'Cartão de Crédito'
WHERE old."type" = 'EXPENSE'
  AND old."name" IN ('Cartoes', 'Cartões')
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Cartão de Crédito'
  );

UPDATE "FinancialCategory" old
SET "name" = 'Alimentação'
WHERE old."type" = 'EXPENSE'
  AND old."name" = 'Alimentacao'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Alimentação'
  );

UPDATE "FinancialCategory" old
SET "name" = 'Saúde'
WHERE old."type" = 'EXPENSE'
  AND old."name" = 'Saude'
  AND NOT EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Saúde'
  );

DELETE FROM "FinancialCategory"
WHERE "type" = 'INCOME' AND "name" = 'Pagamento';

DELETE FROM "FinancialCategory" old
WHERE old."type" = 'INCOME'
  AND old."name" = 'Salario'
  AND EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Salário'
  );

DELETE FROM "FinancialCategory" old
WHERE old."type" = 'EXPENSE'
  AND old."name" IN ('Cartoes', 'Cartões')
  AND EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Cartão de Crédito'
  );

DELETE FROM "FinancialCategory" old
WHERE old."type" = 'EXPENSE'
  AND old."name" = 'Alimentacao'
  AND EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Alimentação'
  );

DELETE FROM "FinancialCategory" old
WHERE old."type" = 'EXPENSE'
  AND old."name" = 'Saude'
  AND EXISTS (
    SELECT 1 FROM "FinancialCategory" target
    WHERE target."userId" = old."userId"
      AND target."type" = old."type"
      AND target."name" = 'Saúde'
  );

WITH defaults("name", "type", "color") AS (
  VALUES
    ('Salário', 'INCOME'::"FinancialItemType", '#2563EB'),
    ('Freelance', 'INCOME'::"FinancialItemType", '#0F766E'),
    ('Investimentos', 'INCOME'::"FinancialItemType", '#7C3AED'),
    ('Renda Extra', 'INCOME'::"FinancialItemType", '#16A34A'),
    ('Cashback/Reembolso', 'INCOME'::"FinancialItemType", '#0891B2'),
    ('Vendas', 'INCOME'::"FinancialItemType", '#DB2777'),
    ('Benefícios', 'INCOME'::"FinancialItemType", '#CA8A04'),
    ('Outros', 'INCOME'::"FinancialItemType", '#64748B'),
    ('Moradia', 'EXPENSE'::"FinancialItemType", '#DC2626'),
    ('Alimentação', 'EXPENSE'::"FinancialItemType", '#CA8A04'),
    ('Transporte', 'EXPENSE'::"FinancialItemType", '#0891B2'),
    ('Cartão de Crédito', 'EXPENSE'::"FinancialItemType", '#EA580C'),
    ('Saúde', 'EXPENSE'::"FinancialItemType", '#DB2777'),
    ('Educação', 'EXPENSE'::"FinancialItemType", '#7C3AED'),
    ('Assinaturas', 'EXPENSE'::"FinancialItemType", '#475569'),
    ('Lazer', 'EXPENSE'::"FinancialItemType", '#16A34A'),
    ('Impostos', 'EXPENSE'::"FinancialItemType", '#9333EA'),
    ('Compras', 'EXPENSE'::"FinancialItemType", '#F59E0B'),
    ('Investimentos', 'EXPENSE'::"FinancialItemType", '#2563EB'),
    ('Outros', 'EXPENSE'::"FinancialItemType", '#64748B')
)
INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("User"."id" || ':' || defaults."type"::text || ':' || defaults."name"),
       "User"."id",
       defaults."name",
       defaults."type",
       defaults."color",
       CURRENT_TIMESTAMP
FROM "User"
CROSS JOIN defaults
ON CONFLICT ("userId", "type", "name") DO NOTHING;
