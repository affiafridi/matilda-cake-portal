CREATE TABLE "Broadcast" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "templateName"   TEXT NOT NULL,
  "templateLang"   TEXT NOT NULL DEFAULT 'en',
  "sentById"       TEXT,
  "status"         TEXT NOT NULL DEFAULT 'SENDING',
  "totalCount"     INTEGER NOT NULL DEFAULT 0,
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "readCount"      INTEGER NOT NULL DEFAULT 0,
  "failedCount"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

ALTER TABLE "Broadcast"
  ADD CONSTRAINT "Broadcast_sentById_fkey"
  FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BroadcastRecipient" (
  "id"           TEXT NOT NULL,
  "broadcastId"  TEXT NOT NULL,
  "waId"         TEXT NOT NULL,
  "customerName" TEXT,
  "phone"        TEXT,
  "waMessageId"  TEXT,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "errorMsg"     TEXT,
  "sentAt"       TIMESTAMP(3),
  "deliveredAt"  TIMESTAMP(3),
  "readAt"       TIMESTAMP(3),
  "failedAt"     TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BroadcastRecipient_waMessageId_key" ON "BroadcastRecipient"("waMessageId");
CREATE INDEX "BroadcastRecipient_broadcastId_idx" ON "BroadcastRecipient"("broadcastId");
CREATE INDEX "BroadcastRecipient_waMessageId_idx" ON "BroadcastRecipient"("waMessageId");
CREATE INDEX "BroadcastRecipient_waId_idx" ON "BroadcastRecipient"("waId");

ALTER TABLE "BroadcastRecipient"
  ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
