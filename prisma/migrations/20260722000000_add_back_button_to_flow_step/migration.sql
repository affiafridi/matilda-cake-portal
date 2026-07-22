ALTER TABLE "bot_flow_steps"
  ADD COLUMN IF NOT EXISTS "back_button_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "back_button_label"   TEXT;
