-- CreateTable: portal_settings
-- Key/value store for app-wide configuration (branding, feature flags).
-- Managed through /admin/settings and the /setup onboarding wizard.

CREATE TABLE IF NOT EXISTS "portal_settings" (
    "key"   TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "portal_settings_pkey" PRIMARY KEY ("key")
);
