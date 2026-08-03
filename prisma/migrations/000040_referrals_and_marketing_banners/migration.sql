CREATE TYPE "ReferralCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELED');

CREATE TABLE "ReferralCoupon" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "discountType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENT',
  "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 5,
  "commissionType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENT',
  "commissionValue" DECIMAL(12,2) NOT NULL DEFAULT 5,
  "planCommissions" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReferralCoupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCommission" (
  "id" TEXT NOT NULL,
  "referralCouponId" TEXT NOT NULL,
  "referrerUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "billingPlanId" TEXT,
  "subscriptionEventId" TEXT,
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingBanner" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL,
  "ctaLabel" TEXT,
  "ctaPath" TEXT,
  "location" TEXT NOT NULL DEFAULT 'DASHBOARD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingBanner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCoupon_userId_key" ON "ReferralCoupon"("userId");
CREATE UNIQUE INDEX "ReferralCoupon_code_key" ON "ReferralCoupon"("code");
CREATE INDEX "ReferralCoupon_code_idx" ON "ReferralCoupon"("code");
CREATE INDEX "ReferralCoupon_active_idx" ON "ReferralCoupon"("active");

CREATE INDEX "ReferralCommission_referralCouponId_idx" ON "ReferralCommission"("referralCouponId");
CREATE INDEX "ReferralCommission_referrerUserId_idx" ON "ReferralCommission"("referrerUserId");
CREATE INDEX "ReferralCommission_referredUserId_idx" ON "ReferralCommission"("referredUserId");
CREATE INDEX "ReferralCommission_billingPlanId_idx" ON "ReferralCommission"("billingPlanId");
CREATE INDEX "ReferralCommission_status_idx" ON "ReferralCommission"("status");
CREATE UNIQUE INDEX "ReferralCommission_referralCouponId_referredUserId_billingPlanId_key" ON "ReferralCommission"("referralCouponId", "referredUserId", "billingPlanId");

CREATE UNIQUE INDEX "MarketingBanner_key_key" ON "MarketingBanner"("key");
CREATE INDEX "MarketingBanner_location_idx" ON "MarketingBanner"("location");
CREATE INDEX "MarketingBanner_active_idx" ON "MarketingBanner"("active");
CREATE INDEX "MarketingBanner_sortOrder_idx" ON "MarketingBanner"("sortOrder");

ALTER TABLE "ReferralCoupon" ADD CONSTRAINT "ReferralCoupon_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referralCouponId_fkey"
FOREIGN KEY ("referralCouponId") REFERENCES "ReferralCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referrerUserId_fkey"
FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_billingPlanId_fkey"
FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "MarketingBanner" ("id", "key", "title", "subtitle", "ctaLabel", "ctaPath", "location", "active", "sortOrder", "updatedAt")
VALUES (
  'default-referral-dashboard-banner',
  'referral-dashboard',
  'Ganhe comissão indicando o Deluket Finance',
  'Compartilhe seu cupom com amigos, clientes e parceiros. Eles ganham 5% de desconto e você recebe 5% de comissão quando a contratação for confirmada.',
  'Ver meu cupom',
  '/app/profile',
  'DASHBOARD',
  true,
  10,
  CURRENT_TIMESTAMP
);
