ALTER TABLE "bot_flow_steps"
  ADD COLUMN IF NOT EXISTS "label"       TEXT,
  ADD COLUMN IF NOT EXISTS "capture_var" TEXT;
