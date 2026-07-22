CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'READ', 'DISMISSED');

CREATE TABLE "FinancialReminder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "financialItemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "offsetDays" INTEGER,
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialReminder_userId_idx" ON "FinancialReminder"("userId");
CREATE INDEX "FinancialReminder_financialItemId_idx" ON "FinancialReminder"("financialItemId");
CREATE INDEX "FinancialReminder_remindAt_idx" ON "FinancialReminder"("remindAt");
CREATE INDEX "FinancialReminder_userId_status_remindAt_idx" ON "FinancialReminder"("userId", "status", "remindAt");

ALTER TABLE "FinancialReminder"
ADD CONSTRAINT "FinancialReminder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialReminder"
ADD CONSTRAINT "FinancialReminder_financialItemId_fkey"
FOREIGN KEY ("financialItemId") REFERENCES "FinancialItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
