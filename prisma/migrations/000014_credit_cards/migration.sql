CREATE TABLE "CreditCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "purchaseDate" TIMESTAMP(3) NOT NULL,
  "installments" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditCardPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCard_userId_name_key" ON "CreditCard"("userId", "name");
CREATE INDEX "CreditCard_userId_idx" ON "CreditCard"("userId");
CREATE INDEX "CreditCardPurchase_userId_idx" ON "CreditCardPurchase"("userId");
CREATE INDEX "CreditCardPurchase_cardId_idx" ON "CreditCardPurchase"("cardId");
CREATE INDEX "CreditCardPurchase_purchaseDate_idx" ON "CreditCardPurchase"("purchaseDate");
CREATE INDEX "CreditCardPurchase_userId_cardId_idx" ON "CreditCardPurchase"("userId", "cardId");

ALTER TABLE "CreditCard"
ADD CONSTRAINT "CreditCard_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardPurchase"
ADD CONSTRAINT "CreditCardPurchase_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardPurchase"
ADD CONSTRAINT "CreditCardPurchase_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FinancialCategory" ("id", "userId", "name", "type", "color", "updatedAt")
SELECT md5("id" || ':EXPENSE:Cartão de Crédito'), "id", 'Cartão de Crédito', 'EXPENSE'::"FinancialItemType", '#EA580C', CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "type", "name") DO NOTHING;
