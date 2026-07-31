ALTER TABLE "BillingPlan"
ADD COLUMN "originalPrice" DECIMAL(12,2),
ADD COLUMN "productKeys" TEXT[] NOT NULL DEFAULT ARRAY[
  'dashboard',
  'financial-control',
  'cards',
  'savings',
  'goals',
  'birthdays',
  'vacation-calculator',
  'settings'
]::TEXT[];

ALTER TABLE "User"
ADD COLUMN "planProductKeysSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[
  'dashboard',
  'financial-control',
  'cards',
  'savings',
  'goals',
  'birthdays',
  'vacation-calculator',
  'settings'
]::TEXT[];

ALTER TABLE "SubscriptionTermsAcceptance"
ADD COLUMN "planProductKeys" TEXT[] NOT NULL DEFAULT ARRAY[
  'dashboard',
  'financial-control',
  'cards',
  'savings',
  'goals',
  'birthdays',
  'vacation-calculator',
  'settings'
]::TEXT[];
