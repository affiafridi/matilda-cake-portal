-- CreateTable
CREATE TABLE "OrderAmountChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "changedById" TEXT,
    "prevTotal" DECIMAL(10,2),
    "prevAdvance" DECIMAL(10,2),
    "prevBalance" DECIMAL(10,2),
    "newTotal" DECIMAL(10,2),
    "newAdvance" DECIMAL(10,2),
    "newBalance" DECIMAL(10,2),
    "delta" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAmountChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderAmountChange_orderId_idx" ON "OrderAmountChange"("orderId");

-- CreateIndex
CREATE INDEX "OrderAmountChange_changedById_idx" ON "OrderAmountChange"("changedById");

-- CreateIndex
CREATE INDEX "OrderAmountChange_createdAt_idx" ON "OrderAmountChange"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderAmountChange" ADD CONSTRAINT "OrderAmountChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAmountChange" ADD CONSTRAINT "OrderAmountChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
