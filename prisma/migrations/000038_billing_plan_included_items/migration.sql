ALTER TABLE "BillingPlan"
ADD COLUMN "includedItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "User"
ADD COLUMN "planIncludedItemsSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "SubscriptionTermsAcceptance"
ADD COLUMN "planIncludedItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
