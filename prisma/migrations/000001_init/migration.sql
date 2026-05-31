CREATE TYPE "FinancialItemType" AS ENUM ('FIXED_EXPENSE', 'EXTRA_EXPENSE', 'FIXED_INCOME', 'EXTRA_INCOME');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "type" "FinancialItemType" NOT NULL,
  "dueDate" TIMESTAMP(3),
  "date" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "FinancialItem_userId_idx" ON "FinancialItem"("userId");
CREATE INDEX "FinancialItem_type_idx" ON "FinancialItem"("type");
CREATE INDEX "FinancialItem_date_idx" ON "FinancialItem"("date");

ALTER TABLE "FinancialItem"
ADD CONSTRAINT "FinancialItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

