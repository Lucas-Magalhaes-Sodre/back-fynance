ALTER TABLE "User"
ADD COLUMN "lgpdAcceptedAt" TIMESTAMP(3),
ADD COLUMN "lgpdConsentVersion" TEXT,
ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dataDeletionRequestedAt" TIMESTAMP(3);
