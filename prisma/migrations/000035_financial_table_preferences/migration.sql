CREATE TABLE "FinancialTablePreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupsSeparated" BOOLEAN NOT NULL DEFAULT false,
  "tableScale" INTEGER NOT NULL DEFAULT 0,
  "categoryColumnWidth" INTEGER NOT NULL DEFAULT 220,
  "categoryGroupsExpanded" BOOLEAN NOT NULL DEFAULT false,
  "subitemsExpanded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialTablePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialTablePreference_userId_key" ON "FinancialTablePreference"("userId");
CREATE INDEX "FinancialTablePreference_userId_idx" ON "FinancialTablePreference"("userId");

ALTER TABLE "FinancialTablePreference" ADD CONSTRAINT "FinancialTablePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
