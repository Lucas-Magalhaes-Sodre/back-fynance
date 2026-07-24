CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('DEFAULT_TRIAL_DAYS', '14'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
