ALTER TABLE "bot_flow_steps"
  ADD COLUMN IF NOT EXISTS "show_product_card" BOOLEAN NOT NULL DEFAULT false;
