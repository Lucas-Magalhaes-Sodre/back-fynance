ALTER TABLE "ReferralCoupon" ALTER COLUMN "discountValue" SET DEFAULT 5;
ALTER TABLE "ReferralCoupon" ALTER COLUMN "commissionValue" SET DEFAULT 5;

UPDATE "ReferralCoupon"
SET
  "discountValue" = 5,
  "commissionValue" = 5,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "discountType" = 'PERCENT'
  AND "commissionType" = 'PERCENT'
  AND "discountValue" = 10
  AND "commissionValue" = 10;

UPDATE "MarketingBanner"
SET
  "subtitle" = 'Compartilhe seu cupom com amigos, clientes e parceiros. Eles ganham 5% de desconto e você recebe 5% de comissão quando a contratação for confirmada.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'referral-dashboard';
