ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "cookiesVersion" TEXT;

CREATE TABLE "SubscriptionTermsAcceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "billingPlanId" TEXT,
  "planName" TEXT NOT NULL,
  "planPrice" DECIMAL(12, 2) NOT NULL,
  "planCurrency" TEXT NOT NULL,
  "planDurationMonths" INTEGER NOT NULL,
  "couponCode" TEXT,
  "discountAmount" DECIMAL(12, 2),
  "finalPrice" DECIMAL(12, 2) NOT NULL,
  "paymentProvider" "PaymentProvider" NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "privacyVersion" TEXT NOT NULL,
  "cancellationVersion" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,

  CONSTRAINT "SubscriptionTermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionTermsAcceptance_userId_idx" ON "SubscriptionTermsAcceptance"("userId");
CREATE INDEX "SubscriptionTermsAcceptance_billingPlanId_idx" ON "SubscriptionTermsAcceptance"("billingPlanId");
CREATE INDEX "SubscriptionTermsAcceptance_acceptedAt_idx" ON "SubscriptionTermsAcceptance"("acceptedAt");

ALTER TABLE "SubscriptionTermsAcceptance" ADD CONSTRAINT "SubscriptionTermsAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
