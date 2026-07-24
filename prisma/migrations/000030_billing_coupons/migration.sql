CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');

ALTER TABLE "User"
ADD COLUMN "couponCodeSnapshot" TEXT,
ADD COLUMN "couponDiscountSnapshot" DECIMAL(12,2);

CREATE TABLE "BillingCoupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "discountType" "CouponDiscountType" NOT NULL,
  "discountValue" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "usageLimit" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "billingPlanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingCoupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCoupon_code_key" ON "BillingCoupon"("code");
CREATE INDEX "BillingCoupon_code_idx" ON "BillingCoupon"("code");
CREATE INDEX "BillingCoupon_active_idx" ON "BillingCoupon"("active");
CREATE INDEX "BillingCoupon_billingPlanId_idx" ON "BillingCoupon"("billingPlanId");

ALTER TABLE "BillingCoupon" ADD CONSTRAINT "BillingCoupon_billingPlanId_fkey"
FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
