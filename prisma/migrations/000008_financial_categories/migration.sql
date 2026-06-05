ALTER TABLE "User"
ADD COLUMN "financialCategoriesInitialized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FinancialCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinancialItemType" NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748B',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialCategory_userId_type_name_key" ON "FinancialCategory"("userId", "type", "name");
CREATE INDEX "FinancialCategory_userId_idx" ON "FinancialCategory"("userId");
CREATE INDEX "FinancialCategory_type_idx" ON "FinancialCategory"("type");

ALTER TABLE "FinancialCategory"
ADD CONSTRAINT "FinancialCategory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("userId" || ':INCOME:' || "category"), "userId", "category", 'INCOME'::"FinancialItemType", '#2563EB', CURRENT_TIMESTAMP
FROM "FinancialItem"
WHERE "type" IN ('INCOME', 'FIXED_INCOME', 'EXTRA_INCOME')
GROUP BY "userId", "category"
ON CONFLICT ("userId", "type", "name") DO NOTHING;

INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("userId" || ':EXPENSE:' || "category"), "userId", "category", 'EXPENSE'::"FinancialItemType", '#EA580C', CURRENT_TIMESTAMP
FROM "FinancialItem"
WHERE "type" IN ('EXPENSE', 'FIXED_EXPENSE', 'EXTRA_EXPENSE')
GROUP BY "userId", "category"
ON CONFLICT ("userId", "type", "name") DO NOTHING;
