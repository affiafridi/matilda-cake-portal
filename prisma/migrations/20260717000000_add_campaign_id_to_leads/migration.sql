-- Add campaignId to WhatsappLead for campaign attribution tracking
ALTER TABLE "WhatsappLead" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "WhatsappLead_campaignId_idx" ON "WhatsappLead"("campaignId");
