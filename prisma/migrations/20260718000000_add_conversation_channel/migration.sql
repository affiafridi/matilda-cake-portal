-- Add channel field to Conversation to distinguish WhatsApp vs Instagram
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'whatsapp';
