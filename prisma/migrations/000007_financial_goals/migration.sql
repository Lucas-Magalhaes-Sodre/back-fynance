CREATE TYPE "FinancialGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

CREATE TABLE "FinancialGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "targetAmount" DECIMAL(12, 2) NOT NULL,
  "currentAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3) NOT NULL,
  "targetDate" TIMESTAMP(3),
  "category" TEXT,
  "status" "FinancialGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialGoal_userId_idx" ON "FinancialGoal"("userId");
CREATE INDEX "FinancialGoal_status_idx" ON "FinancialGoal"("status");
CREATE INDEX "FinancialGoal_targetDate_idx" ON "FinancialGoal"("targetDate");
CREATE INDEX "FinancialGoal_userId_status_idx" ON "FinancialGoal"("userId", "status");

ALTER TABLE "FinancialGoal"
ADD CONSTRAINT "FinancialGoal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Savings"
ADD CONSTRAINT "Savings_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
