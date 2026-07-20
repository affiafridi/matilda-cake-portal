ALTER TABLE "Conversation" ADD COLUMN "broadcastOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "broadcastOptOutAt" TIMESTAMP(3);
