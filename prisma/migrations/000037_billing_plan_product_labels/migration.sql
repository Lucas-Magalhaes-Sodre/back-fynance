ALTER TABLE "BillingPlan"
ADD COLUMN "productLabels" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "User"
ADD COLUMN "planProductLabelsSnapshot" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "SubscriptionTermsAcceptance"
ADD COLUMN "planProductLabels" JSONB NOT NULL DEFAULT '{}';
