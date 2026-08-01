ALTER TABLE "FinancialItem"
ADD COLUMN "excludedFromTotals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "linkedCreditCardId" TEXT,
ADD COLUMN "linkedCreditCardPurchaseId" TEXT,
ADD COLUMN "linkedCreditCardInstallments" INTEGER,
ADD COLUMN "linkedCreditCardAmount" DECIMAL(12, 2);

CREATE INDEX "FinancialItem_excludedFromTotals_idx" ON "FinancialItem"("excludedFromTotals");
CREATE INDEX "FinancialItem_linkedCreditCardId_idx" ON "FinancialItem"("linkedCreditCardId");
CREATE INDEX "FinancialItem_linkedCreditCardPurchaseId_idx" ON "FinancialItem"("linkedCreditCardPurchaseId");
