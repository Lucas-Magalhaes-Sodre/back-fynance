CREATE TABLE "CookieConsent" (
  "id" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "necessary" BOOLEAN NOT NULL DEFAULT true,
  "preferences" BOOLEAN NOT NULL DEFAULT false,
  "analytics" BOOLEAN NOT NULL DEFAULT false,
  "marketing" BOOLEAN NOT NULL DEFAULT false,
  "sourcePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CookieConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CookieConsent_visitorId_idx" ON "CookieConsent"("visitorId");
CREATE INDEX "CookieConsent_createdAt_idx" ON "CookieConsent"("createdAt");
