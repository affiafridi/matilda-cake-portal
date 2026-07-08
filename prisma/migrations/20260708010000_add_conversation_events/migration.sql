CREATE TABLE "ConversationEvent" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "actorName"      TEXT NOT NULL,
  "meta"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationEvent_conversationId_idx" ON "ConversationEvent"("conversationId");

ALTER TABLE "ConversationEvent"
  ADD CONSTRAINT "ConversationEvent_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
