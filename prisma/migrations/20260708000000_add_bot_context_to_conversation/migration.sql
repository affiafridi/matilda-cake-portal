-- Add bot context tracking fields to Conversation
ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "currentBotFlowId"    INTEGER,
  ADD COLUMN IF NOT EXISTS "currentBotFlowName"  TEXT,
  ADD COLUMN IF NOT EXISTS "currentBotStepKey"   TEXT,
  ADD COLUMN IF NOT EXISTS "botContextVariables" TEXT,
  ADD COLUMN IF NOT EXISTS "lastBotActivityAt"   TIMESTAMP(3);
