-- Add tags array and lastInboundAt to Conversation
ALTER TABLE "Conversation" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Conversation" ADD COLUMN "lastInboundAt" TIMESTAMP(3);

-- Add messageStatus to Message
ALTER TABLE "Message" ADD COLUMN "messageStatus" TEXT;

-- Backfill: outbound messages default to SENT
UPDATE "Message" SET "messageStatus" = 'SENT' WHERE "direction" = 'OUTBOUND';
