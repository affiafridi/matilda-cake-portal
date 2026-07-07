ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "agent_requested" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "bot_flow_steps"
  ADD COLUMN IF NOT EXISTS "handoff_to_agent" BOOLEAN NOT NULL DEFAULT false;
