ALTER TABLE "bot_flow_steps"
  ADD COLUMN IF NOT EXISTS "is_fallback" BOOLEAN NOT NULL DEFAULT false;
