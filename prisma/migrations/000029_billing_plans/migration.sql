CREATE TABLE "BillingPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "durationMonths" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User"
ADD COLUMN "billingPlanId" TEXT,
ADD COLUMN "planNameSnapshot" TEXT,
ADD COLUMN "planPriceSnapshot" DECIMAL(12,2),
ADD COLUMN "planDurationMonthsSnapshot" INTEGER;

CREATE INDEX "BillingPlan_active_idx" ON "BillingPlan"("active");
CREATE INDEX "BillingPlan_sortOrder_idx" ON "BillingPlan"("sortOrder");

ALTER TABLE "User" ADD CONSTRAINT "User_billingPlanId_fkey"
FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "BillingPlan" ("id", "name", "description", "price", "currency", "durationMonths", "active", "sortOrder", "updatedAt")
VALUES
  ('plan_monthly_default', 'Plano mensal', 'Ideal para começar e validar a rotina financeira.', 24.90, 'BRL', 1, true, 10, CURRENT_TIMESTAMP),
  ('plan_yearly_default', 'Plano anual', 'Melhor custo para usar o sistema o ano inteiro.', 238.90, 'BRL', 12, true, 20, CURRENT_TIMESTAMP);
