CREATE TYPE "ReferralPayoutPreference" AS ENUM ('CREDIT', 'PIX');
CREATE TYPE "PixKeyType" AS ENUM ('CPF_CNPJ', 'EMAIL', 'PHONE', 'RANDOM');
CREATE TYPE "ReferralSettlementType" AS ENUM ('CREDIT', 'PIX');
CREATE TYPE "ReferralWithdrawalStatus" AS ENUM ('REQUESTED', 'PAID', 'CANCELED');

ALTER TABLE "User"
ADD COLUMN "referralPayoutPreference" "ReferralPayoutPreference" NOT NULL DEFAULT 'CREDIT',
ADD COLUMN "referralPayoutChangedAt" TIMESTAMP(3),
ADD COLUMN "referralPixKeyType" "PixKeyType",
ADD COLUMN "referralPixKey" TEXT,
ADD COLUMN "referralPixHolderName" TEXT,
ADD COLUMN "referralTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "referralTermsVersion" TEXT;

ALTER TABLE "ReferralCommission"
ADD COLUMN "availableAt" TIMESTAMP(3);

UPDATE "ReferralCommission"
SET "availableAt" = "createdAt" + INTERVAL '14 days'
WHERE "availableAt" IS NULL;

CREATE TABLE "ReferralWithdrawal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "ReferralWithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
  "pixKeyType" "PixKeyType" NOT NULL,
  "pixKey" TEXT NOT NULL,
  "pixHolderName" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCommissionSettlement" (
  "id" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "withdrawalId" TEXT,
  "type" "ReferralSettlementType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCommissionSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferralWithdrawal_userId_idx" ON "ReferralWithdrawal"("userId");
CREATE INDEX "ReferralWithdrawal_status_idx" ON "ReferralWithdrawal"("status");
CREATE INDEX "ReferralWithdrawal_requestedAt_idx" ON "ReferralWithdrawal"("requestedAt");
CREATE INDEX "ReferralCommissionSettlement_commissionId_idx" ON "ReferralCommissionSettlement"("commissionId");
CREATE INDEX "ReferralCommissionSettlement_withdrawalId_idx" ON "ReferralCommissionSettlement"("withdrawalId");
CREATE INDEX "ReferralCommissionSettlement_type_idx" ON "ReferralCommissionSettlement"("type");
CREATE INDEX "ReferralCommissionSettlement_createdAt_idx" ON "ReferralCommissionSettlement"("createdAt");

ALTER TABLE "ReferralWithdrawal" ADD CONSTRAINT "ReferralWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCommissionSettlement" ADD CONSTRAINT "ReferralCommissionSettlement_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "ReferralCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCommissionSettlement" ADD CONSTRAINT "ReferralCommissionSettlement_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "ReferralWithdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
