CREATE TABLE "Savings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "goalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Savings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Savings_userId_idx" ON "Savings"("userId");
CREATE INDEX "Savings_date_idx" ON "Savings"("date");
CREATE INDEX "Savings_goalId_idx" ON "Savings"("goalId");
CREATE INDEX "Savings_userId_year_idx" ON "Savings"("userId", "year");
CREATE INDEX "Savings_userId_year_month_idx" ON "Savings"("userId", "year", "month");
CREATE INDEX "Savings_userId_date_idx" ON "Savings"("userId", "date");

ALTER TABLE "Savings"
ADD CONSTRAINT "Savings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
