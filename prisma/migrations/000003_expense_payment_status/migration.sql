CREATE TYPE "PaymentStatus" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO');

ALTER TABLE "FinancialItem"
ADD COLUMN "paymentDate" TIMESTAMP(3),
ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE';

UPDATE "FinancialItem"
SET "status" = CASE
  WHEN "type"::TEXT IN ('INCOME', 'FIXED_INCOME', 'EXTRA_INCOME') THEN 'PAGO'::"PaymentStatus"
  WHEN "dueDate" IS NOT NULL AND "dueDate" < CURRENT_DATE THEN 'ATRASADO'::"PaymentStatus"
  ELSE 'PENDENTE'::"PaymentStatus"
END;

CREATE INDEX "FinancialItem_status_idx" ON "FinancialItem"("status");
