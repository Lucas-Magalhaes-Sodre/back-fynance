CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED', 'MANUAL');
CREATE TYPE "PaymentProvider" AS ENUM ('NONE', 'MERCADO_PAGO', 'STRIPE');
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'MONTHLY', 'YEARLY', 'LIFETIME');

ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "manualAccessUntil" TIMESTAMP(3),
ADD COLUMN "accessBlockedAt" TIMESTAMP(3),
ADD COLUMN "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN "providerCustomerId" TEXT,
ADD COLUMN "providerSubscriptionId" TEXT,
ADD COLUMN "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "lastPaymentAt" TIMESTAMP(3);

CREATE TABLE "SubscriptionEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerEventId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_userId_idx" ON "SubscriptionEvent"("userId");
CREATE INDEX "SubscriptionEvent_provider_idx" ON "SubscriptionEvent"("provider");
CREATE INDEX "SubscriptionEvent_eventType_idx" ON "SubscriptionEvent"("eventType");
CREATE INDEX "SubscriptionEvent_createdAt_idx" ON "SubscriptionEvent"("createdAt");

ALTER TABLE "SubscriptionEvent"
ADD CONSTRAINT "SubscriptionEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "User"
SET "trialEndsAt" = COALESCE("trialEndsAt", "createdAt" + INTERVAL '14 days')
WHERE "subscriptionStatus" = 'TRIALING';
