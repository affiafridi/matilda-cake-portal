-- Team Inbox: Conversation, Message, InternalNote, QuickReply

CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED');
CREATE TYPE "MessageDirection"   AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "Conversation" (
  "id"              TEXT        NOT NULL,
  "waId"            TEXT        NOT NULL,
  "customerName"    TEXT        NOT NULL,
  "customerId"      TEXT,
  "assignedToId"    TEXT,
  "status"          "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "unreadCount"     INTEGER     NOT NULL DEFAULT 0,
  "lastMessageAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageBody" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_waId_key"       ON "Conversation"("waId");
CREATE INDEX "Conversation_status_idx"            ON "Conversation"("status");
CREATE INDEX "Conversation_assignedToId_idx"      ON "Conversation"("assignedToId");
CREATE INDEX "Conversation_lastMessageAt_idx"     ON "Conversation"("lastMessageAt");
CREATE INDEX "Conversation_customerId_idx"        ON "Conversation"("customerId");

CREATE TABLE "Message" (
  "id"             TEXT        NOT NULL,
  "conversationId" TEXT        NOT NULL,
  "waMessageId"    TEXT,
  "direction"      "MessageDirection" NOT NULL,
  "body"           TEXT,
  "mediaUrl"       TEXT,
  "mediaType"      TEXT,
  "sentById"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId") WHERE "waMessageId" IS NOT NULL;
CREATE INDEX "Message_conversationId_idx"     ON "Message"("conversationId");
CREATE INDEX "Message_createdAt_idx"          ON "Message"("createdAt");

CREATE TABLE "InternalNote" (
  "id"             TEXT        NOT NULL,
  "conversationId" TEXT        NOT NULL,
  "authorId"       TEXT,
  "body"           TEXT        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternalNote_conversationId_idx" ON "InternalNote"("conversationId");

CREATE TABLE "QuickReply" (
  "id"        TEXT        NOT NULL,
  "shortcut"  TEXT        NOT NULL,
  "body"      TEXT        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickReply_shortcut_key" ON "QuickReply"("shortcut");

-- Foreign keys
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_sentById_fkey"
  FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
