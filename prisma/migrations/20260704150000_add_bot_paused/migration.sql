-- Add human-takeover fields to Conversation
ALTER TABLE "Conversation" ADD COLUMN "botPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "lastHumanReplyAt" TIMESTAMP(3);

CREATE INDEX "Conversation_botPaused_idx" ON "Conversation"("botPaused");
CREATE INDEX "Conversation_lastHumanReplyAt_idx" ON "Conversation"("lastHumanReplyAt");
