-- Add custom API fields to bot_flow_options
ALTER TABLE "bot_flow_options"
  ADD COLUMN IF NOT EXISTS "custom_api_url"   TEXT,
  ADD COLUMN IF NOT EXISTS "custom_api_path"  TEXT,
  ADD COLUMN IF NOT EXISTS "custom_api_label" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_api_value" TEXT;
